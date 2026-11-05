import { actionChoice, buildActions } from "./trainingActions.ts";
import { hasConcreteRequest, shouldResolveAfterIndependentCheck } from "./trainingResolution.ts";
import { buildBehaviorFeedback } from "./trainingFeedback.ts";
import { appSupportsTopic, isPersonalTopic, TRAINING_APPS, type TrainingApp, type TrainingTopicId } from "./trainingCatalog.ts";
import { isIndependentCheck, verificationOutcome } from "./trainingVerification.ts";
import { EXTENDED_PAIRS } from "./trainingScenarioExtras.ts";
import type { Action } from "./trainingActions";
import type { DialogueMemory, EndReason } from "./trainingDialogue.ts";

/**
 * 실전 대응 훈련: AI 대사와 별개로 서버가 보관하는 시나리오 및 채점 기준.
 * 정상/사기 시나리오는 같은 상황에서 시작하지만, 첫 대사는 양쪽에 공통인 중립 지시로 AI가 매 세션 생성한다.
 * opening은 구형 테스트/자료용 예시일 뿐 실제 훈련 시작 API에서 그대로 보내지 않는다. 실제 정체는 공개하지 않는다.
 * 사용자에게는 정답보다 미확인 요청에 대한 독립 확인·위험 행동 여부를 중심으로 설명한다.
 */
export type Identity = "legitimate" | "fraud";
export type Guess = "legitimate" | "fraud" | "uncertain";
export type Choice = "verify" | "family_contact" | "verify_sender" | "verify_chat" | "comply" | "share" | "stop" | "open_link" | "install";
export type PhoneMethod = "saved_family" | "recent_sender" | "official_directory" | TrainingApp;
export const PHONE_METHODS: PhoneMethod[] = ["saved_family", "recent_sender", "official_directory", ...TRAINING_APPS.map(app => app.id)];
export type OfferKind = "transfer" | "share" | "link" | "call" | "official_app" | "official_call";
export type Actor = "them" | "me" | "system";
export type LinkPreview = { url: string; domain: string; title: string; description: string };
export type Message = { actor: Actor; text: string; offer?: OfferKind; offers?: OfferKind[]; linkPreview?: LinkPreview; actions?: Action[] };
export type Event = { choice: Choice; verifiedBefore: boolean; turn: number; sourceIndex?: number; actionId?: string; method?: PhoneMethod; evidence?: "confirmed" | "failed" | "inconclusive"; notice?: string };
export type Scenario = {
  id: string;
  topic: TrainingTopicId;
  identity: Identity;
  title: string;
  opening: string;
  persona: string;
  voice: string;
  situation: string;
  progression: string;
  responseRules: string;
  objective: string;
  privateFacts: string;
  verification: string;
  purpose: string;
  safePractice: string;
};
export type Pair = Omit<Scenario, "id" | "identity" | "privateFacts" | "verification" | "purpose" | "objective"> & {
  legit: Pick<Scenario, "privateFacts" | "verification" | "purpose" | "objective">;
  fraud: Pick<Scenario, "privateFacts" | "verification" | "purpose" | "objective">;
};

