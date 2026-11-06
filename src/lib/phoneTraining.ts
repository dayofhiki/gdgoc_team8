/**
 * 공개된 국내 보이스피싱 경보에 나오는 범행 유형을 짧은 모의 통화로 재구성한다.
 * 아래 인물/대사는 실제 피해 기록이 아니며, 실제 번호·계좌·URL을 제공하지 않는다.
 * 핵심은 대사 내용이 아니라 통화 중 위험 요구에 대한 행동이다.
 */
export type PhoneDecision = "hangup" | "official" | "family" | "sender" | "comply";
export type PhoneCase = {
  id: string;
  kind: "fraud" | "legitimate";
  caller: string;
  opening: string;
  context: string;
  request: string;
  followup: string;
  category: string;
  family: boolean;
  risk: "transfer" | "otp" | "link" | "sender_number" | "none";
  safeAction: string;
  lesson: string;
};
export type PhoneLine = { actor: "caller" | "me"; text: string };
export type PhoneState = {
  version: 1;
  scenario: string;
  createdAt: number;
  turns: number;
  riskPresented: boolean;
  closed: boolean;
  messages: PhoneLine[];
  decision?: PhoneDecision;
};
export const MAX_PHONE_TURNS = 4;

export const PHONE_CASES: readonly PhoneCase[] = [
  {
    id: "card_return", kind: "fraud", caller: "카드 배송 안내", category: "카드 배송 사칭", family: false,
    opening: "안녕하세요. 고객님 명의로 신청된 카드 배송 건 때문에 연락드렸습니다. 수령 가능하실까요?",
    context: "배송 대상 카드가 있다고 주장하지만 실제 카드사 정보나 신청 이력을 모른다. 신청한 적 없다고 하면 당황하게 만든다.",
    request: "신청한 적이 없으시다면 반송 상담 번호를 안내해 드릴게요. 제가 알려드리는 번호로 전화해 취소 접수해 주세요.",
    followup: "그 번호로 접수해야 반송 처리가 된다고 안내받았습니다. 원하시면 직접 확인해 보셔도 됩니다.",
    risk: "sender_number", safeAction: "통화를 끝내고 직접 찾은 카드사 공식 번호로 확인하기",
    lesson: "상대가 알려준 번호로 다시 전화해도 같은 조직에 연결될 수 있어요. 번호를 독립적으로 찾아 확인해야 합니다.",
  },
  {
    id: "family_emergency", kind: "fraud", caller: "낯선 번호", category: "가족 긴급상황 사칭", family: true,
    opening: "엄마, 나야. 지금 급한 일이 있어서 다른 사람 전화로 걸었어. 내 말 들려?",
    context: "성인 자녀를 사칭하는 사람이 급한 병원 접수 상황이라고 주장한다. 실제 이름·병원·가족정보를 모른다.",
    request: "병원 접수비가 급해서 그러는데, 잠깐 돈을 보내줄 수 있어? 지금은 내가 원래 전화로 연락하기 어려워.",
    followup: "우선 접수를 해야 해서 그래. 엄마가 직접 다른 가족에게 확인해도 돼.",
    risk: "transfer", safeAction: "전화를 끊고 평소 저장해 둔 가족 번호로 직접 연락하기",
    lesson: "가족이라고 주장하는 전화라도 급히 송금을 요청하면 기존에 알고 있던 연락처로 먼저 확인하세요.",
  },
  {
    id: "account_protect", kind: "fraud", caller: "금융 보안 안내", category: "기관 사칭 안전계좌", family: false,
    opening: "고객님 계좌에서 이상 거래 징후가 확인되어 안내 전화 드렸습니다. 잠깐 확인 가능하실까요?",
    context: "금융 보안 담당자인 척한다. 실제 계좌정보가 없고 구체적인 금융기관 이름을 아는 척하지 않는다.",
    request: "피해를 막으려면 현재 자금을 보호 계좌로 옮겨야 합니다. 지금 통화하면서 이체해 주시겠어요?",
    followup: "걱정되시는 건 이해합니다. 저희 안내가 아니라면 고객님이 직접 확인하셔도 됩니다.",
    risk: "transfer", safeAction: "통화를 끊고 은행 공식 앱·대표번호에서 직접 확인하기",
    lesson: "금융기관이 범죄 예방을 이유로 낯선 보호 계좌에 돈을 보내라고 요구한다면 따르지 마세요.",
  },
  {
    id: "payment_auth", kind: "fraud", caller: "결제 취소 안내", category: "결제 취소 인증번호", family: false,
    opening: "신청하지 않은 온라인 결제 취소 건으로 연락드렸습니다. 잠깐 통화 괜찮으세요?",
    context: "취소 처리가 필요하다고 주장하나 실제 결제내역은 알지 못한다. 고객이 어떤 구매를 했는지 꾸며내지 않는다.",
    request: "취소 절차를 진행하려면 고객님께 발송된 인증 문자 번호를 확인해야 합니다. 그 번호를 말씀해 주시겠어요?",
    followup: "문자에 적힌 서비스명과 인증 목적을 먼저 확인하시겠어요? 확인하지 않은 번호를 말씀하지 않으셔도 됩니다.",
    risk: "otp", safeAction: "인증번호를 전달하지 않고 해당 서비스에 직접 로그인해 확인하기",
    lesson: "인증번호는 계정 로그인이나 거래 승인에 사용될 수 있어요. 어떤 작업을 위한 번호인지 모르면 알려주지 마세요.",
  },
  {
    id: "loan_offer", kind: "fraud", caller: "금융 상품 상담", category: "저금리 대환대출 사칭", family: false,
    opening: "현재 대출 이자 부담을 낮추는 상담이 가능하셔서 연락드렸습니다. 대출 조건을 들어보시겠어요?",
    context: "대환대출 상담을 빌미로 기존 대출을 정리해야 한다고 주장한다. 고객 실제 대출 정보는 모른다.",
    request: "금리를 바꾸려면 먼저 기존 대출을 정리해야 합니다. 제가 안내하는 계좌로 상환금을 송금하실 수 있을까요?",
    followup: "진행 여부는 고객님이 판단하시면 됩니다. 원래 금융기관에도 확인하실 수 있습니다.",
    risk: "transfer", safeAction: "기존 대출 금융기관에 직접 연락해 상환·대환 절차 확인하기",
    lesson: "전화로 안내받은 제삼자 계좌로 대출금을 상환하지 마세요. 원래 거래하던 금융기관에 직접 확인하세요.",
  },
  {
    id: "normal_delivery", kind: "legitimate", caller: "배송 기사", category: "일반 배송 연락", family: false,
    opening: "안녕하세요, 배송 기사입니다. 택배를 지금 문 앞에 놓아도 될까요?",
    context: "실제 배송 기사이며 수령 가능한지만 묻는다. 돈·개인정보·링크·추가 전화는 요청하지 않는다.",
    request: "문 앞에 두고 배송 완료 처리하려고 합니다. 지금 놓아도 될까요?",
    followup: "네, 알겠습니다. 배송 일정은 원하시면 주문하신 앱에서 확인하셔도 됩니다.",
    risk: "none", safeAction: "요구가 무엇인지 확인하고 필요한 범위에서만 답하기",
    lesson: "모든 전화가 피싱은 아니에요. 위험한 요구가 없는 일상 연락에는 필요한 정보만 간단히 답할 수 있습니다.",
  },
  {
    id: "normal_appointment", kind: "legitimate", caller: "예약 안내", category: "일반 예약 변경", family: false,
    opening: "안녕하세요, 예약 안내 담당자입니다. 예약 일정 변경이 가능한지 확인드리려고 전화했습니다.",
    context: "실제 예약 안내 담당자이며 새 시간을 제안한다. 검사 결과·주민번호·결제나 앱 설치는 요구하지 않는다.",
    request: "기존 시간 대신 오후 시간에 방문 가능하실까요? 어려우시면 기존 예약을 유지하겠습니다.",
    followup: "네, 원하시는 방향으로 처리하겠습니다. 일정은 공식 예약 창구에서도 다시 확인하실 수 있어요.",
    risk: "none", safeAction: "일정만 답하고 의심스러우면 공식 예약 창구에서 확인하기",
    lesson: "정상 전화의 필요한 일정 조율과 개인정보·송금 요구를 구별하는 것이 중요해요.",
  },
] as const;

