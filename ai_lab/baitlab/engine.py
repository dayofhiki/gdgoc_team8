"""상태 전이와 종료 판단. Gemini 없이 동작하며 최종 결정은 여기서 한다."""
from __future__ import annotations

import re

from .models import EndReason, Event, EventType, Intent, Session, TurnRecord, UtteranceAnalysis

TERMINAL_INTENTS = {
    Intent.REFUSE: EndReason.REFUSED,
    Intent.VERIFY_INDEPENDENT: EndReason.VERIFIED_INDEPENDENTLY,
    Intent.STOP: EndReason.USER_STOPPED,
}

# 상대가 제공한 연락 수단을 가리키는 표현. 이 경우 직접 확인으로 확정하지 않는다.
SENDER_CONTACT_PATTERN = re.compile(r"(보내\s*준|알려\s*준|방금\s*준|네가\s*준|니가\s*준|이\s*번호|그\s*번호|새\s*번호|임시\s*번호|지금\s*번호)")


class SessionEnded(Exception):
    pass


def new_session(scenario: dict, max_user_turns: int | None = None) -> Session:
    return Session(
        scenario_id=scenario["id"],
        max_user_turns=max_user_turns or scenario["max_user_turns"],
        link_offer_after_user_turns=scenario["link"]["offer_after_user_turns"],
    )


def _normalize(text: str) -> str:
    return re.sub(r"\s+", "", text)


def validate_analysis(analysis: UtteranceAnalysis, user_text: str, min_confidence: float) -> tuple[Intent, list[str]]:
    """모델 제안을 검증해 상태에 반영할 의도를 정한다. 근거가 부족하면 UNCLEAR로 낮춘다."""
    intent = analysis.intent
    notes: list[str] = []
    if intent not in TERMINAL_INTENTS:
        return intent, notes

    if analysis.confidence < min_confidence:
        notes.append(f"low_confidence({analysis.confidence:.2f})")
        return Intent.UNCLEAR, notes
    if not analysis.evidence.strip() or _normalize(analysis.evidence) not in _normalize(user_text):
        notes.append("evidence_not_in_utterance")
        return Intent.UNCLEAR, notes
    if intent is Intent.VERIFY_INDEPENDENT and (analysis.uses_sender_contact or SENDER_CONTACT_PATTERN.search(user_text)):
        notes.append("verify_uses_sender_contact")
        return Intent.UNCLEAR, notes
    return intent, notes


def apply_user_turn(
    session: Session,
    user_text: str,
    analysis: UtteranceAnalysis | None,
    min_confidence: float,
    error: str | None = None,
) -> TurnRecord:
    """사용자 발화 1회를 반영한다. 분석이 없거나 실패하면 판단 어려움으로 기록한다."""
    if session.ended:
        raise SessionEnded(session.end_reason)

    if analysis is None:
        intent, notes = Intent.UNCLEAR, [f"analysis_failed: {error or 'unknown'}"]
    else:
        intent, notes = validate_analysis(analysis, user_text, min_confidence)
        if analysis.link_click_intent:
            notes.append("link_click_intent_only")  # 말로 한 클릭 의사. 실제 클릭으로 기록하지 않는다.

    record = TurnRecord(
        user_turn=session.user_turns + 1,
        user_text=user_text,
        raw_analysis=analysis.model_dump(mode="json") if analysis else None,
        applied_intent=intent.value,
        notes=notes,
    )
    session.turns.append(record)

    if intent in TERMINAL_INTENTS:
        session.end_reason = TERMINAL_INTENTS[intent].value
    elif session.user_turns >= session.max_user_turns:
        session.end_reason = EndReason.INCONCLUSIVE.value
    return record


def apply_event(session: Session, event_type: EventType) -> Event:
    """모의 행동 이벤트를 반영한다. 링크 클릭은 링크가 실제로 제시된 뒤에만 허용한다."""
    if session.ended:
        raise SessionEnded(session.end_reason)
    if event_type is EventType.LINK_CLICKED and not session.link_offered:
        raise ValueError("아직 모의 링크가 제시되지 않아 클릭 이벤트를 받을 수 없습니다.")

    event = Event(type=event_type.value, user_turn=session.user_turns)
    session.events.append(event)
    session.end_reason = (
        EndReason.LINK_CLICKED.value if event_type is EventType.LINK_CLICKED else EndReason.USER_STOPPED.value
    )
    return event


def link_policy(session: Session) -> str:
    """이번 상대 메시지에서 링크를 어떻게 다룰지: 'forbidden' | 'must_offer' | 'offered'."""
    if session.link_offered:
        return "offered"
    if session.user_turns >= session.link_offer_after_user_turns:
        return "must_offer"
    return "forbidden"