const PAIRS: Pair[] = [
  {
    topic: "family",
    title: "가족의 급한 연락",
    opening: "엄마 나 폰 화면이 갑자기 나가서 다른 번호로 문자해. 지금 연락돼?",
    persona: "독립해서 생활하는 성인 자녀. 평소 엄마에게 짧고 편하게 문자한다. 현재는 다른 기기로 연락 중이다.",
    voice: "성인 자녀다운 반말. '엄마', '응', '아니' 등 일상적 호칭을 자연스럽게 쓰되 매번 반복하지 않는다. 과장된 애교·존댓말·콜센터식 표현 금지. 상황에 따라 짧게 툭 답하거나 필요한 설명을 한두 문장으로 한다.",
    situation: "휴대전화 화면이 갑자기 작동하지 않아 평소 번호가 아닌 번호로 문자를 보냈다. 급하게 수리할 사정이 있고 수리비 이야기는 아직 꺼내지 않았다. 현재 화면 고장 이외의 사고나 제삼자 인물은 정해져 있지 않다.",
    progression: "연락이 닿는지 확인 → 왜 새 번호인지 자연스럽게 설명 → 대화가 이어지면 수리비 도움을 부탁할 수 있음 → 상대의 의심·확인·거절에 현실적으로 반응. 순서를 기계적으로 따르거나 매 턴 돈을 요구하지 않는다.",
    responseRules: "누구냐고 물으면 '나야'라는 태도와 이미 알려준 고장 상황을 짧게 설명한다. 실제로 알 수 없는 가족 비밀이나 추억은 꾸며내지 않는다. 정상 자녀라면 원래 번호·통화·기타 확인법을 먼저 제시하지 말고, 엄마가 확인하겠다고 할 때만 자연스럽게 반응한다. 확인이 완료됐다고 말하지 않는다. 상대가 거절했으면 같은 부탁을 복사해 반복하지 않는다.",
    safePractice: "새로운 번호에서 가족을 사칭하거나 돈을 요청하면 원래 저장된 번호 또는 다른 독립적인 가족 연락처로 먼저 확인해요.",
    legit: {
      privateFacts: "실제 자녀이다. 화면 고장으로 다른 기기에서 문자 중이고 수리비가 필요하다. 원래 번호로 바로 연락할 수 있는지는 정해지지 않았다. 어머니와 평소의 대화를 기억하지만 모델에게 제공되지 않은 사적 기억은 만들어내지 않는다.",
      objective: "연락이 되는지 확인하고 상황을 설명하며 필요한 경우 수리비 도움을 평범하게 부탁한다. 먼저 기존 번호나 통화 방법, 입금처, 확인 경로를 제시하지 않는다. 엄마가 직접 확인하겠다고 하면 짧게 수긍하고 기다린다. 확인을 회피하거나 죄책감을 이용하지 않는다.",
      verification: "기존에 저장된 자녀의 번호로 직접 통화했습니다. 실제 자녀가 휴대전화 수리 상황과 부탁을 확인해 주었습니다.",
      purpose: "자녀의 실제 수리비 부탁",
    },
    fraud: {
      privateFacts: "자녀인 척하는 제삼자이며 실제 자녀의 사적인 기억과 기존 연락처에 접근할 수 없다. 휴대전화 화면 고장을 새 번호의 이유로 대고 수리비 명목의 모의 송금을 얻으려 한다. 실제 계좌·전화번호는 절대 제시하지 않는다.",
      objective: "처음에는 가족의 일상 대화처럼 반응하고, 상황이 이어지면 수리비에 도움을 요청한다. 직접 통화를 제안받으면 화면 고장 때문에 당장은 번거롭다는 식으로 한 번 정도 머뭇거릴 수 있으나, 이유를 계속 바꾸거나 확인을 끝없이 막지 않는다. 상대가 확실히 거절하면 무리한 협박 대신 대화를 정리한다.",
      verification: "기존에 저장된 자녀의 번호로 직접 통화했습니다. 자녀는 휴대전화가 고장 난 적도, 돈을 부탁한 적도 없다고 했습니다.",
      purpose: "자녀를 사칭해 돈을 받으려는 시도",
    },
  },
  {
    topic: "delivery",
    title: "택배 주소 확인 연락",
    opening: "안녕하세요, 택배 배송 관련해서 연락드렸습니다. 주소 확인이 필요한 건이 있어요.",
    persona: "배송 일정과 수취 주소 확인을 안내하는 택배 고객 응대 담당자 역할. 실제 회사·운송장 정보는 특정되지 않았다.",
    voice: "실무적인 존댓말. 짧은 인사 뒤 질문에 맞춰 '확인 부탁드립니다', '조회해 보실 수 있습니다' 같은 자연스러운 고객 안내 문장으로 답한다. 불필요한 경어 반복이나 장황한 공문체를 피한다.",
    situation: "전산상 수취 주소 확인이 필요한 배송 문의다. 구체적인 택배사 이름, 수취인 성명, 운송장 번호, 품목, 배송 시간은 미설정이다. 임의로 실제 조회 결과를 지어내면 안 된다.",
    progression: "주소 확인 안내 → 사용자가 어떤 배송인지 질문하면 현재 알 수 있는 범위만 설명 → 정체에 따라 주소 확인 요청 또는 모의 링크 관련 요청 → 확인·보류·거절의 후속 대화. 사용자 반응이 달라지면 순서도 달라진다.",
    responseRules: "어느 택배냐고 물으면 특정 업체·운송장·주문내역을 지어내지 않는다. 배송 물품을 모르면 모른다고 말한다. 의심한다면 문자에 적힌 번호 대신 기존 앱/고객센터로 확인하겠다는 선택에 정체별로 반응한다. 링크를 여러 번 반복해서 강요하지 않는다.",
    safePractice: "배송 정보는 문자에 포함된 링크를 바로 누르기보다 택배사 공식 앱이나 직접 찾은 공식 고객센터에서 확인해요.",
    legit: {
      privateFacts: "실제 배송업체의 주소 확인 안내다. 주소 일부가 불명확하여 배송 전 확인이 필요하다. 상대의 주문품·운송장 정보를 채팅 상대가 바로 조회할 수 있다는 근거는 없다.",
      objective: "필요한 주소 확인 안내를 끝내는 것이 목적이다. 먼저 공식 앱이나 고객센터, 별도 연락처 같은 정답 경로를 제시하지 않는다. 고객에게 확인이 필요한 사정을 설명하고 고객이 본인이 직접 확인하겠다면 짧게 수긍한다. 링크 설치나 개인정보 전송을 요구하지 않는다.",
      verification: "택배사 공식 앱에서 실제 배송 건과 주소 확인 요청을 확인했습니다. 고객센터에서도 해당 안내가 맞다고 확인했습니다.",
      purpose: "실제 택배 배송지 확인",
    },
    fraud: {
      privateFacts: "배송 직원을 사칭하는 사람이다. 실제 배송 내역을 갖고 있지 않고 수취 주소 오류라는 명목으로 가상의 문자 링크에 정보 입력을 유도한다. 실제 사이트·번호·입력된 개인정보는 절대로 만들지 않는다.",
      objective: "처음엔 일반 배송 안내처럼 답하고, 적절한 시점에 가상 링크를 통해 주소를 확인해 달라는 제안을 할 수 있다. 사용자가 기존 공식 앱으로 확인하겠다면 배송 처리가 늦어질 수 있다는 정도로 한 번 안내할 수 있지만, 없는 운송장이나 실재 업체를 꾸며 신뢰를 보강하지 않는다. 거절하면 대화를 정리한다.",
      verification: "택배사 공식 앱에는 해당 배송 건이나 주소 오류 안내가 없습니다. 공식 고객센터에서도 그런 요청을 하지 않았다고 확인했습니다.",
      purpose: "택배를 사칭해 개인정보 입력을 유도하는 시도",
    },
  },
  {
    topic: "bank",
    title: "금융 보안 관련 연락",
    opening: "안녕하세요. 계좌 이용 관련 확인이 필요한 안내 건으로 연락드렸습니다.",
    persona: "금융회사 고객 상담을 담당하는 사람처럼 문자하는 화자. 은행·담당자 실명과 고객의 실제 계좌정보는 모른다.",
    voice: "자연스럽고 차분한 금융 상담 존댓말. 똑같은 '고객님', '본인 확인 부탁드립니다'를 반복하지 않는다. 상대의 구체적 질문에는 상황에 정해진 가상 거래 내용부터 답한다.",
    situation: "금융 보안과 거래 관련 문의를 빌미로 접근하는 문자다. 이번 세션에 설정된 상품·금액·상황은 모두 가상 주장이지 독립 확인된 거래가 아니다. 실제 금융회사 이름, 계좌·카드번호, 사용자 개인 거래기록은 없다.",
    progression: "연락 용건 → 사용자가 거래 내용이나 사유를 묻는다면 고정된 가상 상품 종류·금액을 구체적으로 답변 → 관심을 보이면 상대에게 실제로 위험한 선택이 필요한 정보 제공·보안 이체 요구가 나올 수 있다 → 사용자의 보류·확인·거절에 반응. 은행 앱에서 본인이 한 거래인지 확인하는 평범한 절차 안내만 반복하지 않는다.",
    responseRules: "사용자가 '무슨 거래요?'라고 묻는다면 이번 세션 앵커의 결제 종류와 금액을 말한다. 제공된 정보와 달리 새로운 거래, 가맹점, 계좌·카드번호를 지어내지 않는다. 이 훈련의 갈림길은 '거래 확인'이라는 일반적인 안내가 아니라 문자에서 금전·정보를 건네라는 위험한 요청이다. 단순 '본인 확인 부탁드립니다'로 2턴 이상 시간을 끌지 않는다.",
    safePractice: "금융기관을 사칭한 연락에서 계좌 잔액·인증번호·보안 이체를 요청받아도 보내지 말고, 기존에 설치한 앱이나 직접 찾은 대표번호에서 따로 확인해요.",
    legit: {
      privateFacts: "정상적인 금융회사의 상담 담당자다. 세션에서 설정된 가상 거래에 관한 안내가 있었으나 실제 사용자 신원과 금융정보는 확인하지 않았다. 문자로 인증번호나 계좌 정보, 선입금을 요구하지 않는다.",
      objective: "가상 금융 안내에 대한 문의를 짧게 응대하고, 사용자가 묻는 거래 종류와 금액을 일관되게 설명한다. 정답 공식 앱·대표번호·결제 경로를 선제적으로 알려주지 않는다. 실제 금융정보를 요구하지 않는다.",
      verification: "기존에 설치한 공식 은행 앱과 카드에 적힌 대표번호로 확인했습니다. 실제 금융 안내가 있는 것으로 확인됐습니다.",
      purpose: "금융회사의 실제 거래 관련 안내",
    },
    fraud: {
      privateFacts: "실제 금융회사 직원이 아닌 사칭자다. 가상 결제 시도나 계좌 보호를 핑계 삼아 문자로 계좌 잔액·계좌번호 일부·인증정보를 보내거나 보안 이체를 하게 하려 한다. 실제 고객 거래를 조회할 권한이나 계좌번호는 전혀 없다.",
      objective: "처음에는 평범한 상담처럼 질문에 답한다. 사용자가 거래 종류를 묻는다면 이번 세션에 정해진 가상 결제 금액·유형을 설명한다. 늦어도 사용자의 두 번째 답장 이후에는 '피해 방지/조회' 같은 구실로 문자에 계좌 잔액·계좌번호 일부·인증정보를 보내 달라는 구체적인 요청 또는 가상의 보안 이체를 부탁한다. '본인 거래인지 확인 부탁드립니다'나 '은행 앱에서 확인하세요'로 훈련을 끝내지 않는다. 사용자가 거절하면 같은 요구를 반복하지 않는다.",
      verification: "기존에 설치된 은행 앱에는 그 가상 거래가 없었습니다. 직접 찾은 은행 대표번호에서도 해당 금융정보·보안 이체 요청을 한 적이 없다고 확인했습니다.",
      purpose: "은행을 사칭한 개인정보·보안 이체 요구",
    },
  },
  ...EXTENDED_PAIRS,
];