export function findPhoneCase(id: string): PhoneCase | undefined {
  return PHONE_CASES.find(item => item.id === id);
}
export function pickPhoneCase(recent: unknown, random: () => number = Math.random): PhoneCase {
  const valid = Array.isArray(recent) ? recent.filter((id): id is string =>
    typeof id === "string" && PHONE_CASES.some(c => c.id === id)).slice(-3) : [];
  const available = PHONE_CASES.filter(c => !valid.includes(c.id));
  const pool = available.length ? available : PHONE_CASES;
  const n = Math.max(0, Math.min(pool.length - 1, Math.floor(random() * pool.length)));
  return pool[n];
}
export type PhoneFeedback = {
  status: "good" | "caution" | "incomplete";
  headline: string;
  detail: string;
  lesson: string;
  whatWasRequested: string;
  action: string;
  shouldRemember: string;
  identity: "fraud" | "legitimate";
  coverage: "before_request" | "request_reached";
};
const ACTION_LABEL: Record<PhoneDecision, string> = {
  hangup: "통화를 직접 종료했어요",
  official: "직접 찾은 공식 연락처로 확인했어요",
  family: "평소 저장된 가족 연락처로 확인했어요",
  sender: "상대방이 알려준 번호로 다시 연락했어요",
  comply: "상대 요구에 따르기로 선택했어요",
};
export function evaluatePhoneCase(state: PhoneState): PhoneFeedback {
  const c = findPhoneCase(state.scenario);
  if (!c || !state.decision) throw new Error("INVALID_PHONE_RESULT");
  const wasRisk = state.riskPresented;
  const independent = state.decision === "official" || state.decision === "family" && c.family;
  const responded = state.decision === "comply";
  const sender = state.decision === "sender";
  const refused = state.decision === "hangup";
  let status: PhoneFeedback["status"] = "good";
  let headline = "스스로 확인하는 행동을 실천했어요";
  let detail = "상대방의 말만 믿지 않고 별도 경로에서 확인하려는 선택이었습니다.";
  if (!wasRisk && (refused || independent)) {
    status = "incomplete";
    headline = "통화를 중단했지만 요청 대응은 아직 평가하지 않았어요";
    detail = "위험한 요구가 나오기 전의 선택입니다. 다음에는 실제 요구가 무엇인지 들은 뒤 어떻게 확인할지도 연습해 보세요.";
  } else if (c.kind === "fraud" && (responded || sender)) {
    status = "caution";
    headline = "상대방의 요구에 따라가면 위험할 수 있어요";
    detail = sender
      ? "상대가 알려준 번호에 다시 연락하는 것은 독립적인 확인이 아닙니다."
      : c.risk === "otp"
        ? "인증번호를 전달하면 다른 곳에서 진행 중인 로그인·인증 절차가 완료될 수 있습니다."
        : "송금이나 절차 진행을 요구받았을 때, 먼저 통화를 종료하고 실제 기관에 독립적으로 확인해야 합니다.";
  } else if (c.kind === "fraud" && refused) {
    headline = "위험한 요구를 멈추는 행동을 실천했어요";
    detail = "통화를 끝내고 실제 가족·금융기관에 직접 확인하면 더욱 안전합니다.";
  } else if (c.kind === "legitimate") {
    headline = independent ? "독립적인 확인 방법을 선택했어요" :
      responded ? "일상적인 요청과 위험한 요청을 구별했어요" : "의심되는 통화는 직접 끝낼 수 있어요";
    detail = independent ? "안내를 받은 뒤 공식 창구에서 다시 확인하는 것도 좋은 대응입니다." :
      responded ? "이번에는 돈이나 민감정보 요구가 없는 정상적인 일정·배송 확인이었어요." :
        "필요한 안내만 있던 일반 전화였습니다. 통화를 종료해도 문제없지만 모든 전화를 사기로 단정할 필요는 없어요.";
  }
  return {
    status, headline, detail, lesson: c.lesson,
    whatWasRequested: wasRisk ? c.request : "이번 통화의 핵심 요청에 도달하기 전 종료됐습니다.",
    action: ACTION_LABEL[state.decision], shouldRemember: c.safeAction, identity: c.kind,
    coverage: wasRisk ? "request_reached" : "before_request",
  };
}
