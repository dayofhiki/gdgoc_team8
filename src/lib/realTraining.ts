import { actionChoice } from "./trainingActions.ts";
import type { Action } from "./trainingActions";
import type { DialogueMemory, EndReason } from "./trainingDialogue.ts";

/**
 * 실전 대응 훈련: AI 대사와 별개로 서버가 보관하는 시나리오 및 채점 기준.
 * 정상/사기 시나리오는 같은 첫 메시지를 사용한다. 실제 정체와 확인 결과는 클라이언트에 공개하지 않는다.
 * 사용자에게는 정답보다 미확인 요청에 대한 독립 확인·위험 행동 여부를 중심으로 설명한다.
 */
export type Identity = "legitimate" | "fraud";
export type Guess = "legitimate" | "fraud" | "uncertain";
export type Choice = "verify" | "family_contact" | "verify_sender" | "verify_chat" | "comply" | "share" | "stop" | "open_link";
export type OfferKind = "transfer" | "share" | "link" | "call" | "official_app" | "official_call";
export type Actor = "them" | "me" | "system";
export type LinkPreview = { url: string; domain: string; title: string; description: string };
export type Message = { actor: Actor; text: string; offer?: OfferKind; offers?: OfferKind[]; linkPreview?: LinkPreview; actions?: Action[] };
export type Event = { choice: Choice; verifiedBefore: boolean; turn: number; sourceIndex?: number; actionId?: string };
export type Scenario = {
  id: string;
  identity: Identity;
  title: string;
  opening: string;
  persona: string;
  privateFacts: string;
  verification: string;
  purpose: string;
  safePractice: string;
};
type Pair = Omit<Scenario, "id" | "identity" | "privateFacts" | "verification" | "purpose"> & {
  legit: Pick<Scenario, "privateFacts" | "verification" | "purpose">;
  fraud: Pick<Scenario, "privateFacts" | "verification" | "purpose">;
};

