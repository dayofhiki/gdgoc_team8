"""Gemini 없이 실행하는 상태 전이·이벤트·검증 테스트."""
import pytest

from baitlab import engine, safety
from baitlab.config import load_scenario
from baitlab.gemini import GeminiError
from baitlab.models import EventType, FeedbackOut, Intent, UtteranceAnalysis
from baitlab.trainer import Trainer

SCENARIO = load_scenario()
TOKEN = SCENARIO["link"]["token"]


def A(intent, evidence="", confidence=0.9, click=False, sender=False):
    return UtteranceAnalysis(intent=intent, confidence=confidence, evidence=evidence, reason="test",
                             link_click_intent=click, uses_sender_contact=sender)


class FakeAI:
    """미리 정한 분석 결과를 돌려주는 가짜 AI."""

    def __init__(self, analyses=(), feedback=None, reply="엄마 나 폰 고장났어 ㅠㅠ"):
        self.analyses, self._feedback, self._reply = list(analyses), feedback, reply

    def reply(self, session, policy):
        return self._reply

    def classify(self, session, utterance):
        item = self.analyses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    def feedback(self, session):
        if self._feedback is None:
            raise GeminiError("server", "test", False)
        return self._feedback


def make(analyses=(), **kw):
    t = Trainer(SCENARIO, FakeAI(analyses, **kw))
    t.start()
    return t


# --- 문서 1.6의 테스트 사례 ---

def test_question_continues():
    t = make([A(Intent.CONTINUE, "무슨 일이야")])
    record, reply = t.user_says("무슨 일이야?")
    assert not t.session.ended and reply


def test_verify_with_known_number_ends():
    t = make([A(Intent.VERIFY_INDEPENDENT, "원래 번호로 전화해 볼게")])
    t.user_says("네 원래 번호로 전화해 볼게.")
    assert t.session.end_reason == "verified_independently"


@pytest.mark.parametrize("sender_flag", [True, False])
def test_sender_number_is_not_independent_verification(sender_flag):
    # 모델이 잘못 verify_independent로 분류해도 상대가 준 번호면 확정하지 않는다
    t = make([A(Intent.VERIFY_INDEPENDENT, "보내준 번호로 전화할게", sender=sender_flag)])
    record, _ = t.user_says("보내준 번호로 전화할게.")
    assert record.applied_intent == Intent.UNCLEAR
    assert not t.session.ended


def test_refuse_ends():
    t = make([A(Intent.REFUSE, "링크는 안 누를게")])
    t.user_says("링크는 안 누를게.")
    assert t.session.end_reason == "refused"


def test_click_intent_is_not_click():
    t = make([A(Intent.COMPLY, "눌러볼게", click=True)])
    record, _ = t.user_says("눌러볼게.")
    assert not t.session.ended
    assert not t.session.has_event(EventType.LINK_CLICKED)
    assert "link_click_intent_only" in record.notes


def test_click_event_ends_after_link_offered():
    t = make([A(Intent.CONTINUE, "뭐"), A(Intent.CONTINUE, "어떤")])
    t.user_says("뭐?")
    t.user_says("어떤 결제?")  # 2회 이후 링크 제시
    assert t.session.link_offered
    t.click_link()
    assert t.session.end_reason == "link_clicked"


def test_click_before_link_rejected():
    t = make()
    with pytest.raises(ValueError):
        t.click_link()


def test_doubt_question_is_not_verification():
    t = make([A(Intent.CONTINUE, "진짜 내 딸 맞아")])
    record, _ = t.user_says("진짜 내 딸 맞아?")
    assert record.applied_intent == Intent.CONTINUE and not t.session.ended


def test_stop_by_utterance_and_event():
    t = make([A(Intent.STOP, "그만할래")])
    t.user_says("그만할래.")
    assert t.session.end_reason == "user_stopped"
    t2 = make()
    t2.stop()
    assert t2.session.end_reason == "user_stopped"


def test_inconclusive_after_max_turns():
    t = make([A(Intent.UNCLEAR, "")] * 6)
    for _ in range(6):
        t.user_says("음")
    assert t.session.end_reason == "inconclusive"


# --- 검증 로직 ---

