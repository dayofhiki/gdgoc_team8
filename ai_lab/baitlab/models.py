"""훈련 데이터 구조. FE/BE 연동 시 그대로 JSON으로 주고받을 수 있게 단순하게 유지한다."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import StrEnum

from pydantic import BaseModel, Field


class Intent(StrEnum):
    REFUSE = "refuse"                          # 요청 거절
    VERIFY_INDEPENDENT = "verify_independent"  # 평소 알던 연락처 등으로 직접 확인 의사
    COMPLY = "comply"                          # 요청 수락 의사 (클릭 의사 포함, 실제 클릭 아님)
    CONTINUE = "continue"                      # 질문·의심 표현 등 대화 계속
    STOP = "stop"                              # 훈련 중단 요청
    UNCLEAR = "unclear"                        # 판단 어려움


class EventType(StrEnum):
    LINK_CLICKED = "link_clicked"  # 모의 링크 실제 클릭 (FE 또는 로컬 명령)
    USER_STOP = "user_stop"        # 중단 버튼/명령


class EndReason(StrEnum):
    LINK_CLICKED = "link_clicked"
    REFUSED = "refused"
    VERIFIED_INDEPENDENTLY = "verified_independently"
    USER_STOPPED = "user_stopped"
    INCONCLUSIVE = "inconclusive"


class UtteranceAnalysis(BaseModel):
    """Gemini가 제안하는 발화 해석. 프로그램이 검증한 뒤에만 상태에 반영한다."""
    intent: Intent
    confidence: float = Field(ge=0.0, le=1.0, description="0~1 사이 확신도")
    evidence: str = Field(description="판단 근거가 된 사용자 발화 속 구절을 그대로 인용. 없으면 빈 문자열")
    reason: str = Field(description="판단 이유 한 문장")
    link_click_intent: bool = Field(description="링크를 누르겠다는 의사를 말로만 표현했는지")
    uses_sender_contact: bool = Field(description="상대(사칭자)가 알려준 번호·링크·연락 수단으로 확인하려 하는지")


class FeedbackOut(BaseModel):
    headline: str = Field(description="결과를 한 문장으로")
    what_happened: str = Field(description="실제로 기록된 발화·이벤트만 근거로 무슨 일이 있었는지 설명")
    good_points: list[str] = Field(description="잘한 점. 근거가 없으면 빈 배열")
    next_time: list[str] = Field(description="다음에 해볼 수 있는 확인 방법 1~3개")


@dataclass
class Message:
    role: str  # "impostor" | "user"
    text: str
    user_turn: int  # 이 메시지 시점의 사용자 답변 횟수


@dataclass
class TurnRecord:
    user_turn: int
    user_text: str
    raw_analysis: dict | None   # 모델 원본 출력
    applied_intent: str         # 검증 후 상태에 반영한 의도
    notes: list[str] = field(default_factory=list)


@dataclass
class Event:
    type: str
    user_turn: int
    at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class Session:
    scenario_id: str
    max_user_turns: int
    link_offer_after_user_turns: int
    messages: list[Message] = field(default_factory=list)
    turns: list[TurnRecord] = field(default_factory=list)
    events: list[Event] = field(default_factory=list)
    link_offered: bool = False
    end_reason: str | None = None
    feedback: dict | None = None
    feedback_source: str | None = None  # "gemini" | "fallback"
    notes: list[str] = field(default_factory=list)

    @property
    def user_turns(self) -> int:
        return len(self.turns)

    @property
    def ended(self) -> bool:
        return self.end_reason is not None

    def has_event(self, event_type: EventType) -> bool:
        return any(e.type == event_type for e in self.events)

    def to_dict(self) -> dict:
        return asdict(self)
