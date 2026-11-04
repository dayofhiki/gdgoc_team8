/**
 * 실전 대응 훈련: AI 대사와 별개로 서버가 보관하는 시나리오 및 채점 기준.
 * 정상/사기 시나리오는 같은 첫 메시지를 사용한다. 실제 정체와 확인 결과는 클라이언트에 공개하지 않는다.
 * 사용자에게는 정답보다 미확인 요청에 대한 독립 확인·위험 행동 여부를 중심으로 설명한다.
 */
export type Identity = "legitimate" | "fraud";
export type Guess = "legitimate" | "fraud" | "uncertain";
export type Choice = "verify" | "comply" | "share" | "stop";
export type Actor = "them" | "me" | "system";
export type Message = { actor: Actor; text: string };
export type Event = { choice: Choice; verifiedBefore: boolean; turn: number };
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
};

export function recordChoice(state: TrainingState, scenario: Scenario, choice: Choice): { state: TrainingState; notice: string } {
  if (state.closed) throw new Error("이미 종료된 훈련입니다.");
  if (choice === "verify" && state.verification !== "none") {
    throw new Error("이미 공식 경로로 확인했습니다.");
  }
  const event: Event = { choice, turn: state.turns, verifiedBefore: state.verification === "confirmed" };
  const verification = choice === "verify"
    ? scenario.identity === "legitimate" ? "confirmed" : "failed"
    : state.verification;
  const notice = choice === "verify" ? scenario.verification
    : choice === "comply" ? "상대방의 요청을 따른 것으로 기록했습니다. 실제 송금이나 정보 전송은 일어나지 않았습니다."
    : choice === "share" ? "개인정보를 제공한 것으로 가정했습니다. 실제 개인정보는 입력하거나 전송하지 않았습니다."
    : "상대와의 대화를 중단했습니다.";
  return {
    state: {
      ...state,
      verification,
      closed: choice !== "verify",
      events: [...state.events, event],
      messages: [...state.messages, { actor: "system", text: notice }],
    },
    notice,
  };
}

export function evaluate(state: TrainingState, scenario: Scenario, guess: Guess) {
  const checked = state.events.some((event) => event.choice === "verify");
  const complied = state.events.some((event) => event.choice === "comply");
  const shared = state.events.some((event) => event.choice === "share");
  const stopped = state.events.some((event) => event.choice === "stop");
  const riskyComply = state.events.some((event) => event.choice === "comply" && (!event.verifiedBefore || scenario.identity === "fraud"));
  const risk = shared || riskyComply;
  const guessCorrect = guess === scenario.identity;
  const judgment = guess === "uncertain" ? "판단 보류" : guessCorrect ? "실제 정체와 일치" : "실제 정체와 다름";
  const safety = risk ? "위험한 행동을 연습에서 실행했어요" :
    complied && checked && scenario.identity === "legitimate" ? "독립 확인 후 요청을 처리했어요" :
    stopped ? "위험한 요청을 실행하지 않고 중단했어요" :
    checked ? "독립적으로 확인했어요" : "위험한 행동은 없었지만 확인 행동도 없었어요";
  const points: string[] = [];
  if (checked) points.push("상대가 알려준 경로가 아니라 원래 알고 있던 공식 경로로 직접 확인했습니다.");
  else points.push("상대에게 확인하겠다고 말한 것만으로는 실제 확인이 끝나지 않습니다. 기존 번호나 공식 앱으로 별도로 확인해 보세요.");
  if (risk) points.push("신원이 검증되기 전에 상대 요구를 따르거나 개인정보를 제공하는 행동은 실제 피해로 이어질 수 있습니다.");
  else if (stopped && scenario.identity === "legitimate") points.push("대화 중단은 위험을 막지만 상대가 실제 가족·기관일 가능성까지 배제하진 못합니다. 이후 독립적인 경로로 확인하면 더 좋습니다.");
  else points.push("확인되지 않은 상대에게 돈이나 개인정보를 전달하지 않았습니다.");
  if (guess !== "uncertain" && !guessCorrect) points.push("이번 정체 판단은 실제와 달랐습니다. 대화의 말투보다 공식 경로로 확인된 사실을 근거로 판단해 보세요.");
  if (guess === "uncertain" && !checked) points.push("정보가 부족할 때 판단을 보류한 것은 자연스럽습니다. 다음에는 직접 확인 행동까지 이어가 보세요.");
  return {
    identity: scenario.identity,
    truthLabel: scenario.identity === "legitimate" ? "실제 연락" : "사칭 시도",
    purpose: scenario.purpose,
    checked,
    safety,
    judgment,
    dangerousAction: risk,
    verified: state.verification,
    verificationEvidence: scenario.verification,
    feedback: points.slice(0, 4),
    nextStep: scenario.safePractice,
    note: "이번 결과는 모의 훈련에서 기록한 행동에 대한 피드백입니다. 실제 사기 피해 위험도나 능력을 진단하지 않습니다.",
  };
}