def test_low_confidence_or_missing_evidence_downgrades():
    t = make([A(Intent.REFUSE, "안 해", confidence=0.3), A(Intent.REFUSE, "지어낸 근거")])
    assert t.user_says("안 해")[0].applied_intent == Intent.UNCLEAR
    assert t.user_says("글쎄")[0].applied_intent == Intent.UNCLEAR
    assert not t.session.ended


def test_classification_failure_is_unclear_not_success():
    t = make([GeminiError("invalid_output", "bad json", False)])
    record, _ = t.user_says("링크는 안 누를게")
    assert record.applied_intent == Intent.UNCLEAR and not t.session.ended


def test_fatal_error_propagates():
    t = make([GeminiError("quota", "429", True)])
    with pytest.raises(GeminiError):
        t.user_says("뭐야")


def test_reply_sanitizer():
    text, notes, has = safety.sanitize_reply("여기 눌러 https://evil.example.com 010-1234-5678", TOKEN, "forbidden")
    assert "http" not in text and "010" not in text and not has
    text, notes, has = safety.sanitize_reply(f"이거 눌러줘 {TOKEN}", TOKEN, "forbidden")
    assert TOKEN not in text and "removed_early_link" in notes
    text, notes, has = safety.sanitize_reply("확인 좀 해줘", TOKEN, "must_offer")
    assert has and "link_appended_by_app" in notes


def test_feedback_claiming_click_without_event_is_replaced():
    bad = FeedbackOut(headline="링크를 누르셨어요.", what_happened="상대가 보낸 링크를 열었어요.", good_points=[], next_time=["확인해 보세요"])
    t = make([A(Intent.REFUSE, "안 할래")], feedback=bad)
    t.user_says("안 할래")
    fb = t.finish()
    assert t.session.feedback_source == "fallback"
    assert fb.headline == SCENARIO["fallback_feedback"]["refused"]["headline"]


def test_feedback_claiming_verification_without_record_is_replaced():
    bad = FeedbackOut(headline="직접 확인하려는 태도가 좋았어요.", what_happened="대화가 끝났어요.", good_points=["평소 알던 번호로 확인"], next_time=[])
    t = make(feedback=bad)
    t.stop()
    t.finish()
    assert t.session.feedback_source == "fallback"


def test_valid_feedback_is_kept_and_failure_falls_back():
    good = FeedbackOut(headline="요청을 거절했어요.", what_happened="'안 할래'라고 답하셨어요.", good_points=["분명하게 거절했어요"], next_time=["원래 번호로 확인해 보세요"])
    t = make([A(Intent.REFUSE, "안 할래")], feedback=good)
    t.user_says("안 할래")
    assert t.finish().headline == good.headline and t.session.feedback_source == "gemini"

    t2 = make()  # feedback=None → API 실패
    t2.stop()
    t2.finish()
    assert t2.session.feedback_source == "fallback"


def test_session_rejects_input_after_end():
    t = make()
    t.stop()
    with pytest.raises(engine.SessionEnded):
        t.user_says("다시")


def test_quota_info_distinguishes_per_minute_and_daily():
    from google.genai import errors
    from baitlab.gemini import _quota_info

    def err(quota_id, delay="21s"):
        return errors.APIError(429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "quota", "details": [
            {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaId": quota_id}]},
            {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": delay},
        ]}})

    assert _quota_info(err("GenerateRequestsPerMinutePerProjectPerModel-FreeTier")) == (21.0, True)
    assert _quota_info(err("GenerateRequestsPerDayPerProjectPerModel-FreeTier"))[1] is False


@pytest.mark.parametrize("advice,bad", [
    ("상대방에게 직접 전화하여 본인 확인하기", True),
    ("상대의 원래 번호로 직접 전화해서 사실여부를 확인해 보세요.", True),
    ("평소 알고 있던 자녀 번호로 직접 전화해 확인해 보세요.", False),
    ("상대가 보낸 링크는 누르지 마세요.", False),
])
def test_feedback_advising_to_contact_sender_is_rejected(advice, bad):
    fb = FeedbackOut(headline="훈련을 마쳤어요.", what_happened="대화가 끝났어요.", good_points=[], next_time=[advice])
    t = make()
    t.stop()
    assert ("advises_contacting_sender" in safety.validate_feedback(fb, t.session, TOKEN)) is bad
