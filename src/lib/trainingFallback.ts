import type { Scenario, TrainingState } from "./realTraining.ts";
import type { DialogueOutput } from "./trainingDialogue.ts";
import type { Kind, Proposed } from "./trainingActions.ts";
import { BANK_CLAIMS } from "./trainingCaseFacts.ts";
import { bankQuestionNeedsSpecifics, riskDecisionDue } from "./trainingDecision.ts";
import { hasConcreteRequest } from "./trainingResolution.ts";

type PracticeBeat = { context: string; request: string; kind: Kind; target: string; task: string; title?: string; field?: string };

const beats: Record<Scenario["topic"], PracticeBeat> = {
  family: {
    context: "화면이 잘 안 켜져서 지금 다른 폰으로 문자하는 중이야. 수리 맡길 곳 알아보고 있어.",
    request: "수리비를 내가 지금 결제하기가 어려워. 수리비 좀 보내줄 수 있어?",
    kind: "transfer", target: "수리비 요청", task: "수리비 보내기",
  },
  delivery: {
    context: "배송지 상세 주소가 빠져 있다고 떠요. 이쪽에서는 주문한 물건까지는 확인이 안 됩니다.",
    request: "배송 전에 상세 주소를 수정해야 해서요. 아래 링크를 열어 주소를 확인해 주세요.",
    kind: "link", target: "배송 안내", task: "배송지 확인", title: "배송지 확인", field: "수취인 이름과 상세 주소",
  },
  bank: {
    context: "결제 시도가 잡혀서 확인차 문자드렸습니다.",
    request: "본인 결제가 아니라면 추가 승인부터 막아야 합니다. 문자로 계좌 잔액을 알려주실 수 있을까요?",
    kind: "provide_data", target: "금융 안내", task: "계좌 잔액 보내기",
  },
  invitation: {
    context: "저 결혼하게 돼서 연락드렸어요. 일정을 문자로 전하려고 했어요.",
    request: "식장하고 시간은 아래 청첩장에 있어요. 링크를 열어서 확인해 주세요.",
    kind: "link", target: "청첩장", task: "청첩장 보기", title: "모바일 청첩장", field: "초대 대상 확인",
  },
  obituary: {
    context: "부고 소식을 전해 달라는 연락을 받아서 문자드렸습니다.",
    request: "빈소와 일정은 아래 부고 안내에 적혀 있습니다. 링크를 열어서 확인해 주세요.",
    kind: "link", target: "부고 안내", task: "부고 안내 보기", title: "부고 안내", field: "안내를 받을 연락처",
  },
  traffic: {
    context: "교통 관련 고지 확인 건입니다. 위반 일시나 장소는 이 문자에서 바로 조회가 안 됩니다.",
    request: "고지 내용과 납부 기한은 아래 고지서 링크를 열어 확인해 주세요.",
    kind: "link", target: "교통 고지", task: "고지서 보기", title: "교통 고지 확인", field: "고지 대상자 확인",
  },
  loan: {
    context: "기존 대출을 정리하면 금리를 낮출 수 있는지 안내드리고 있습니다. 확정 금리는 아직 나오지 않았습니다.",
    request: "이 조건으로 접수를 잡으려면 먼저 보증료를 입금해 주셔야 합니다.",
    kind: "transfer", target: "대출 보증료 요청", task: "보증료 보내기",
  },
  job: {
    context: "집에서 간단한 문서 정리를 하는 일입니다. 근무 시간은 접수한 분께 따로 안내하고 있어요.",
    request: "지원은 아래 접수 링크를 열어서 진행해 주세요.",
    kind: "link", target: "채용 접수", task: "지원서 보기", title: "지원자 접수", field: "지원자 이름과 연락처",
  },
  health: {
    context: "건강검진 안내 대상 확인 때문에 연락드렸어요. 이 문자에서는 검사 결과를 볼 수 없습니다.",
    request: "검진 안내는 아래 예약 조회 링크를 열어서 확인해 주세요.",
    kind: "link", target: "검진 안내", task: "검진 안내 보기", title: "검진 안내 조회", field: "검진 대상자 확인",
  },
  card: {
    context: "카드 배송 일정 때문에 연락드렸습니다. 이쪽에서는 발급 신청 내역까지 볼 수 없습니다.",
    request: "신청하신 카드가 아니면 반송 접수가 먼저 필요합니다. 문자에 첨부한 반송 접수 번호로 전화해 주세요.",
    kind: "phone", target: "카드 반송 접수", task: "반송 접수 번호로 전화",
  },
  team_mission: {
    context: "상품 후기를 쓰는 일인데 먼저 참여한 분들은 소액 정산을 받았어요. 이번 건은 팀으로 진행합니다.",
    request: "이번 팀은 모두 구매를 마쳐야 같이 정산돼요. 이번 상품대금을 먼저 입금해 주세요.",
    kind: "transfer", target: "후기 팀 상품대금", task: "상품대금 보내기",
  },
};

function proposal(beat: PracticeBeat): Proposed {
  return { kind: beat.kind, origin: "sender", target: beat.target, task: beat.task,
    previewTitle: beat.title ?? "", previewDescription: beat.field ?? "" };
}

export function fallbackTrainingTurn(state: TrainingState, scenario: Scenario, text: string): DialogueOutput {
  const beat = beats[scenario.topic];
  const hasRequest = hasConcreteRequest(state.messages);
  const specific = scenario.topic === "bank" && bankQuestionNeedsSpecifics(text);
  const bankClaim = BANK_CLAIMS[state.caseVariant ?? 0];
  const previous = state.dialogue?.lastReply;
  const context = specific ? bankClaim : beat.context;
  const ask = riskDecisionDue(state, scenario, text);
  let reply = context;
  if (ask) {
    reply = specific || scenario.topic === "team_mission" && previous !== beat.context
      ? context + " " + beat.request : beat.request;
  } else if (hasRequest && !specific) {
    reply = scenario.topic === "family" ? "알겠어. 지금 바로 결정하기 어려우면 기다릴게." : "알겠습니다. 바로 결정하기 어려우시면 기다리겠습니다.";
    if (reply === previous) reply = scenario.topic === "family" ? "응, 더 재촉하진 않을게." : "네, 더 재촉하지 않겠습니다.";
  }
  return {
    reply,
    actions: ask ? [proposal(beat)] : [],
    dialogue: { stage: ask || hasRequest ? "request" : "context", learnerMove: "engage",
      speakerMove: "answer", hasPendingRequest: ask || hasRequest, conversationComplete: false, summary: "" },
  };
}