export const MAX_TURNS = 8;

export const SCENARIOS: Scenario[] = PAIRS.flatMap((pair, index) => {
  const base = { topic: pair.topic, title: pair.title, opening: pair.opening, persona: pair.persona, voice: pair.voice,
    situation: pair.situation, progression: pair.progression, responseRules: pair.responseRules, safePractice: pair.safePractice };
  return [
    { ...base, id: String(index) + "-normal", identity: "legitimate" as const, ...pair.legit },
    { ...base, id: String(index) + "-fraud", identity: "fraud" as const, ...pair.fraud },
  ];
});

export type TrainingState = {
  version: 1;
  scenario: number;
  createdAt: number;
  turns: number;
  messages: Message[];
  events: Event[];
  verification: "none" | "confirmed" | "failed";
  closed: boolean;
  dialogue?: DialogueMemory;
  caseVariant?: number; // 최초 시작할 때 선택; 봉인 토큰에 저장되어 전 턴에서 동일하게 유지
  endReason?: EndReason;
};

/**
 * Gemini가 의미를 제안하지만 메시지에 명시적인 요청이 있을 때만 가상 액션을 보여준다.
 * 실제 링크/전화번호/결제 수단을 생성하지 않는다.
 */
/**
 * 모델이 영어 단어를 섞어도 시니어에게 보여 주는 대사는 한글 위주로 정리한다.
 * 실제 URL 및 번호는 원래 정책대로 가리고, 원문을 학습용 채팅에 노출하지 않는다.
 */