const PAIRS: Pair[] = [
  {
    title: "가족의 급한 연락",
    opening: "엄마, 나 휴대폰이 갑자기 고장 나서 다른 번호로 연락해. 수리비가 좀 급하게 필요할 것 같아.",
    persona: "성인 자녀. 부모와 평소 친하게 대화하며, 지금 잠시 다른 번호로 메시지를 보낸다.",
    safePractice: "새로운 번호에서 가족을 사칭하거나 돈을 요청하면 원래 저장된 번호 또는 다른 독립적인 가족 연락처로 먼저 확인해요.",
    legit: {
      privateFacts: "실제 자녀이다. 본인 휴대전화의 화면이 고장나 다른 기기로 문자 중이다. 실제로 수리비가 필요하지만 어머니가 확인하겠다고 해도 존중한다. 원래 번호는 통화 연결 가능한 다른 기기로 옮겨 놓았다.",
      verification: "기존에 저장된 자녀의 번호로 직접 통화했습니다. 실제 자녀가 휴대전화 수리 상황과 부탁을 확인해 주었습니다.",
      purpose: "자녀의 실제 수리비 부탁",
    },
    fraud: {
      privateFacts: "자녀를 사칭한 제삼자이다. 가족 관계의 구체적 정보는 모르고 새 번호로 접근하여 송금을 유도하려 한다. 조급함이나 서운함을 표현할 수 있지만 상투적인 사기 대사나 과장된 협박은 피한다.",
      verification: "기존에 저장된 자녀의 번호로 직접 통화했습니다. 자녀는 휴대전화가 고장 난 적도, 돈을 부탁한 적도 없다고 했습니다.",
      purpose: "자녀를 사칭해 돈을 받으려는 시도",
    },
  },
  {
    title: "택배 주소 확인 연락",
    opening: "안녕하세요, 택배 배송 관련해서 연락드렸습니다. 주소 확인이 필요한 건이 있어요.",
    persona: "택배 배송 담당자처럼 연락한 사람. 고객에게 예의 있고 간결하게 한국어 문자로 안내한다.",
    safePractice: "배송 정보는 문자에 포함된 링크를 바로 누르기보다 택배사 공식 앱이나 직접 찾은 공식 고객센터에서 확인해요.",
    legit: {
      privateFacts: "실제 배송업체 안내이다. 잘못된 주소 때문에 재확인을 요청한다. 문자 링크를 클릭하도록 강요하지 않으며, 공식 배송 조회 화면에서 수정하도록 안내할 수 있다.",
      verification: "택배사 공식 앱에서 실제 배송 건과 주소 확인 요청을 확인했습니다. 고객센터에서도 해당 안내가 맞다고 확인했습니다.",
      purpose: "실제 택배 배송지 확인",
    },
    fraud: {
      privateFacts: "배송 담당자를 사칭한 사람이다. 주소나 개인정보 입력을 유도하는 가상의 외부 링크를 안내하려 하지만 실제 URL이나 전화번호는 제공하지 않는다. 처음에는 정상 안내처럼 자연스럽게 대화한다.",
      verification: "택배사 공식 앱에는 해당 배송 건이나 주소 오류 안내가 없습니다. 공식 고객센터에서도 그런 요청을 하지 않았다고 확인했습니다.",
      purpose: "택배를 사칭해 개인정보 입력을 유도하는 시도",
    },
  },
  {
    title: "은행 거래 확인 연락",
    opening: "고객님, 평소와 다른 거래가 감지되어 안내 연락드렸습니다. 거래 내역 확인을 부탁드립니다.",
    persona: "은행의 거래 안내 담당자처럼 연락한 사람. 자연스럽고 공손한 한국어로 짧게 답한다.",
    safePractice: "은행을 사칭한 연락인지 알 수 없을 때는 통화를 마치고 공식 앱이나 카드 뒷면의 대표번호로 확인하세요. 문자 속 링크나 상대가 알려준 번호는 사용하지 않아요.",
    legit: {
      privateFacts: "은행의 실제 이상 거래 안내이다. 개인정보나 송금을 요구하지 않는다. 공식 앱과 기존 대표번호로 확인하도록 안내하고 고객의 독립 확인을 존중한다.",
      verification: "은행 공식 앱에 동일한 거래 알림이 표시됩니다. 카드에 적힌 대표번호로 직접 연락해 실제 안내였음을 확인했습니다.",
      purpose: "은행의 실제 이상 거래 안내",
    },
    fraud: {
      privateFacts: "은행을 사칭하여 가상 안전 계좌로 이체하거나 개인정보를 제공하도록 유도하려는 사람이다. 실제 은행 정보, 전화번호, URL, 계좌번호는 절대로 제시하지 않는다. 자연스러운 존댓말을 사용한다.",
      verification: "은행 공식 앱에 해당 거래 알림이 없습니다. 카드에 적힌 대표번호로 직접 확인한 결과 은행은 그런 연락을 하지 않았습니다.",
      purpose: "은행을 사칭한 송금·개인정보 요구",
    },
  },
];

export const MAX_TURNS = 8;

