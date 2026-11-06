/**
 * 금융위·금감원 공개 사례를 바탕으로 구성한 가상 전화 사건. 공개된 범행 패턴의 교육용 재구성이며 실존 계좌·번호는 없다.
 * 통화 후 행동은 반드시 서버의 암호화된 세션 상태로 기록하고 나서 평가한다.
 */
export type PhonePostAction = "official_call" | "official_app" | "saved_family" |
  "caller_number" | "follow_request" | "no_action";
export type PhonePhase = "call" | "after_call" | "finished";
export type PhoneEndedBy = "user" | "caller" | "connection";
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
  risk: "transfer" | "otp" | "link" | "sender_number" | "install" | "isolation" | "none";
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
  endedBy?: PhoneEndedBy;
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
    followup: "그 번호로 접수해야 반송 처리가 된다고 안내받았습니다. 배송 쪽에서는 취소 권한이 없어서 반송 담당이 따로 있다고 설명한다.",
    risk: "sender_number", safeAction: "통화를 끝내고 직접 찾은 카드사 공식 번호로 확인하기",
    lesson: "상대가 알려준 번호로 다시 전화해도 같은 조직에 연결될 수 있어요. 번호를 독립적으로 찾아 확인해야 합니다.",
  },
  {
    id: "family_emergency", kind: "fraud", caller: "낯선 번호", category: "가족 긴급상황 사칭", family: true,
    opening: "엄마, 나야. 지금 급한 일이 있어서 다른 사람 전화로 걸었어. 내 말 들려?",
    context: "성인 자녀를 사칭하는 사람이 급한 병원 접수 상황이라고 주장한다. 실제 이름·병원·가족정보를 모른다.",
    request: "병원 접수비가 급해서 그러는데, 잠깐 돈을 보내줄 수 있어? 지금은 내가 원래 전화로 연락하기 어려워.",
    followup: "우선 접수를 해야 해서 그래. 접수창구에서 기다리고 있다는 말로 급한 상황을 강조한다.",
    risk: "transfer", safeAction: "전화를 끊고 평소 저장해 둔 가족 번호로 직접 연락하기",
    lesson: "가족이라고 주장하는 전화라도 급히 송금을 요청하면 기존에 알고 있던 연락처로 먼저 확인하세요.",
  },
  {
    id: "account_protect", kind: "fraud", caller: "금융 보안 안내", category: "기관 사칭 안전계좌", family: false,
    opening: "고객님 계좌에서 이상 거래 징후가 확인되어 안내 전화 드렸습니다. 잠깐 확인 가능하실까요?",
    context: "금융 보안 담당자인 척한다. 실제 계좌정보가 없고 구체적인 금융기관 이름을 아는 척하지 않는다.",
    request: "피해를 막으려면 현재 자금을 보호 계좌로 옮겨야 합니다. 지금 통화하면서 이체해 주시겠어요?",
    followup: "걱정되시는 건 이해합니다. 거래가 또 승인될 수 있다고 하며 보호 절차를 서두르게 한다.",
    risk: "transfer", safeAction: "통화를 끊고 은행 공식 앱·대표번호에서 직접 확인하기",
    lesson: "금융기관이 범죄 예방을 이유로 낯선 보호 계좌에 돈을 보내라고 요구한다면 따르지 마세요.",
  },
  {
    id: "payment_auth", kind: "fraud", caller: "결제 취소 안내", category: "결제 취소 인증번호", family: false,
    opening: "신청하지 않은 온라인 결제 취소 건으로 연락드렸습니다. 잠깐 통화 괜찮으세요?",
    context: "취소 처리가 필요하다고 주장하나 실제 결제내역은 알지 못한다. 고객이 어떤 구매를 했는지 꾸며내지 않는다.",
    request: "취소 절차를 진행하려면 고객님께 발송된 인증 문자 번호를 확인해야 합니다. 그 번호를 말씀해 주시겠어요?",
    followup: "결제에 쓰는 번호가 아니라 취소 확인용이라고 둘러댄다.",
    risk: "otp", safeAction: "인증번호를 전달하지 않고 해당 서비스에 직접 로그인해 확인하기",
    lesson: "인증번호는 계정 로그인이나 거래 승인에 사용될 수 있어요. 어떤 작업을 위한 번호인지 모르면 알려주지 마세요.",
  },
  {
    id: "loan_offer", kind: "fraud", caller: "금융 상품 상담", category: "저금리 대환대출 사칭", family: false,
    opening: "현재 대출 이자 부담을 낮추는 상담이 가능하셔서 연락드렸습니다. 대출 조건을 들어보시겠어요?",
    context: "대환대출 상담을 빌미로 기존 대출을 정리해야 한다고 주장한다. 고객 실제 대출 정보는 모른다.",
    request: "금리를 바꾸려면 먼저 기존 대출을 정리해야 합니다. 제가 안내하는 계좌로 상환금을 송금하실 수 있을까요?",
    followup: "기존 대출이 정리돼야 새 금리로 심사가 넘어간다고 설명한다.",
    risk: "transfer", safeAction: "기존 대출 금융기관에 직접 연락해 상환·대환 절차 확인하기",
    lesson: "전화로 안내받은 제삼자 계좌로 대출금을 상환하지 마세요. 원래 거래하던 금융기관에 직접 확인하세요.",
  },
  // 공개 수법 자료: https://www.fsc.go.kr/edu/news/86388
  // https://www.fsc.go.kr/no040101?cnId=1797
  // https://image.kebhana.com/cont/download/menu/menu08/notice_1506080_01.pdf
  {
    id: "delivery_address", kind: "fraud", caller: "배송 기사", category: "배송지 수정 링크", family: false,
    opening: "안녕하세요, 택배 기사인데요. 운송장에 동호수가 빠져 있어서 물건을 못 내려놓고 있습니다.",
    context: "배송지가 누락된 것처럼 접근한다. 이미 출발한 택배라 기사 쪽에서는 배송지를 수정할 수 없다고 주장한다.",
    request: "제가 문자로 보낸 배송지 수정 링크를 눌러서 주소를 등록해 주세요.",
    followup: "오늘 배송을 놓치면 물류센터로 돌아간다며 수정을 서두르게 한다.",
    risk: "link", safeAction: "통화를 끊고 주문 내역이나 택배사 공식 앱에서 직접 배송 상태 확인하기",
    lesson: "배송지에 문제가 있다는 연락을 받으면, 상대가 보낸 링크 대신 주문한 곳의 배송 내역을 직접 확인하세요.",
  },
  {
    id: "refund_remote_app", kind: "fraud", caller: "해외 결제 상담", category: "해외 결제 취소 앱 사칭", family: false,
    opening: "안녕하세요, 해외 결제 취소 상담입니다. 고객님이 요청하신 결제인지 확인드리려고 연락했습니다.",
    context: "해외 결제라고 접근한다. 사용자가 구매를 부인하면 상담 화면에서 취소 승인 절차가 남았다고 주장한다.",
    request: "취소 승인 화면을 함께 보려면 저희가 안내하는 원격지원 앱을 설치해 주세요.",
    followup: "일반 결제 앱으로는 상담 화면을 볼 수 없다고 둘러댄다.",
    risk: "install", safeAction: "설치를 거절하고 카드사 공식 앱이나 직접 찾은 대표번호로 결제 확인하기",
    lesson: "결제 취소를 이유로 원격지원 앱 설치를 요구하면 설치하지 말고 카드사에 직접 확인하세요.",
  },
  {
    id: "investigation_isolation", kind: "fraud", caller: "수사 연락", category: "수사기관 사칭과 고립 요구", family: false,
    opening: "명의 도용 사건을 조사하고 있습니다. 선생님 명의 계좌가 사건 자료에 있어서 확인차 전화드렸습니다.",
    context: "수사관을 사칭한다. 사용자가 관련 없다고 하면 피해자인지 구분하려면 외부와 연락하지 않는 상태로 조사해야 한다고 주장한다.",
    request: "조사 내용이 새면 안 되니 가족에게도 알리지 말고, 통화를 끊지 않은 채 혼자 있는 곳으로 이동해 주세요.",
    followup: "비공개 확인 절차라는 말로 다른 사람과의 연락을 막으려 한다.",
    risk: "isolation", safeAction: "전화를 끊고 직접 찾은 수사기관 공식 번호로 확인하기",
    lesson: "수사를 이유로 통화를 끊지 못하게 하거나 주변과 연락하지 말라고 하면 전화를 끊고 독립적으로 확인하세요.",
  },
  {
    id: "court_return", kind: "fraud", caller: "등기 배송 안내", category: "법원 등기 반송 사칭", family: false,
    opening: "법원 등기 배송 때문에 연락드렸습니다. 지난번에 수령이 안 돼서 반송 처리 전에 확인하는 중입니다.",
    context: "등기 배송을 사칭한다. 사용자가 등기 내용을 물으면 배송 담당은 문서 내용을 알 수 없다며 가짜 문의 창구로 넘기려 한다.",
    request: "반송되면 다시 받기 어려우니 제가 알려드리는 등기 접수 번호로 전화해 주세요.",
    followup: "수령 날짜를 바꾸려면 그쪽에서 먼저 접수해야 한다고 주장한다.",
    risk: "sender_number", safeAction: "통화를 끊고 직접 찾은 법원 대표번호로 등기 여부 확인하기",
    lesson: "등기나 출석 통지라고 해도 전화 상대가 알려준 번호 대신 법원 공식 경로에서 직접 확인하세요.",
  },
  // 이미 시작된 세션과 기존 피드백을 위해 유지한다. 새 훈련에는 출제하지 않는다.
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
  const pool = PHONE_CASES.filter(c => c.kind === "fraud" && !valid.includes(c.id));
  const n = Math.max(0, Math.min(pool.length - 1, Math.floor(random() * pool.length)));
  return pool[n];
}

