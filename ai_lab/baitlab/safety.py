"""생성된 메시지와 피드백의 사후 검증."""
from __future__ import annotations

import re

from .models import EndReason, EventType, FeedbackOut, Intent, Session

URL_PATTERN = re.compile(r"(https?://\S+|www\.\S+|\b[\w-]+\.(?:com|net|org|kr|io|ly|me|xyz|co|link|site|shop)\b\S*)", re.I)
NUMBER_PATTERN = re.compile(r"(\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b|\b\d{2,6}-\d{2,6}-\d{2,8}\b|\d{9,})")


def sanitize_reply(text: str, token: str, policy: str) -> tuple[str, list[str], bool]:
    """실제 URL·번호를 지우고 링크 토큰을 정책에 맞춘다. (문장, 메모, 링크 포함 여부)"""
    notes: list[str] = []
    cleaned = text
    if URL_PATTERN.search(cleaned.replace(token, "")):
        cleaned = URL_PATTERN.sub("[삭제됨]", cleaned)
        notes.append("redacted_url")
    if NUMBER_PATTERN.search(cleaned):
        cleaned = NUMBER_PATTERN.sub("[삭제됨]", cleaned)
        notes.append("redacted_number")

    has_token = token in cleaned
    if has_token and policy == "forbidden":
        cleaned = cleaned.replace(token, "").strip()
        has_token = False
        notes.append("removed_early_link")
    if not has_token and policy == "must_offer":
        cleaned = f"{cleaned.strip()}\n{token}"
        has_token = True
        notes.append("link_appended_by_app")
    return cleaned.strip(), notes, has_token


# 피드백에서 사실 확인이 필요한 단정 표현
CLICK_CLAIM = re.compile(r"링크를?\s*(여셨|열었|열어\s*보셨|눌렀|누르셨|눌러\s*보셨|클릭하셨|클릭했|접속하셨)")
NO_CLICK_CLAIM = re.compile(r"링크를?\s*(열지|누르지|클릭하지|안\s*누르|안\s*열)")
VERIFY_DONE_CLAIM = re.compile(r"(확인을?\s*(마치|마쳤|완료)|확인하셨|확인해\s*보셨|통화하셨|전화하셨)")
VERIFY_INTENT_CLAIM = re.compile(r"(직접\s*확인|원래\s*(번호|연락처)|평소\s*(알던|알고))")
# 사칭자('상대')에게 연락하라는 조언
CONTACT_SENDER_ADVICE = re.compile(r"상대방?\s*(에게|한테|의\s*(원래\s*)?(번호|연락처)|번호로)[^.]{0,20}(전화|연락|확인)")


def validate_feedback(feedback: FeedbackOut, session: Session, token: str) -> list[str]:
    """기록되지 않은 행동을 단정하는지 검사한다. 문제가 있으면 사유 목록을 돌려준다."""
    text = " ".join([feedback.headline, feedback.what_happened, *feedback.good_points, *feedback.next_time])
    problems: list[str] = []
    clicked = session.has_event(EventType.LINK_CLICKED)
    verified = any(t.applied_intent == Intent.VERIFY_INDEPENDENT for t in session.turns)

    if CLICK_CLAIM.search(text) and not clicked:
        problems.append("claims_click_without_event")
    if NO_CLICK_CLAIM.search(feedback.headline + feedback.what_happened) and clicked:
        problems.append("denies_recorded_click")
    if VERIFY_DONE_CLAIM.search(text):
        problems.append("claims_verification_completed")  # 시뮬레이션에서 확인 완료는 관찰할 수 없다
    if VERIFY_INTENT_CLAIM.search(feedback.headline + " ".join(feedback.good_points)) and not verified:
        problems.append("claims_verify_intent_without_record")
    if CONTACT_SENDER_ADVICE.search(" ".join(feedback.next_time)):
        problems.append("advises_contacting_sender")
    if session.end_reason == EndReason.USER_STOPPED and re.search(r"(성공|실패|잘하셨|잘못)", feedback.headline):
        problems.append("judges_stopped_session")
    if URL_PATTERN.search(text) or NUMBER_PATTERN.search(text) or token in text:
        problems.append("contains_link_or_number")
    if not feedback.headline.strip() or not feedback.what_happened.strip():
        problems.append("empty_fields")
    return problems


def fallback_feedback(scenario: dict, end_reason: str) -> FeedbackOut:
    base = scenario["fallback_feedback"][end_reason]
    return FeedbackOut(headline=base["headline"], what_happened=base["what_happened"], good_points=[], next_time=base["next_time"])