export const SCENARIOS: Scenario[] = PAIRS.flatMap((pair, index) => {
  const base = { title: pair.title, opening: pair.opening, persona: pair.persona, safePractice: pair.safePractice };
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
  if (scenario.title.includes("택배")) return {
    url: "https://m.delivery-notice.example/track",
    domain: "m.delivery-notice.example",
    title: "배송 정보 확인",
    description: "배송 상태 및 주소 확인 안내",
  };
  if (scenario.title.includes("은행")) return {
    url: "https://m.account-notice.example/check",
    domain: "m.account-notice.example",
    title: "거래 내역 확인",
    description: "요청하신 거래 정보를 조회하세요",
  };
  return {
    url: "https://m.message-notice.example/view",
    domain: "m.message-notice.example",
    title: "메시지 안내 확인",
    description: "전달받은 안내 내용 확인",
  };
}

/** 메신저 말풍선의 행동만 송금/정보제공/링크 열기로 인정한다. */
export function recordChoice(
  state: TrainingState, scenario: Scenario, choice: Choice, sourceIndex?: number, actionId?: string,
): { state: TrainingState; notice: string } {
  if (state.closed || state.turns >= MAX_TURNS) throw new Error("이미 종료된 훈련입니다.");
  if (state.events.length >= 6) throw new Error("행동 선택 횟수가 많습니다. 훈련을 마쳐 주세요.");

  const sourceNeeded = ["verify", "verify_sender", "comply", "share", "open_link"].includes(choice);
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
      const viaLink = selected?.kind === "link" && choice === "share" &&
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

  const event: Event = {
    choice, turn: state.turns, verifiedBefore: state.verification === "confirmed",
    ...(sourceNeeded ? { sourceIndex } : {}),
    ...(actionId ? { actionId } : {}),
  };
  const familyScenario = scenario.id.startsWith("0-");
  const verification = choice === "verify" || (choice === "family_contact" && familyScenario)
    ? scenario.identity === "legitimate" ? "confirmed" : "failed"
    : state.verification;
  const notice = choice === "verify" ? scenario.verification
    : choice === "family_contact" ? (familyScenario ? scenario.verification :
        "저장된 번호로 가족에게 연락해 상황을 공유했습니다. 실제 기관의 신원은 아직 별도로 확인하지 않았습니다.")
    : choice === "verify_sender" ? "안내받은 번호로 전화하니 상대는 자신이 맞다고 말했습니다."
    : choice === "verify_chat" ? "대화 상대는 자신이 맞다고 주장했습니다."
    : choice === "open_link" ? "메시지의 주소를 눌렀습니다. 가상의 페이지가 열렸습니다."
    : choice === "comply" ? "요청한 금액을 보낸 것으로 기록했습니다. 실제 돈은 이동하지 않았습니다."
    : choice === "share" ? "요청한 정보를 전송한 것으로 기록했습니다. 실제 정보는 전송하지 않았습니다."
    : "이 대화를 종료했습니다.";

  return {
    state: {
      ...state,
      verification,
      closed: ["verify", "family_contact", "comply", "share", "stop"].includes(choice),
      endReason: ["verify", "family_contact", "comply", "share", "stop"].includes(choice) ? "action" : state.endReason,
      events: [...state.events, event],
      messages: [...state.messages, { actor: "system", text: notice }],
    },
    notice,
  };
}

export function evaluate(state: TrainingState, scenario: Scenario, guess: Guess) {
  const checked = state.events.some((event) => event.choice === "verify" ||
    (event.choice === "family_contact" && scenario.id.startsWith("0-")));
  const consultedFamily = state.events.some((event) => event.choice === "family_contact");
  const complied = state.events.some((event) => event.choice === "comply");
  const shared = state.events.some((event) => event.choice === "share");
  const linkOpened = state.events.some((event) => event.choice === "open_link");
  const followedSenderNumber = state.events.some((event) => event.choice === "verify_sender");
  const stopped = state.events.some((event) => event.choice === "stop");
  const riskyComply = state.events.some((event) =>
    event.choice === "comply" && (!event.verifiedBefore || scenario.identity === "fraud"),
  );
  const risk = shared || riskyComply;
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
    highlights: {
      status,
      actionTitle,
      good: goodPoints.slice(0, 2),
      improve: improvePoints.slice(0, 3),
      judgment: guess === "uncertain" ? "판단 보류" : guessCorrect ? "판단 일치" : "판단 불일치",
      tip: scenario.title.includes("가족") ? "저장된 가족 번호로 직접 연락" : scenario.title.includes("택배") ? "택배사 공식 앱에서 배송 조회" : "은행 공식 앱·대표번호로 확인",
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