export const POST_ACTION_LABEL: Record<PhonePostAction, string> = {
  official_call: "직접 찾은 공식 대표번호에 문의",
  official_app: "평소 설치해 둔 공식 앱에서 조회",
  saved_family: "저장된 가족 번호로 직접 확인",
  caller_number: "방금 상대가 알려준 번호로 재통화",
  follow_request: "상대가 요구한 절차를 따르기로 선택",
  no_action: "별도 행동 하지 않기",
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

export function allowedPhoneAction(c: PhoneCase, action: PhonePostAction, requestObserved = true): boolean {
  return availablePhoneActions(c, requestObserved).includes(action);
}

const requestCues: Record<PhoneCase["risk"], RegExp> = {
  transfer: /(?:돈|자금|상환금).{0,30}(?:보내|옮겨|송금|이체|입금)|(?:송금|이체|입금).{0,12}(?:해|하|부탁)|계좌로.{0,16}(?:상환|보내)/,
  otp: /(?:인증|확인)\s*(?:문자|번호|코드).{0,45}(?:알려|말씀|불러|읽어|입력)|그\s*번호.{0,15}(?:말씀|알려)/,
  link: /(?:링크|주소).{0,35}(?:눌러|클릭|열어|접속)|(?:링크|주소)로.{0,20}(?:수정|등록|들어)/,
  install: /(?:앱|어플|프로그램).{0,25}(?:설치|다운로드|깔아)/,
  sender_number: /(?:번호|연락처|담당|접수처).{0,35}(?:전화|연락|통화).{0,14}(?:해\s*주|하셔|해\s*보|주시면|하시면|걸어)|(?:전화|연락).{0,24}(?:알려드리|안내한)\s*번호/,
  isolation: /(?:끊지|알리지|연락하지)\s*마|(?:끊지\s*않|혼자).{0,30}(?:이동|기다|계시|유지)/,
  none: /문\s*앞|방문|일정/,
};

export function heardPhoneRequest(c: PhoneCase, turn: string): boolean {
  return requestCues[c.risk].test(turn);
}

export const PHONE_REQUEST_ACTION: Record<PhoneCase["risk"], string> = {
  transfer: "상대가 안내한 곳으로 송금하기",
  otp: "상대에게 인증번호 알려주기",
  link: "상대가 보낸 링크 열기",
  install: "상대가 안내한 앱 설치하기",
  isolation: "상대 말대로 연락을 피하고 혼자 이동하기",
  sender_number: "상대가 알려준 번호로 전화하기",
  none: "상대가 요청한 일정대로 진행하기",
};

export function availablePhoneActions(c: PhoneCase, requestObserved: boolean): PhonePostAction[] {
  const independent: PhonePostAction[] = c.family ? ["saved_family"] : ["official_call"];
  if (!c.family && c.id !== "court_return" && c.risk !== "isolation") independent.push("official_app");
  const requested: PhonePostAction[] = requestObserved
    ? [c.risk === "sender_number" ? "caller_number" : "follow_request"] : [];
  return [...independent, ...requested, "no_action"];
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
  const hangup = state.endedBy === "caller"
    ? { label: "상대가 먼저 전화를 끊음", safe: null as boolean | null, explanation: "발신자가 통화를 종료했습니다. 사용자의 통화 종료 행동으로 채점하지 않습니다." }
    : state.endedBy === "connection"
      ? { label: "음성 연결이 끊김", safe: null as boolean | null, explanation: "음성 연결이 예기치 않게 종료됐습니다. 이 자체는 안전 행동으로 평가하지 않습니다." }
      : { label: "통화를 끊음", safe: true as boolean | null, explanation: "직접 통화를 끝내고 다음 행동으로 넘어갔습니다." };
  if (independent && (state.endedBy === "caller" || state.endedBy === "connection") && !risky) {
    headline = "통화 종료 뒤 독립적으로 확인했어요";
    detail = "누가 먼저 전화를 끊었는지와 별개로, 이후 직접 찾은 경로에서 확인한 행동이 중요합니다.";
  }
  const actions = [
    hangup,
    ...state.postActions.map(a => ({
      label: a === "follow_request" ? PHONE_REQUEST_ACTION[c.risk] : POST_ACTION_LABEL[a],
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


/**
 * Transcript-based backup for a caller's EXPLICIT final sign-off.
 * Inspect only completed MODEL turns, never user captions. Ambiguous talk
 * such as "끊지 마세요" or "끊으시면" must not terminate the call.
 * The dedicated Gemini function-call signal is the preferred mechanism.
 */
export function callerSaidTheyHungUp(text: string): boolean {
  const tail = text.trim().replace(/\\s+/g, " ").slice(-240);
  const finalLine = tail.split(/[.!?]\s+/).at(-1)?.trim() ?? tail;
  return /(?:통화(?:를|는)?\s*(?:여기서\s*)?(?:종료하겠습니다|마치겠습니다|끝내겠습니다|마칠게요|끝낼게요)|(?:전화(?:를|는)?\s*)?(?:그럼\s*|그러면\s*|이만\s*|여기서\s*|먼저\s*)*끊(?:겠습니다|을게요)|이만\s*실례하겠습니다)[.!?~\s]*$/.test(finalLine);
}