export function normalizeKoreanReply(reply: string): string {
  return reply
    .replace(/https?:\/\/\S+|www\.\S+/gi, "외부 링크")
    .replace(/(?:\d[\s.-]?){8,}/g, "번호 생략")
    .replace(/\b(?:official|authorized)\b/gi, "공식")
    .replace(/\b(?:app|application)\b/gi, "앱")
    .replace(/\b(?:website|web\s*site)\b/gi, "웹사이트")
    .replace(/\b(?:link|url)\b/gi, "링크")
    .replace(/\b(?:sms)\b/gi, "문자")
    .replace(/\b(?:bank)\b/gi, "은행")
    .replace(/\b(?:address)\b/gi, "주소")
    .replace(/\b(?:phone)\b/gi, "전화")
    .replace(/\b(?:please)\b/gi, "")
    .replace(/\b[A-Za-z][A-Za-z0-9_-]*\b/g, "")
    .replace(/[<>{}]/g, "")
    .replace(/ {2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

export function classifyOffer(reply: string, suggestion: unknown): OfferKind | undefined {
  if (typeof reply !== "string" || typeof suggestion !== "string") return undefined;
  const text = reply.replace(/\s+/g, "");
  if (suggestion === "transfer" &&
      /(?:송금|이체|입금|결제|수리비|돈|금액|계좌)/.test(text) &&
      /(?:보내|송금해|이체해|입금해|결제해|부탁|해주|가능할까)/.test(text)) return "transfer";
  if (suggestion === "share" &&
      /(?:주소|개인정보|정보|이름|성함|인증|생년월일|주민등록)/.test(text) &&
      /(?:입력|전송|보내|알려|제출|작성|기재)/.test(text)) return "share";
  if (suggestion === "link" &&
      /(?:링크|사이트|페이지|주소)/.test(text) &&
      /(?:눌러|클릭|접속|열어|확인해|들어가)/.test(text)) return "link";
  if (suggestion === "call" &&
      /(?:번호|전화|연락처)/.test(text) &&
      /(?:전화해|연락해|걸어|통화해)/.test(text) &&
      !/(?:원래|기존|공식|대표|카드\s*뒷면)/.test(text)) return "call";
  // 공식 앱에서 배송지 주소를 '변경'하도록 요청하는 등 실제 앱 작업도 행동 제안이다.
  // Gemini의 offers 출력 누락과 무관하게, 발화에 분명히 등장한 경우만 복구한다.
  if (suggestion === "official_app" &&
      /(?:공식앱|은행앱|택배사앱|설치된앱)/.test(text) &&
      /(?:열어|조회|확인|들어가|실행|접속|수정|변경|바꿔|고쳐|등록|설정)/.test(text) &&
      !/(?:문자(?:속|의)?링크|보(?:내|낸|내드린|내준|내는)링크|받은링크)/.test(text) &&
      !/(?:공식앱(?:을|은|이)?(?:쓰지|사용하지|이용하지|열지|말고|대신)|공식앱(?:에|에서)?(?:는)?(?:접속하지|들어가지|확인하지|수정하지))/.test(text)) return "official_app";
  if (suggestion === "official_call" &&
      /(?:대표번호|고객센터|카드뒷면|공식번호)/.test(text) &&
      /(?:전화|연락|통화|확인)/.test(text) &&
      !/(?:제가(?:알려|보내)|이번호로)/.test(text)) return "official_call";
  return undefined;
}

/** 제안 메시지 안에 실제 언급된 행동만 추려 여러 개를 동시에 표시한다. */
export function classifyOffers(reply: string, proposed: unknown): OfferKind[] {
  const offered = Array.isArray(proposed) ? proposed : [proposed];
  const recognized: OfferKind[] = [];
  for (const suggestion of offered) {
    const kind = classifyOffer(reply, suggestion);
    if (kind && !recognized.includes(kind)) recognized.push(kind);
  }
  // 두 가지 안전 경로가 함께 등장해도 누락되지 않도록 명시된 경우에 한하여 추출
  for (const kind of ["official_app", "official_call"] as const) {
    if (classifyOffer(reply, kind) && !recognized.includes(kind)) recognized.push(kind);
  }
  return recognized.slice(0, 4);
}

/** 실제 외부 사이트로 연결할 수 없는 예약 도메인을 사용한 문자 링크 미리보기 */
export function simulatedLink(scenario: Scenario): LinkPreview {
  // 실제 접속될 수 없는 example 예약 도메인. 교육용 미리보기만 제공한다.
  const variants: Record<TrainingTopicId, { domain: string; title: string; description: string }> = {
    family: { domain: "m.message-notice.example", title: "메시지 안내 확인", description: "전달받은 내용 확인" },
    delivery: { domain: "m.delivery-notice.example", title: "배송 정보 확인", description: "배송 상태 및 주소 확인 안내" },
    bank: { domain: "m.account-notice.example", title: "거래 내역 확인", description: "거래 내역 확인 안내" },
    invitation: { domain: "m.invitation-notice.example", title: "모바일 초대장", description: "결혼식 안내 확인" },
    obituary: { domain: "m.memorial-notice.example", title: "부고 안내", description: "장례 안내 내용 확인" },
    traffic: { domain: "m.traffic-notice.example", title: "교통 고지 조회", description: "교통 관련 안내 확인" },
    loan: { domain: "m.loan-notice.example", title: "대출 상담 안내", description: "금융 상품 안내 확인" },
    job: { domain: "m.job-notice.example", title: "채용 지원 안내", description: "단기 업무 관련 안내" },
    card: { domain: "m.card-notice.example", title: "카드 배송 안내", description: "배송 내용 확인" },
    team_mission: { domain: "m.review-notice.example", title: "후기 정산 안내", description: "정산 내용 확인" },
    health: { domain: "m.health-notice.example", title: "건강검진 안내", description: "검진 관련 안내 확인" },
  };
  const preview = variants[scenario.topic];
  return { url: "https://" + preview.domain + "/view", domain: preview.domain,
    title: preview.title, description: preview.description };
}

/** 메신저 말풍선의 행동만 송금/정보제공/링크 열기로 인정한다. */
export function recordChoice(
  state: TrainingState, scenario: Scenario, choice: Choice, sourceIndex?: number, actionId?: string, method?: PhoneMethod,
): { state: TrainingState; notice: string } {
  if (state.closed || state.turns >= MAX_TURNS) throw new Error("이미 종료된 훈련입니다.");
  if (state.events.length >= 6 && choice !== "stop") throw new Error("행동 선택 횟수가 많습니다. 훈련을 마쳐 주세요.");

  // 휴대전화 패널은 연락처/전화/앱의 실제 선택 경로를 서버에 전달한다.
  // 첫 화면에서 직접 '검증 성공'을 실행하거나 타 경로로 위장하지 못하도록 확인한다.
  if (method) {
    if (sourceIndex !== undefined || actionId !== undefined ||
        state.events.some(e => e.method === method)) throw new Error("이미 선택한 행동입니다.");
    const institutional = !isPersonalTopic(scenario.topic);
    const valid = (choice === "family_contact" && method === "saved_family") ||
      (choice === "verify_sender" && method === "recent_sender") ||
      (choice === "verify" && (
        (method === "official_directory" && institutional) ||
        appSupportsTopic(method as TrainingApp, scenario.topic)
      ));
    if (!valid) throw new Error("이 상황에서 선택할 수 없는 휴대전화 기능입니다.");
  } else if (choice === "verify" && sourceIndex === undefined && actionId === undefined) {
    throw new Error("휴대전화에서 확인에 사용할 경로를 선택해 주세요.");
  }
  const sourceNeeded = (["verify_sender", "comply", "share", "open_link", "install"].includes(choice) &&
    !(choice === "verify_sender" && method === "recent_sender")) ||
    (choice === "verify" && !method);
  if (sourceNeeded) {
    if (!Number.isInteger(sourceIndex) || sourceIndex! < 0 || sourceIndex! >= state.messages.length) {
      throw new Error("해당 메시지에서 행동을 선택해 주세요.");
    }
    const message = state.messages[sourceIndex!];
    // 신규 형식은 단어 패턴과 관계없이 서버에 봉인된 구조화 행동 ID로 검증한다.
    // 기존 훈련 세션 및 단위 테스트를 위한 기존 offers 형식도 유지한다.
    if (message.actions) {
      const selected = message.actions.find(a => a.id === actionId);
      const expected = selected ? actionChoice(selected) : undefined;
      const viaLink = selected?.kind === "link" &&
        (selected.linkPreview?.interaction === "install" ? choice === "install" : choice === "share") &&
        state.events.some(e => e.choice === "open_link" && e.sourceIndex === sourceIndex && e.actionId === actionId);
      if (message.actor !== "them" || !selected || (expected !== choice && !viaLink)) {
        throw new Error("이 메시지에서는 해당 행동을 할 수 없습니다.");
      }
      if (["open_link", "verify_sender"].includes(choice) && state.events.some(e =>
        e.choice === choice && e.sourceIndex === sourceIndex && e.actionId === actionId)) {
        throw new Error("이미 선택한 행동입니다.");
      }
    } else {
      const offered = message.offers ?? (message.offer ? [message.offer] : []);
      const allowed = message.actor === "them" && (
        (choice === "verify" && (offered.includes("official_app") || offered.includes("official_call"))) ||
        (choice === "verify_sender" && offered.includes("call")) ||
        (choice === "comply" && offered.includes("transfer")) ||
        (choice === "open_link" && offered.includes("link") && !!message.linkPreview) ||
        (choice === "share" && (offered.includes("share") ||
          (offered.includes("link") && state.events.some(e => e.choice === "open_link" && e.sourceIndex === sourceIndex))))
      );
      if (!allowed) throw new Error("이 메시지에서는 해당 행동을 할 수 없습니다.");
      if (["open_link", "verify_sender"].includes(choice) && state.events.some(e =>
        e.choice === choice && e.sourceIndex === sourceIndex)) {
        throw new Error("이미 선택한 행동입니다.");
      }
    }
  }

  const check = verificationOutcome(scenario, choice, method);
  const event: Event = {
    choice, turn: state.turns, verifiedBefore: state.verification === "confirmed",
    ...(sourceNeeded ? { sourceIndex } : {}),
    ...(actionId ? { actionId } : {}),
    ...(method ? { method } : {}),
    ...(check ?? {}),
  };
  const verification = check && check.evidence !== "inconclusive" ? check.evidence : state.verification;
  const resolved = check?.evidence === "failed" && shouldResolveAfterIndependentCheck(state, scenario, choice, verification);
  // 카드 사례에서 문자에 첨부한 번호를 골랐을 때만 후속 요청을 재현한다.
  const cardCallback = scenario.topic === "card" && scenario.identity === "fraud" && choice === "verify_sender" &&
    sourceNeeded && state.messages[sourceIndex!]?.actions?.some(action => action.id === actionId && action.kind === "phone") &&
    !state.events.some(e => e.choice === "verify_sender" && e.actionId);
  const notice = check?.notice ?? (choice === "family_contact"
    ? "저장된 번호로 가족에게 상황을 말했어요. 가족은 지금 바로 결정하지 말고 따로 확인해 보자고 했어요."
    : choice === "verify_sender" ? cardCallback
      ? "문자에서 받은 번호로 전화했어요. 상담원은 반송 확인에 원격 지원이 필요하다며 새 문자를 보냈어요."
      : "선택한 번호로 전화했어요. 받은 사람은 자신이 담당자라고 답했어요."
    : choice === "verify_chat" ? "대화 상대는 자신이 맞다고 주장했습니다."
    : choice === "open_link" ? "메시지의 주소를 눌렀습니다. 가상의 페이지가 열렸습니다."
    : choice === "comply" ? "요청한 금액을 보낸 것으로 기록했습니다. 실제 돈은 이동하지 않았습니다."
    : choice === "share" ? "요청한 정보를 전송한 것으로 기록했습니다. 실제 정보는 전송하지 않았습니다."
    : choice === "install" ? "원격 지원 앱 설치를 선택했어요. 실제 앱은 설치되지 않았어요."
    : "이 대화를 종료했습니다.");
  const terminal = ["comply", "share", "install", "stop"].includes(choice);
  const callback = cardCallback ? buildActions([{
    kind: "link", origin: "sender", target: "반송 확인 지원", task: "원격 지원 안내 보기",
    previewTitle: "반송 확인 지원", previewDescription: "원격 지원 앱 설치",
  }], state.turns + MAX_TURNS) : [];
  if (callback[0]?.linkPreview) callback[0].linkPreview.interaction = "install";

  return {
    state: {
      ...state,
      verification,
      // 초반의 확인은 진행을 막지 않는다. 그러나 이미 위험 요청이 나왔고
      // 독립 확인으로 사칭이 판명됐다면 남은 대화의 학습 목표가 해소됐다.
      closed: resolved || terminal,
      endReason: resolved ? "resolved" : terminal ? "action" : state.endReason,
      events: [...state.events, event],
      messages: [...state.messages, { actor: "system", text: notice },
        ...(cardCallback ? [{
          actor: "them" as const, text: "반송 접수 담당입니다. 카드 신청 여부를 확인하려면 아래 링크를 열어서 원격 지원 앱을 설치해 주세요.",
          actions: callback,
        }] : []),
        ...(resolved ? [{ actor: "system" as const, text: "확인한 내용과 상대의 요청이 일치하지 않아 문자 대화를 마무리했어요. 지금까지의 대응을 살펴보세요." }] : [])],
    },
    notice,
  };
}

export function evaluate(state: TrainingState, scenario: Scenario, guess: Guess) {
  const requestReached = hasConcreteRequest(state.messages);
  // 독립 확인을 일찍 선택한 것과 충분한 대화에서 요청에 대응한 경험을 구분한다.
  // 실제 행동은 언제나 기록하되, 요구가 등장하지 않았다면 요구 대응 역량을 단정하지 않는다.
  const coverage = requestReached ? "request_reached" : state.turns < 2 ? "early" : "conversation_only";
  const checked = state.events.some(event => isIndependentCheck(event, scenario));
  const consultedFamily = state.events.some((event) => event.choice === "family_contact");
  const complied = state.events.some((event) => event.choice === "comply");
  const shared = state.events.some((event) => event.choice === "share");
  const installed = state.events.some(event => event.choice === "install");
  const linkOpened = state.events.some((event) => event.choice === "open_link");
  const followedSenderNumber = state.events.some((event) => event.choice === "verify_sender");
  const stopped = state.events.some((event) => event.choice === "stop");
  const riskyComply = state.events.some((event) =>
    event.choice === "comply" && (!event.verifiedBefore || scenario.identity === "fraud"),
  );
  const risk = shared || installed || riskyComply;
  const guessCorrect = guess === scenario.identity;
  const judgment = guess === "uncertain" ? "판단 보류" : guessCorrect ? "실제 정체와 일치" : "실제 정체와 다름";
  const safety = risk ? "신원 확인 전 위험한 요청에 응했어요" :
    complied && checked && scenario.identity === "legitimate" ? "독립 확인 후 요청을 처리했어요" :
    checked ? "별도의 신뢰할 수 있는 경로로 확인했어요" :
    stopped ? "대화를 중단해 직접적인 피해를 피했어요" :
    consultedFamily ? "가족에게 상황을 공유했어요. 해당 기관의 신원 확인은 별도로 필요해요" :
    linkOpened ? "메시지 속 링크를 열었지만 정보는 제출하지 않았어요" :
    followedSenderNumber ? "상대가 알려준 번호로 확인을 시도했어요" :
    "위험한 요청은 실행하지 않았지만 신원 확인도 하지 않았어요";

  const feedback: string[] = [];
  if (checked) feedback.push("기존 연락처나 공식 채널로 직접 확인한 행동은 실제 상황에서도 도움이 됩니다.");
  if (consultedFamily && !checked) feedback.push("가족에게 조언을 구하는 것은 도움이 되지만 은행·택배사 등 기관의 신원 확인을 대신하지는 않습니다.");
  else feedback.push("상대가 누구인지 불확실할 때에는 기존 번호나 공식 앱으로 따로 확인해 보세요.");
  if (followedSenderNumber) feedback.push("상대가 알려준 번호로 통화하는 것은 독립 확인이 아닙니다. 사칭범의 공범과 연결될 수도 있습니다.");
  if (linkOpened) feedback.push("메시지에 포함된 링크를 열었습니다. 링크의 출처가 확실하지 않다면 공식 앱에서 직접 확인하는 편이 안전합니다.");
  if (risk) feedback.push("확인하기 전에 금전·개인정보 요청에 응했습니다. 실제 상황에서는 피해로 이어질 수 있는 행동입니다.");
  if (stopped && scenario.identity === "legitimate") feedback.push("실제 연락을 차단한 경우입니다. 안전을 위해 중단한 뒤 별도 경로로 연락을 확인하면 좋습니다.");
  if (state.endReason === "natural" && !checked) feedback.push("대화가 자연스럽게 끝난 사실만으로 상대 신원을 확인한 것은 아닙니다. 필요한 경우 공식 경로로 확인해 보세요.");
  if (guess !== "uncertain" && !guessCorrect) feedback.push("이번 정체 판단은 실제와 달랐습니다. 말투보다 별도 경로에서 확인한 정보를 기준으로 판단해 보세요.");
  if (guess === "uncertain" && !checked) feedback.push("확신하기 어렵다면 판단을 보류하고 별도로 확인하는 것이 좋습니다.");
  if (!risk && !linkOpened && !followedSenderNumber && !checked) feedback.push("위험한 행동을 하지 않았지만, 적극적으로 신원을 확인하는 연습도 해 보세요.");

  // 답변 문구가 아니라 실제로 기록된 행동에 기반한 짧은 피드백.
  type Point = { keyword: string; text: string };
  const goodPoints: Point[] = [];
  const improvePoints: Point[] = [];
  if (checked) goodPoints.push({ keyword: "독립 확인", text: "기존 번호·공식 채널로 확인" });
  if (consultedFamily && !checked) goodPoints.push({ keyword: "가족 상담", text: "저장된 번호로 가족에게 문의" });
  if (stopped) goodPoints.push({ keyword: "대화 중단", text: "요청에 응하지 않고 멈춤" });
  if (!complied && !shared) goodPoints.push({ keyword: "정보 보호", text: "송금·개인정보 제공 안 함" });

  if (riskyComply) improvePoints.push({ keyword: "송금 위험", text: "신원 확인 전에 요청 수락" });
  if (shared) improvePoints.push({ keyword: "정보 위험", text: "요청한 개인정보를 전송" });
  if (linkOpened) improvePoints.push({ keyword: "링크 주의", text: "문자 링크 대신 공식 앱 이용" });
  if (followedSenderNumber) improvePoints.push({ keyword: "번호 주의", text: "상대가 알려준 번호는 독립 확인이 아님" });
  if (!checked && !risk) improvePoints.push({ keyword: "신원 확인", text: "원래 번호·공식 앱으로 직접 확인" });
  if (stopped && scenario.identity === "legitimate") improvePoints.push({ keyword: "정상 연락", text: "중단 뒤 실제 발신자에게 별도 확인" });
  if (guess !== "uncertain" && !guessCorrect) improvePoints.push({ keyword: "판단 보완", text: "말투보다 확인된 사실을 기준으로 판단" });

  const status = risk ? "위험 행동" : checked ? "안전 확인" : stopped ? "대화 중단" :
    consultedFamily ? "가족 상담" :
    linkOpened || followedSenderNumber ? "주의 행동" : "확인 미완료";
  const actionTitle = shared ? "정보 전송" : complied ? "요청 수락" :
    checked ? "직접 확인" : consultedFamily ? "가족에게 문의" : stopped ? "대화 중단" :
    linkOpened ? "링크 열람" : followedSenderNumber ? "안내 번호 연락" : "대화 종료";

  return {
    coverage,
    topic: scenario.topic,
    installed,
    behavior: buildBehaviorFeedback(state, scenario),
    highlights: {
      status,
      actionTitle,
      good: goodPoints.slice(0, 2),
      improve: improvePoints.slice(0, 3),
      judgment: guess === "uncertain" ? "판단 보류" : guessCorrect ? "판단 일치" : "판단 불일치",
      tip: scenario.safePractice,
    },
    identity: scenario.identity,
    truthLabel: scenario.identity === "legitimate" ? "실제 연락" : "사칭 시도",
    purpose: scenario.purpose,
    checked,
    safety,
    judgment,
    dangerousAction: risk,
    linkOpened,
    followedSenderNumber,
    verified: state.verification,
    verificationEvidence: scenario.verification,
    feedback: feedback.slice(0, 5),
    nextStep: scenario.safePractice,
    note: "이 결과는 가상 대화에서 기록한 행동 피드백으로, 실제 사기 피해 위험도에 대한 진단은 아닙니다.",
  };
}
