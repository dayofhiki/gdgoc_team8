"""대화 생성 → 발화 해석 → 상태 전이 → 피드백을 잇는 실행기. CLI와 평가기가 함께 쓴다."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Protocol

from . import engine, safety
from .config import RESULTS_DIR
from .gemini import GeminiError
from .models import EventType, FeedbackOut, Message, Session, TurnRecord, UtteranceAnalysis


class AI(Protocol):
    def reply(self, session: Session, policy: str) -> str: ...
    def classify(self, session: Session, utterance: str) -> UtteranceAnalysis: ...
    def feedback(self, session: Session) -> FeedbackOut: ...


class Trainer:
    def __init__(self, scenario: dict, ai: AI, min_confidence: float = 0.6, max_user_turns: int | None = None):
        self.scenario, self.ai, self.min_confidence = scenario, ai, min_confidence
        self.session = engine.new_session(scenario, max_user_turns)
        self.token = scenario["link"]["token"]

    def _impostor_says(self) -> str:
        policy = engine.link_policy(self.session)
        try:
            raw = self.ai.reply(self.session, policy)
        except GeminiError as e:
            if e.fatal:
                raise
            raw = self.scenario["fallback_reply"]
            self.session.notes.append(f"reply_fallback: {e.kind}")
        text, notes, has_link = safety.sanitize_reply(raw, self.token, policy)
        if not text.replace(self.token, "").strip():
            text, _, has_link = safety.sanitize_reply(self.scenario["fallback_reply"], self.token, policy)
        if has_link:
            self.session.link_offered = True
        self.session.notes.extend(f"turn{self.session.user_turns}: {n}" for n in notes)
        self.session.messages.append(Message("impostor", text, self.session.user_turns))
        return text

    def start(self) -> str:
        return self._impostor_says()

    def user_says(self, text: str) -> tuple[TurnRecord, str | None]:
        """사용자 발화 처리. (발화 기록, 종료되지 않았다면 상대의 다음 메시지)"""
        if self.session.ended:
            raise engine.SessionEnded(self.session.end_reason)
        analysis, error = None, None
        try:
            analysis = self.ai.classify(self.session, text)
        except GeminiError as e:
            if e.fatal:
                raise
            error = str(e)  # 해석 실패는 판단 어려움으로 기록하고 진행한다
        self.session.messages.append(Message("user", text, self.session.user_turns + 1))
        record = engine.apply_user_turn(self.session, text, analysis, self.min_confidence, error)
        return record, (None if self.session.ended else self._impostor_says())

    def click_link(self) -> None:
        engine.apply_event(self.session, EventType.LINK_CLICKED)

    def stop(self) -> None:
        engine.apply_event(self.session, EventType.USER_STOP)

    def finish(self) -> FeedbackOut:
        """종료 후 피드백. 생성 실패나 사실과 다른 내용이면 시나리오의 기본 문구를 쓴다."""
        assert self.session.ended, "훈련이 아직 끝나지 않았습니다."
        try:
            feedback = self.ai.feedback(self.session)
            problems = safety.validate_feedback(feedback, self.session, self.token)
            source = "gemini"
            if problems:
                self.session.notes.append(f"feedback_rejected: {problems} / {feedback.model_dump_json()}")
                feedback, source = safety.fallback_feedback(self.scenario, self.session.end_reason), "fallback"
        except GeminiError as e:
            self.session.notes.append(f"feedback_error: {e}")
            feedback, source = safety.fallback_feedback(self.scenario, self.session.end_reason), "fallback"
        self.session.feedback, self.session.feedback_source = feedback.model_dump(), source
        return feedback

    def save(self, prefix: str = "session", extra: dict | None = None) -> str:
        RESULTS_DIR.mkdir(exist_ok=True)
        path = RESULTS_DIR / f"{prefix}-{datetime.now():%Y%m%d-%H%M%S-%f}.json"
        path.write_text(json.dumps({**(extra or {}), "session": self.session.to_dict()}, ensure_ascii=False, indent=2), encoding="utf-8")
        return str(path)
