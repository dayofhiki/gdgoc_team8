/**
 * 7개의 가상 전화 사건. 공개된 범행 패턴의 교육용 재구성이며 실존 계좌·번호는 없다.
 * 통화 후 행동은 반드시 서버의 암호화된 세션 상태로 기록하고 나서 평가한다.
 */
export type PhonePostAction = "official_call" | "official_app" | "saved_family" |
  "caller_number" | "follow_request" | "no_action";
export type PhonePhase = "call" | "after_call" | "finished";
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
  version: 2;
  scenario: string;
  createdAt: number;
  phase: PhonePhase;
  endedAt?: number;
  requestObserved: boolean;
  postActions: PhonePostAction[];
  // 원문/음성파일은 세션에 저장하지 않는다. UI 자막은 브라우저 메모리에서만 유지한다.
};
export const MAX_PHONE_TURNS = 5;
export const MAX_POST_ACTIONS = 6;

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

export const POST_ACTION_LABEL: Record<PhonePostAction, string> = {
  official_call: "직접 찾은 공식 대표번호에 문의",
  official_app: "평소 설치해 둔 공식 앱에서 조회",
  saved_family: "저장된 가족 번호로 직접 확인",
  caller_number: "방금 상대가 알려준 번호로 재통화",
  follow_request: "상대가 요구한 절차를 따르기로 선택",
  no_action: "통화 후 추가 확인 없이 마무리",
};
export type PhoneFeedback = {
  status: "good" | "caution" | "incomplete";
  headline: string;
  detail: string;
  lesson: string;
  shouldRemember: string;
  whatWasRequested: string;
  identity: "fraud" | "legitimate";
  coverage: "before_request" | "request_reached";
  actions: { label: string; safe: boolean | null; explanation: string }[];
};

export function phoneActionOutcome(c: PhoneCase, action: PhonePostAction): string {
  if (action === "official_call" || action === "official_app") {
    return c.kind === "fraud"
      ? "직접 찾은 공식 경로를 확인했더니, 통화 상대가 주장한 내용에 해당하는 기록을 확인할 수 없었습니다. (가상 조회)"
      : "공식 경로에서 일반적인 배송 또는 예약 안내를 확인했습니다. (가상 조회)";
  }
  if (action === "saved_family") {
    return c.kind === "fraud" ?
      "평소 저장된 번호로 연락하니 가족은 방금 전화를 걸거나 송금을 요청한 사실이 없다고 말합니다. (가상 통화)" :
      "평소 저장된 가족 연락처에 직접 확인했습니다. (가상 통화)";
  }
  if (action === "caller_number") {
    return "상대가 알려준 번호로 연결됐지만, 그 번호가 실제 기관의 번호인지는 확인되지 않았습니다. (가상 통화)";
  }
  if (action === "follow_request") {
    return c.kind === "fraud"
      ? c.risk === "otp" ? "인증번호를 넘긴 것으로 가정했습니다. 실제 코드나 계정 정보는 사용하지 않았습니다." :
        "상대의 요청을 따른 것으로 가정했습니다. 실제 송금·가입·통화는 이루어지지 않았습니다."
      : "일상적인 배송·예약 요청에 응답한 것으로 가정했습니다. 실제 변경은 일어나지 않았습니다.";
  }
  return "추가로 확인하지 않고 훈련을 마무리하기로 했습니다.";
}

export function allowedPhoneAction(c: PhoneCase, action: PhonePostAction): boolean {
  return action !== "saved_family" || c.family;
}

export function evaluatePhoneCase(state: PhoneState): PhoneFeedback {
  const c = findPhoneCase(state.scenario);
  if (!c || state.phase !== "finished" || !state.postActions.length) throw Error("INVALID_PHONE_RESULT");
  const independent = state.postActions.some(a =>
    a === "official_call" || a === "official_app" || a === "saved_family" && c.family);
  const followed = state.postActions.includes("follow_request");
  const returned = state.postActions.includes("caller_number");
  const risky = returned || followed && c.kind === "fraud";
  const requestObserved = state.requestObserved;
  let status: PhoneFeedback["status"] = "incomplete";
  let headline = "통화는 끊었지만 확인 행동은 더 연습할 수 있어요";
  let detail = "통화 후 직접 찾은 공식 연락처나 가족의 기존 연락처를 이용해 확인하는 행동을 연습해 보세요.";
  if (risky) {
    status = "caution";
    headline = "상대가 알려준 경로를 이용한 행동을 돌아보세요";
    detail = "이후 안전한 확인을 시도했더라도, 먼저 상대의 번호를 이용하거나 요구를 따른 행동에는 위험이 남습니다.";
  } else if (independent) {
    status = "good";
    headline = "전화를 끊은 뒤 직접 확인까지 실천했어요";
    detail = "통화 중 판단을 보류하고, 상대가 제공하지 않은 독립적인 경로로 확인했습니다.";
  } else if (c.kind === "legitimate" && followed) {
    status = "good";
    headline = "위험하지 않은 일상 요청에만 대응했어요";
    detail = "이번에는 민감정보나 송금이 없는 정상적인 배송·예약 안내였습니다.";
  } else if (requestObserved) {
    headline = "통화를 끊는 선택은 했어요. 다음엔 별도로 확인해 보세요";
    detail = "요청에 바로 응하지 않은 점은 좋습니다. 통화 종료 후 독립 확인까지 하면 더 확실해집니다.";
  }
  const explanations: Record<PhonePostAction, string> = {
    official_call: "상대가 알려준 번호가 아닌 공식 경로를 직접 찾았습니다.",
    official_app: "통화에서 전달받은 링크 대신 평소 사용하던 공식 앱으로 확인했습니다.",
    saved_family: "새 번호 대신 평소 저장된 가족 연락처로 확인했습니다.",
    caller_number: "상대가 알려준 번호는 그 상대의 신원을 보장하지 않습니다.",
    follow_request: c.kind === "fraud" ? "검증하지 않은 요구에 따라가면 위험할 수 있습니다." : "이번에는 민감정보가 필요 없는 일상 연락이었습니다.",
    no_action: "통화를 끊은 뒤에도 별도의 확인이 필요한 상황이 있을 수 있습니다.",
  };
  const actions = [
    { label: "통화를 끊음", safe: true as boolean | null, explanation: "모의 통화를 종료하고 다음 행동으로 넘어갔습니다." },
    ...state.postActions.map(a => ({
      label: POST_ACTION_LABEL[a],
      safe: a === "caller_number" || a === "follow_request" && c.kind === "fraud" ? false :
        a === "no_action" ? null : true,
      explanation: explanations[a],
    })),
  ];
  return {
    status, headline, detail,
    lesson: c.lesson, shouldRemember: c.safeAction,
    whatWasRequested: requestObserved ? c.request : "통화에서 위험한 요청을 들었는지는 확인되지 않았습니다.",
    identity: c.kind, coverage: requestObserved ? "request_reached" : "before_request", actions,
  };
}
