"""실행 설정. 값은 환경 변수에서 읽고, 키는 절대 출력하지 않는다."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

LAB_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = LAB_DIR.parent
SCENARIO_DIR = LAB_DIR / "scenarios"
RESULTS_DIR = LAB_DIR / "results"

DEFAULT_MODEL = "gemini-3.6-flash"


def load_dotenv_files() -> None:
    """ai_lab/.env, 저장소 루트 .env 순으로 읽어 아직 없는 변수만 채운다."""
    for path in (LAB_DIR / ".env", REPO_DIR / ".env"):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key and value and key not in os.environ:
                os.environ[key] = value


@dataclass(frozen=True)
class Settings:
    model: str
    temperature_reply: float
    timeout_ms: int
    retry_attempts: int
    max_user_turns: int | None  # None이면 시나리오 값 사용
    min_confidence: float
    rate_limit_max_wait_s: float  # 분당 한도(429)일 때 서버가 알려준 대기 시간이 이 이하면 기다렸다 재시도
    min_interval_s: float         # 호출 사이 최소 간격 (무료 등급 분당 한도 대비, 0이면 사용 안 함)

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv_files()
        turns = os.environ.get("BAITLAB_MAX_TURNS")
        return cls(
            model=os.environ.get("GEMINI_MODEL", DEFAULT_MODEL),
            temperature_reply=float(os.environ.get("BAITLAB_REPLY_TEMPERATURE", "0.9")),
            timeout_ms=int(os.environ.get("BAITLAB_TIMEOUT_MS", "60000")),
            retry_attempts=int(os.environ.get("BAITLAB_RETRY_ATTEMPTS", "3")),
            max_user_turns=int(turns) if turns else None,
            min_confidence=float(os.environ.get("BAITLAB_MIN_CONFIDENCE", "0.6")),
            rate_limit_max_wait_s=float(os.environ.get("BAITLAB_RATE_LIMIT_MAX_WAIT_S", "70")),
            min_interval_s=float(os.environ.get("BAITLAB_MIN_INTERVAL_S", "0")),
        )


def api_key() -> str | None:
    load_dotenv_files()
    return os.environ.get("GEMINI_API_KEY") or None


def load_scenario(scenario_id: str = "child_phone_broken") -> dict:
    return json.loads((SCENARIO_DIR / f"{scenario_id}.json").read_text(encoding="utf-8"))
