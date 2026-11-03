"""공식 Google GenAI SDK(google-genai) 호출과 오류 정리."""
from __future__ import annotations

import re
import sys
import time
from dataclasses import dataclass

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from .config import Settings, api_key

RATE_LIMIT_DOC = "https://ai.google.dev/gemini-api/docs/rate-limits"


class GeminiError(Exception):
    """사용자에게 보여줄 수 있는 형태로 정리한 Gemini 오류."""

    def __init__(self, kind: str, message: str, fatal: bool):
        super().__init__(message)
        self.kind = kind      # missing_key | auth | quota | model | bad_request | server | network | invalid_output
        self.fatal = fatal    # True면 재시도해도 해결되지 않으므로 실행을 멈춘다

    def __str__(self) -> str:
        return f"[Gemini {self.kind}] {self.args[0]}"


def _from_api_error(e: errors.APIError, model: str) -> GeminiError:
    code, status, msg = e.code, e.status or "", (e.message or "").strip()
    if code == 429:
        _, per_minute = _quota_info(e)
        scope = "분당 한도. 잠시 후 다시 시도하거나 BAITLAB_MIN_INTERVAL_S로 호출 간격을 늘리세요" if per_minute else "일일 또는 요금제 한도일 수 있습니다. AI Studio에서 사용량·요금제를 확인하세요"
        return GeminiError("quota", f"사용 한도 초과 (429 {status}): {scope}. {RATE_LIMIT_DOC}\n  서버 메시지: {msg}", True)
    if code in (401, 403) or "API key" in msg:
        return GeminiError("auth", f"API 키 인증 실패 ({code} {status}). GEMINI_API_KEY 값과 키의 프로젝트 권한을 확인하세요.\n  서버 메시지: {msg}", True)
    if code == 404:
        return GeminiError("model", f"모델 '{model}'을(를) 찾을 수 없습니다 (404). GEMINI_MODEL 설정을 확인하세요.\n  서버 메시지: {msg}", True)
    if code == 400:
        return GeminiError("bad_request", f"요청 형식 오류 (400 {status}).\n  서버 메시지: {msg}", True)
    if code >= 500:
        return GeminiError("server", f"Gemini 서버 오류 ({code} {status}). 재시도 후에도 실패했습니다.\n  서버 메시지: {msg}", False)
    return GeminiError("api", f"API 오류 ({code} {status}): {msg}", True)


def _quota_info(e: errors.APIError) -> tuple[float | None, bool]:
    """429 응답에서 (서버가 알려준 재시도 대기 초, 분당 한도인지)를 읽는다. 일일 한도면 기다려도 소용없다."""
    body = e.details.get("error", {}) if isinstance(e.details, dict) else {}
    delay, per_minute = None, False
    for d in body.get("details", []) or []:
        if "retryDelay" in d:
            delay = float(str(d["retryDelay"]).rstrip("s") or 0)
        for v in d.get("violations", []) or []:
            quota_id = v.get("quotaId", "")
            if "PerDay" in quota_id:
                return delay, False
            per_minute |= "PerMinute" in quota_id
    msg = e.message or ""
    if delay is None and (m := re.search(r"retry in ([\d.]+)s", msg)):
        delay = float(m.group(1))
    return delay, per_minute or "per minute" in msg.lower()


@dataclass
class CallStats:
    calls: int = 0
    total_ms: float = 0.0   # 대기 시간 제외한 호출 시간
    wait_ms: float = 0.0    # 한도 대기·간격 조절로 쉰 시간


class GeminiClient:
    def __init__(self, settings: Settings):
        key = api_key()
        if not key:
            raise GeminiError("missing_key", "GEMINI_API_KEY 환경 변수가 없습니다. README의 '키 설정'을 참고하세요.", True)
        self.settings = settings
        self.stats = CallStats()
        self._client = genai.Client(
            api_key=key,
            http_options=types.HttpOptions(
                timeout=settings.timeout_ms,
                # 429는 짧은 지수 재시도로 풀리지 않으므로 아래 _generate에서 서버 안내 시간만큼 기다린다
                retry_options=types.HttpRetryOptions(
                    attempts=settings.retry_attempts,
                    http_status_codes=[408, 500, 502, 503, 504],
                ),
            ),
        )
        self._last_call = 0.0

    def _sleep(self, seconds: float) -> None:
        time.sleep(seconds)
        self.stats.wait_ms += seconds * 1000

    def _generate(self, system: str, contents: list[types.Content], config: dict) -> types.GenerateContentResponse:
        model = self.settings.model
        for attempt in range(3):
            gap = self.settings.min_interval_s - (time.monotonic() - self._last_call)
            if gap > 0:
                self._sleep(gap)
            started = time.perf_counter()
            self._last_call = time.monotonic()
            try:
                return self._client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(system_instruction=system, **config),
                )
            except errors.APIError as e:
                if e.code == 429 and attempt < 2:
                    delay, per_minute = _quota_info(e)
                    if per_minute and delay is not None and delay <= self.settings.rate_limit_max_wait_s:
                        print(f"   … 분당 사용 한도 도달. {delay:.0f}초 기다린 뒤 다시 시도합니다.", file=sys.stderr, flush=True)
                        self._sleep(delay + 1)
                        continue
                raise _from_api_error(e, model) from None
            except (httpx.TimeoutException, httpx.NetworkError) as e:
                raise GeminiError("network", f"네트워크 오류 또는 시간 초과: {type(e).__name__}", False) from None
            finally:
                self.stats.calls += 1
                self.stats.total_ms += (time.perf_counter() - started) * 1000
        raise AssertionError("unreachable")

    def text(self, system: str, contents: list[types.Content], temperature: float) -> str:
        response = self._generate(system, contents, {"temperature": temperature})
        text = (response.text or "").strip()
        if not text:
            raise GeminiError("invalid_output", f"빈 응답 (finish_reason={_finish_reason(response)})", False)
        return text

    def json(self, system: str, contents: list[types.Content], schema: type[BaseModel], temperature: float = 0.0) -> BaseModel:
        response = self._generate(
            system,
            contents,
            {
                "temperature": temperature,
                "response_mime_type": "application/json",
                "response_json_schema": schema.model_json_schema(),
            },
        )
        try:
            return schema.model_validate_json(response.text or "")
        except ValidationError as e:
            raise GeminiError("invalid_output", f"응답이 {schema.__name__} 형식에 맞지 않음: {e.error_count()}개 오류 (finish_reason={_finish_reason(response)})", False) from None


def _finish_reason(response: types.GenerateContentResponse) -> str:
    try:
        return str(response.candidates[0].finish_reason)
    except (TypeError, IndexError, AttributeError):
        return "unknown"


def user(text: str) -> types.Content:
    return types.Content(role="user", parts=[types.Part.from_text(text=text)])


def model(text: str) -> types.Content:
    return types.Content(role="model", parts=[types.Part.from_text(text=text)])
