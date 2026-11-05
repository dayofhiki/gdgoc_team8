/**
 * 실전 대응 훈련 대화 감독.
 *
 * 발화 내용은 LLM이 담당한다. 서버는 다음 대화의 맥락과 종료 상태를
 * JSON으로 추적하며, 직접 확인/송금/정보 제공을 수행했다고 추측하지 않는다.
 * 아래 사례 메모는 공개 사례의 원문 녹취가 아닌 교육용 원칙을 정리한 것이다.
 */
import type { Scenario } from "./realTraining.ts";
import type { Action } from "./trainingActions.ts";
import { RESPONSE_SCHEMA, type Proposed } from "./trainingActions.ts";

export type Stage = "contact" | "context" | "request" | "closing";
export type LearnerMove = "question" | "acknowledge" | "decline" | "verify_intent" | "verified_claimed" | "claimed_action" | "suspect" | "engage" | "exit";
export type SpeakerMove = "explain" | "ask" | "answer" | "smalltalk" | "close" | "none";
export type DialogueSignal = {
  stage: Stage;
  learnerMove: LearnerMove;
  speakerMove: SpeakerMove;
  hasPendingRequest: boolean;
  conversationComplete: boolean;
  summary: string;
};
export type DialogueOutput = { reply: string; actions: Proposed[]; dialogue: DialogueSignal };
export type DialogueMemory = {
  stage: Stage;
  hasPendingRequest: boolean;
  lastSpeakerMove: SpeakerMove;
  lastReply: string;
  lastSummary: string;
  repeatCount: number;
};
export type EndReason = "natural" | "turn_limit" | "action" | "resolved";

const STAGES: Stage[] = ["contact", "context", "request", "closing"];
const LEARNER: LearnerMove[] = ["question", "acknowledge", "decline", "verify_intent", "verified_claimed", "claimed_action", "suspect", "engage", "exit"];
const SPEAKER: SpeakerMove[] = ["explain", "ask", "answer", "smalltalk", "close", "none"];

export const DIALOGUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...RESPONSE_SCHEMA.properties,
    dialogue: {
      type: "object",
      additionalProperties: false,
      properties: {
        stage: { type: "string", enum: STAGES },
        learnerMove: { type: "string", enum: LEARNER },
        speakerMove: { type: "string", enum: SPEAKER },
        hasPendingRequest: { type: "boolean" },
        conversationComplete: { type: "boolean" },
        summary: { type: "string" },
      },
      required: ["stage", "learnerMove", "speakerMove", "hasPendingRequest", "conversationComplete", "summary"],
    },
  },
  required: ["reply", "actions", "dialogue"],
};

export function parseDialogueOutput(text: string): DialogueOutput {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INVALID_DIALOGUE_SCHEMA");
  const value = raw as Record<string, unknown>;
  const dialogue = value.dialogue as Record<string, unknown> | undefined;
  if (!dialogue || typeof dialogue !== "object" ||
    !STAGES.includes(dialogue.stage as Stage) ||
    !LEARNER.includes(dialogue.learnerMove as LearnerMove) ||
    !SPEAKER.includes(dialogue.speakerMove as SpeakerMove) ||
    typeof dialogue.hasPendingRequest !== "boolean" ||
    typeof dialogue.conversationComplete !== "boolean" ||
    typeof dialogue.summary !== "string" ||
    typeof value.reply !== "string" ||
    !Array.isArray(value.actions) || value.actions.length > 8 ||
    !value.actions.every((a: Proposed) => a && typeof a === "object" &&
      ["app", "phone", "link", "transfer", "provide_data"].includes(a.kind) &&
      ["installed", "preexisting", "sender"].includes(a.origin) &&
      ["target", "task", "previewTitle", "previewDescription"].every(k => typeof a[k as keyof Proposed] === "string"))) {
    throw new Error("INVALID_DIALOGUE_SCHEMA");
  }
  if (!value.reply.trim() && (!dialogue.conversationComplete || dialogue.speakerMove !== "none")) {
    throw new Error("EMPTY_NONTERMINAL_REPLY");
  }
  return {
    reply: value.reply,
    actions: value.actions as Proposed[],
    dialogue: dialogue as DialogueSignal,
  };
}

export const DIALOGUE_POLICY = [
  "상대의 지난 대답을 기억하고, 이미 끝난 설명을 기계적으로 반복하지 않는다.",
  "정상 인물은 훈련의 정답을 알려 주는 안전 강사가 아니다. 자신이 먼저 기존 번호 전화, 공식 앱, 고객센터, 송금 계좌 등 해결·검증 경로를 제안하거나 안내하지 않는다. 사용자가 스스로 확인하겠다고 말하면 간결하고 자연스럽게 수긍만 한다.",
  "사칭자와 정상 인물이 같은 문제해결 안내 대본을 공유하면 안 된다. 구체적인 행동 지시나 유도는 사칭자의 비공개 목적에서만 등장할 수 있다. 정상 인물은 본인의 용건과 사실을 이야기하고 사용자 선택을 기다린다.",
  "반드시 직전 사용자의 질문·감정·거절에 먼저 반응한다. 전혀 묻지 않은 금액·업체·거래·가족사를 새로 확정하지 않는다.",
  "역할의 실제 사정과 말투를 유지한다. 친한 가족은 간결한 반말, 고객 안내는 자연스러운 존댓말을 사용한다. 모든 등장인물이 똑같은 상담 문구를 말하지 않는다.",
  "요청은 사정이 전달된 뒤 자연스럽게 등장할 수 있으며, 매 턴 링크·송금·개인정보 제공을 제안하는 진행표가 아니다.",
  "거절·의심에 대한 반응은 정체별 설정과 관계에 맞아야 한다. 근거 없는 가짜 사실·새로운 기관·위기를 추가해 상대를 설득하지 않는다.",
  "실제 사례에서 나타나는 관계·급박함·확인 회피를 상황에 맞게 반영하되, 피해사례 원문이나 공통 사기 대본을 복사하지 않는다.",
  "사용자가 묻는 구체적인 질문에 먼저 답한다. 맥락에 없는 새 사건이나 피해금액은 지어내지 않는다.",
  "모든 턴마다 금전·링크 요청을 반복할 필요는 없다. 대화의 흐름과 현재 관계에 맞는 한 가지 반응을 한다.",
  "사용자의 짧은 맞장구를 질문으로 오인하지 않는다. 응답할 필요가 사라졌으면 대화를 마무리한다.",
  "대화가 끝난 다음에 새 문자로 또 인사하거나 같은 약속을 반복하지 않는다.",
  "연락 유형에 맞는 현실의 말투와 질문 흐름을 따르되 예문을 읽듯 고정 대사를 반복하지 않는다. 각 메시지는 사용자의 실제 마지막 질문에 응답하고, 정해진 사실을 넘어서지 않는다.",
  "실제로 상대가 더 이상 할 말이 없고, 사용자가 마지막 인사에 응한 경우 reply를 빈 문자열로 둘 수 있다. 이때 speakerMove=none, conversationComplete=true.",
  "아직 해결되지 않은 명시적인 확인 요청이나 사용자의 질문이 있으면 conversationComplete=false.",
  "위협·재촉·공식 기관 사칭 같은 징후는 관련 시나리오의 맥락에서만 사용한다. 모든 시나리오에 똑같은 진행 단계를 강요하지 않는다.",
  "피싱 교육 상황의 가상 대화로만 응답하며 실제 결제·인증·설치·송금·전화번호·외부 URL은 만들지 않는다.",
  "독립 확인을 하겠다는 말은 실제로 확인했다는 뜻이 아니다. 확인 완료 사실은 서버의 행동 이벤트가 있을 때만 성립한다.",
  "정체와 답을 대화에 직접 공개하지 않는다. 정상 연락과 사칭 연락 모두 평범한 한국어 대화가 가능해야 한다.",
  "dialogue.stage는 contact(첫 접촉), context(사정 설명), request(진행 중인 요청), closing(요청이 해결되거나 대화를 끝내는 중) 중 하나다.",
  "dialogue.learnerMove는 마지막 사용자 발화의 맥락상 의도에 대한 추정이다. question=질문, acknowledge=맞장구, decline=요청 거절, verify_intent=상대가 알려준 수단이 아닌 기존 독립 연락처로 확인하겠다는 의사, verified_claimed=이미 다른 가족·기관에 확인했다고 말함(실제 확인 증거 아님), claimed_action=이미 돈을 보냈거나 링크를 눌렀다고 말함(실제 행동 증거 아님), suspect=사칭·피싱 의심, engage=일반 대화, exit=상대와 대화 종료. 단순히 '진짜 너 맞아?'는 의심 단정이 아니라 질문일 수 있다.",
  "말로 '입금했다', '확인했다'고 해도 실제 행동이 발생했다고 확정하지 않는다. 서버 이벤트가 없으면 확인·송금 성공으로 채점하지 않는다. 상대방의 반응으로 성공/실패를 판정하지 않는다.",
  "dialogue.speakerMove는 현재 reply의 역할이다. explain / ask / answer / smalltalk / close / none.",
  "dialogue.hasPendingRequest는 대화 참가자가 아직 답하거나 수행하기를 기다리는 핵심 요청이 있는지 표시한다.",
  "dialogue.conversationComplete는 화자가 실제로 대화를 끝냈고 현재 더 할 말이 없을 때만 true다.",
  "dialogue.summary는 이번 턴에서 새로 확정된 사실 또는 남은 용건을 짧게 요약한다. 개인정보를 넣지 않는다.",
].join("\n");

/** 연구·공공자료에서 확인 가능한 유형 수준의 특징만 시나리오에 반영. 원문 재현 아님. */
export const CASE_GUIDES: Record<string, {
  source: string[];
  scene: string;
  dynamics: string;
  legitimate: string;
  fraud: string;
}> = {
  "0": {
    source: ["https://www.kfcc.co.kr/cc/financialFraudPrevention.do"],
    scene: "새 번호로 자녀라고 연락한 상황. 본인 확인 전까지 정상/사칭을 모른다. 가족을 가장한 실제 메신저피싱 예방사례의 전형적 접촉 방식을 교육용으로 추상화한다.",
    dynamics: "짧은 일상적 발화, 서로가 이미 아는 사실과 아직 확인되지 않은 사실을 구분하고, 대화가 정리되면 인사만 반복하지 않는다.",
    legitimate: "실제 자녀의 급한 사정이 있어도 가족이 확인하겠다는 요청을 존중한다. 새로운 핑계나 송금 요구를 끝없이 추가하지 않는다.",
    fraud: "관계의 친밀함을 주장하는 메시지와 금전 관련 용건이 등장할 수 있다. 사용자가 독립 확인을 하려는 경우 반응은 인물의 설정 범위 내에서만 묘사한다.",
  },
  "1": {
    source: ["https://www.fsc.go.kr/po010105/83034"],
    scene: "택배 배송지 오류 문자로 접촉한 상황. 사용자는 해당 배송이 있는지, 링크가 안전한지 모른다. 택배 문자사기 경고에서 보이는 접촉 유형만 참고한다.",
    dynamics: "일반적인 배송 안내와 불확실한 외부 링크 요청을 구별하게 한다. 주소 문제가 해결됐다고 주장하기 전에 실제 처리 이벤트가 있었는지 살핀다.",
    legitimate: "실제 배송사의 고객 응대이며 사용자가 기존 공식 경로로 확인해도 무방하다. 임의의 사기 징후를 만들지 않는다.",
    fraud: "외부 사이트나 정보 제출 유도는 가상의 행동 대상으로만 표현한다. 실제 사이트·계좌·개인정보를 만들어내지 않는다.",
  },
  "2": {
    source: [
      "https://www.fsc.go.kr/no010101/87882",
      "https://www.fsc.go.kr/po010105/83034",
    ],
    scene: "금융 보안 관련 문자를 빙자한 접근. 결제 유형과 금액은 세션에 고정한 가상 주장이고 실제 거래 조회가 아니다. 금융당국의 기관사칭·스미싱 예방 유형을 참고한다.",
    dynamics: "사용자가 어떤 거래인지 물으면 고정된 가상 결제 종류·금액을 답한다. 대화 목적은 거래 여부만 확인시키는 안내가 아니라 부적절한 정보·송금 요구에 스스로 대응하는 행동 선택이다.",
    legitimate: "실제 거래 안내로, 독립적 확인을 존중하고 새 송금이나 개인정보 제공을 강요하지 않는다.",
    fraud: "안전 확인을 명목으로 잔액·계좌 정보·인증정보를 문자로 받거나 모의 이체를 제안할 수 있다. 공식 앱 확인만 권하며 대화를 끝내지 않는다. 실제 번호·계좌·URL은 만들지 않는다.",
  },
  "3": {
    source: ["https://www.krcert.or.kr/kr/bbs/view.do?bbsId=B0000133&menuNo=205020&nttId=71676"],
    scene: "결혼 소식과 모바일 청첩장이라는 개인 연락. KISA가 2025년 실제 지인의 연락처로 보이는 청첩장 위장 스미싱을 경고했다. 정상 초대도 존재하므로 최초 연락만으로 신원을 단정하지 않는다.",
    dynamics: "일상적 안부와 초대 소식에 자연스럽게 반응하고, 링크 클릭이나 정보 입력 요청이 나와도 사용자의 의사에 맞춰 다음 대화를 바꾼다. 첫 문자부터 링크를 밀어 넣지 않는다.",
    legitimate: "실제 지인이 결혼 소식을 전하는 입장이며 확인을 기다릴 수 있다. 이름·날짜를 꾸며내거나 무리한 개인정보 요청을 하지 않는다.",
    fraud: "결혼식 정보 확인을 내세우는 가상 초대장 링크를 제안할 수 있다. 지인의 사적인 추억을 알아맞히지 못하는 설정을 유지한다.",
  },
  "4": {
    source: ["https://www.kisa.or.kr/1020601", "https://www.krcert.or.kr/kr/bbs/view.do?bbsId=B0000133&menuNo=205020&nttId=71676"],
    scene: "지인의 부고를 전한다는 문자. 온라인 부고 안내를 사칭하는 악성 링크가 유통되는 유형을 교육용으로 구성했다. 정상적인 부고 연락도 가능하다.",
    dynamics: "조심스럽고 절제된 말투를 쓰며 누가 돌아가셨는지 질문받아도 제공받지 않은 실명은 만들지 않는다.",
    legitimate: "실제 안타까운 소식을 전달하되 감정적 압박이나 불필요한 개인정보 요청을 하지 않는다.",
    fraud: "조문 안내라는 명분의 가상 링크를 제안할 수 있다. 개인정보를 입력하지 않은 수신자를 장황하게 설득하지 않는다.",
  },
  "5": {
    source: ["https://www.kisa.or.kr/1020601"],
    scene: "교통 범칙금·과태료 안내를 위장한 연락. 차량·위반 일시·금액을 미리 아는 척하지 않는다.",
    dynamics: "민원 안내처럼 담백하게 답한다. 사용자가 위반 장소나 고지 번호를 물으면 없던 기록을 발명하지 않고 조회의 한계를 인정한다.",
    legitimate: "실제 민원 안내의 범위만 말하며 직접 확인하려는 사용자를 존중한다.",
    fraud: "가상 고지서 링크에 관심을 유도할 수 있지만 형사처벌 위협이나 실제 납부 수단을 만들지 않는다.",
  },
  "6": {
    source: ["https://m.woorisavingsbank.com/help-customer/view.do?blcSn=1488&lgrpCd=HELP-CUSTOMER&mgrpCd=&page=1&rowNumber=11"],
    scene: "저금리 대출 안내와 상품 상담을 빙자한 접근. 금융감독원이 경고한 기존 대출 상환·보증료 선입금 방식의 일반적 특징만 참고한다.",
    dynamics: "조건 문의에는 성급한 승인 확답 대신 확인되지 않은 정보를 분명히 하고, 비용 이야기로 넘어가더라도 기존 대화에 맞춘 이유를 설명한다.",
    legitimate: "상담 안내는 가능하지만 개인 계좌 선입금 요구를 정상 절차인 양 제시하지 않는다.",
    fraud: "상환이나 보증료 선납이라는 명목의 가상 금전 요청을 할 수 있으나 실제 계좌번호나 계약 서류를 생성하지 않는다.",
  },
  "7": {
    source: ["https://www.kisa.or.kr/1020601"],
    scene: "재택·단기 업무 모집 안내를 사칭해 가입 및 인증정보를 요구할 수 있는 유형. 정상적인 채용 문자도 있을 수 있다.",
    dynamics: "업무 내용, 급여, 지원 경로를 묻는 질문에 따라 대응하고 실제 없는 고용주·공고 번호를 만들어내지 않는다.",
    legitimate: "채용 여부가 미확정인 상황을 유지하며 인증번호·선결제를 요구하지 않는다.",
    fraud: "가상 지원 페이지를 먼저 확인하거나 정보를 적어 달라고 제안할 수 있다. 한 번 거절하면 과장된 고수익 광고로 재촉하지 않는다.",
  },
  "8": {
    source: ["https://www.kisa.or.kr/1020601", "https://www.krcert.or.kr/kr/subPage.do?menuNo=205116"],
    scene: "건강검진 일정 또는 결과 안내를 위장한 문자. 공공·의료 분야를 사칭한 악성 링크 유형에 착안했으나 실제 건강정보는 모른다.",
    dynamics: "예약이나 검진 여부를 질문받으면 확인할 수 없는 결과를 단정하지 않고, 질병에 관한 불안을 악용하지 않는다.",
    legitimate: "실제 안내의 목적만 설명하고 민감한 진료정보 입력을 재촉하지 않는다.",
    fraud: "가상 건강검진 조회 링크를 통해 정보를 입력하도록 제안할 수 있으나 질병·결과를 지어내지 않는다.",
  },
  "9": {
    source: ["https://www.counterscam112.go.kr/pdf/bbs002/2/FILE_000000000000079/viewer.do"],
    scene: "신청한 기억이 없는 카드의 배송 연락. 금융위원회와 경찰청의 기관사칭형 피해사례 재구성에서 첫 접촉과 가짜 고객센터로의 연결을 참고했다.",
    dynamics: "배송을 거절할 때 반송이 필요하다고 말하며 문자 속 연락처를 제시한다. 후속 원격 지원 요구는 사용자가 그 연락처로 전화할 때만 서버가 표시한다.",
    legitimate: "정상 배송 일정 문의이며 별도 반송 번호나 원격 지원 설치를 요구하지 않는다.",
    fraud: "반송 문의를 구실로 문자에 첨부된 가상 번호에 전화해 달라고 한다. 실제 번호, 기관명이나 앱 설치 방법을 만들지 않는다.",
  },
  "10": {
    source: ["https://www.police.go.kr/user/bbs/BD_selectBbs.do?q_bbsCode=1007&q_bbscttSn=20240612111524537"],
    scene: "상품 후기 부업 안내. 경찰청의 리뷰 아르바이트와 팀 구매 미션 경보에서 소액 정산을 이용한 신뢰 형성과 선입금 요구를 참고했다.",
    dynamics: "다른 참여자는 소액을 받았다고 주장할 수 있다. 학습자가 이미 정산금을 받았다거나 팀에 가입했다는 사실은 만들지 않는다.",
    legitimate: "정상 업무 소개로 사용자에게 상품대금이나 보증료를 먼저 부담시키지 않는다.",
    fraud: "팀 전체의 정산을 빌미로 상품대금 선입금을 요구한다. 가상 결제 행동은 서버가 제공하며 실재 계좌는 만들지 않는다.",
  },
};

export function caseGuide(scenario: Scenario): string {
  const kind = scenario.id.split("-")[0];
  const guide = CASE_GUIDES[kind];
  if (!guide) return "새로운 시나리오. 직전 발화의 사실과 맥락을 유지하며 같은 설명을 반복하지 않는다.";
  return [
    "상황: " + guide.scene,
    "대화 특징: " + guide.dynamics,
    "이 인물에 해당하는 설정: " + guide[scenario.identity === "fraud" ? "fraud" : "legitimate"],
  ].join("\n");
}

/**
 * 사례별 역할 디렉션. 학습자가 입력한 메시지에 즉흥적으로 반응하되
 * 말투·확정된 사실·비공개 목적을 세션 전체에서 유지하도록 한다.
 * 고정 대본이나 순차 대사 번호를 LLM에 넘기는 방식이 아니다.
 */
export function actorBrief(scenario: Scenario, memory: DialogueMemory, completedTurns: number, caseFacts?: string): string {
  const beat = memory.stage === "closing"
    ? "상대가 실제로 대화를 끝냈다면 새로운 사건을 만들지 말고 짧게 마무리한다."
    : memory.stage === "request"
      ? "이미 제안한 부탁이 남아 있다면 사용자 반응부터 받아들이고 동일한 요구를 되풀이하지 않는다."
      : memory.stage === "context"
        ? "이미 설명한 배경을 유지하면서 사용자가 궁금해하는 부분에 답한다. 자연스럽지 않은 새 요구를 갑자기 덧붙이지 않는다."
        : "대화를 막 시작한 단계다. 먼저 직전 반응에 대답하고 관계와 사건 맥락을 세운다.";
  return [
    "### 역할 및 사건 사실(세션 내 변경 금지)",
    "역할: " + scenario.persona,
    "사건의 출발점: " + scenario.situation,
    ...(caseFacts ? ["이번 세션에서 고정한 세부 정황(발신자의 주장이지 확인된 사실은 아님): " + caseFacts] : []),
    "숨겨진 정체(화자의 속마음으로만 사용, 공개 금지): " + scenario.identity,
    "확정된 사실: " + scenario.privateFacts,
    "화자의 목적과 허용된 대응: " + scenario.objective,
    ...(scenario.identity === "legitimate" ? ["정상 인물 추가 제약: 본인이 먼저 원래 번호·공식 앱·대표번호·입금 방법을 알려주거나 특정 확인 수단을 추천하면 안 된다. 사용자가 확인하겠다면 수긍만 한다. 문제 해결 방법은 학습자가 스스로 떠올려야 한다."] : []),
    "### 말투와 사건 진행",
    "말투: " + scenario.voice,
    "가능한 사건 흐름: " + scenario.progression,
    "상대 반응별 원칙: " + scenario.responseRules,
    "관찰된 사례의 일반적 특징(원문 녹취나 따라 읽을 대본 아님): " + caseGuide(scenario),
    "### 이번 답변",
    "지금까지 사용자가 보낸 답장 횟수: " + completedTurns,
    "현재 대화 국면: " + memory.stage,
    "국면별 주의: " + beat,
    "상대에게 실제로 받은 마지막 질문·반응에 먼저 답하고, 그다음에야 자연스러운 다음 말을 선택한다.",
    "사실이 정해지지 않은 정보는 정확한 값이나 신분을 꾸며내지 않는다. 확인 행동을 하지 않았는데 확인됐다고 말하지 않는다.",
    "사용자가 같은 의심을 반복하면 새 핑계나 상투적 사기 문구를 추가하지 말고 이미 알려준 범위에서 대응한다.",
    "정상 연락과 사칭 연락 모두 어색한 연기나 악역 같은 말투 없이 현실의 문자 메시지처럼 행동한다.",
  ].join("\n");
}

/** 첫 문자는 정체를 숨긴 채, 정상/사칭 쌍에 동일한 중립 조건으로 매 세션 생성한다. */
export const OPENING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { opening: { type: "string" } },
  required: ["opening"],
};

export function parseOpeningOutput(text: string): { opening: string } {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof (value as { opening?: unknown }).opening !== "string") {
    throw new Error("INVALID_OPENING_SCHEMA");
  }
  return { opening: (value as { opening: string }).opening };
}

const OPENING_STYLES = [
  "짧은 질문을 던져 상대가 답장하기 쉽게 시작한다.",
  "상황을 한 조각만 설명하고 대답을 기다린다.",
  "연락 목적만 일상적인 한 문장으로 전달한다.",
  "가까운 관계면 친근하게, 업무 연락이면 담백하게 시작한다.",
  "처음부터 너무 많은 설명을 하지 않고 핵심 용건으로 시작한다.",
  "상대가 연락을 받은 상황을 고려해 짧게 말을 건다.",
  "경직된 안내문 대신 자연스러운 메시지 흐름을 택한다.",
  "간단한 인사와 현재 상황을 균형 있게 담는다.",
];

export function openingBrief(scenario: Scenario, styleIndex: number, caseFacts?: string): string {
  // identity, privateFacts, objective, progression을 일부러 전달하지 않는다.
  // 둘 중 누가 실제 발신자인지 첫 메시지 문체만으로 구별할 수 없게 한다.
  const style = OPENING_STYLES[Math.abs(styleIndex) % OPENING_STYLES.length];
  return [
    "당신은 한국의 실제 문자 대화에서 상대방에게 첫 문자를 보내는 사람이다.",
    "이 대화가 훈련이라는 말, 역할극 안내, 사기 여부, 정답은 절대 드러내지 않는다.",
    "상황명: " + scenario.title,
    "화자: " + scenario.persona,
    "현재 상황: " + scenario.situation,
    ...(caseFacts ? ["이 세션에서 고정한 사건의 맥락(확인 완료를 주장하지 말 것): " + caseFacts] : []),
    "말투: " + scenario.voice,
    "첫 메시지 표현 방향: " + style,
    "이미 수신자가 무엇을 답했는지는 모른다. 첫 연락으로 자연스러운 한국어 한두 문장을 작성한다.",
    "첫 문자부터 돈·링크·입금처·계좌번호·앱·고객센터·통화 방법 같은 행동 경로를 제시하지 않는다.",
    "세션에서 설정한 상품 종류·금액이 있더라도 첫 메시지에서 전부 공개하지 말고, 수신자가 무엇인지 물어본 뒤에만 해당 내용을 자연스럽게 설명한다.",
    "사전에 정한 문장을 반복하거나 예시 문장을 인용하지 말고 매번 새롭게 작성한다.",
    "이름, 업체명, 구체적인 번호, 일시, 금액, 구매 내역처럼 확정되지 않은 정보를 꾸며내지 않는다.",
    "130자 이내로 작성하고 opening 키 하나만 있는 JSON을 반환한다.",
  ].join("\n");
}

export function acceptableOpening(opening: string): boolean {
  const text = opening.trim();
  return text.length >= 10 && text.length <= 130 &&
    !/(?:https?:\/\/|www\.|(?:\d[\s.-]?){8,})/i.test(text) &&
    !/(?:송금|이체|입금|계좌\s*번호|링크|앱에서|고객센터|대표번호|카드\s*뒷면|인증번호|비밀번호|개인정보)/.test(text) &&
    !/(?:전화(?:해|하세요|주세요|하면|걸어)|연락(?:해|주세요|하세요)|돈\s*보내)/.test(text);
}

/** 답장 안의 선제적인 안전 정답·결제/연락 경로를 정상 화자가 직접 제시했는지 검사한다. */
export function unsolicitedSolution(reply: string): boolean {
  const text = reply.replace(/\s+/g, "");
  return /(?:원래|기존|저장된)(?:전화)?(?:번호|연락처)|(?:공식|은행|택배사)(?:앱|고객센터|대표번호|홈페이지|사이트)|카드뒷면|대표번호|(?:이|저)번호로(?:전화|연락)|(?:여기|이쪽|이계좌)로?(?:입금|송금|이체|돈)|(?:입금|송금|이체)(?:해|하|해줘|해주세요)|(?:전화|통화|연락)(?:해봐|걸어|해주세요|해줘|하세요)/.test(text);
}

export const INITIAL_DIALOGUE: DialogueMemory = {
  stage: "contact", hasPendingRequest: false, lastSpeakerMove: "explain",
  lastReply: "", lastSummary: "", repeatCount: 0,
};

function fingerprint(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const out = new Set<string>();
  for (let i = 0; i < normalized.length - 2; i++) out.add(normalized.slice(i, i + 3));
  return out;
}
export function replySimilarity(a: string, b: string): number {
  const left = fingerprint(a), right = fingerprint(b);
  if (!left.size || !right.size) return a.trim() && a.trim() === b.trim() ? 1 : 0;
  const common = [...left].filter(x => right.has(x)).length;
  return common / Math.max(left.size, right.size);
}

export function decideDialogueTurn(args: {
  memory?: DialogueMemory;
  primary: DialogueSignal;
  audit?: DialogueSignal;
  reply: string;
  userText?: string;
  actions: Action[];
  nextTurn: number;
  maxTurns: number;
}): { memory: DialogueMemory; closed: boolean; reason?: EndReason; issues: string[] } {
  const { primary, audit, reply, actions, nextTurn, maxTurns } = args;
  const previous = args.memory ?? INITIAL_DIALOGUE;
  const issues: string[] = [];
  const nearRepeat = replySimilarity(previous.lastReply, reply) >= 0.78 && !!reply.trim();
  const repeats = nearRepeat ? previous.repeatCount + 1 : 0;
  if (nearRepeat) issues.push("near_duplicate_reply");
  // 감사 모델이 실제로 반대하면 그 판단을 존중한다.
  // 다만 감사 호출 실패만으로 대화가 무한히 이어지지 않게,
  // 4턴 이후 또는 이전부터 closing인 경우에는 보수적인 단독 종료를 허용한다.
  const agree = audit
    ? audit.conversationComplete && !audit.hasPendingRequest &&
      (audit.speakerMove === "close" || audit.speakerMove === "none")
    : (nextTurn >= 4 || (nextTurn >= 3 && previous.stage === "closing"));
  const replyEnded = primary.speakerMove === "close" || primary.speakerMove === "none";
  const learnerDone = ["acknowledge", "decline", "verify_intent", "verified_claimed", "claimed_action", "suspect", "exit"].includes(primary.learnerMove) &&
    (!audit || ["acknowledge", "decline", "verify_intent", "verified_claimed", "claimed_action", "suspect", "exit"].includes(audit.learnerMove));
  // 모의 행동 버튼이 화면에 보인다면 사용자가 눌러 볼 기회를 뺏지 않는다.
  const activeRequest = actions.length > 0;
  // 질문부호가 남은 발화를 두 모델이 실수로 맞장구로 분류하더라도 조기 종료하지 않는다.
  const explicitQuestion = /[?？]/.test(args.userText ?? "");
  if (explicitQuestion && primary.conversationComplete) issues.push("pending_user_question");
  const natural = nextTurn >= 2 && primary.conversationComplete && agree &&
    !primary.hasPendingRequest && replyEnded && learnerDone && !activeRequest && !explicitQuestion;
  const loop = nextTurn >= 4 && repeats >= 2 &&
    !primary.hasPendingRequest && !audit?.hasPendingRequest &&
    learnerDone && !activeRequest && !explicitQuestion;
  // 같은 말을 세 번째 반복하고 사용자가 새 질문을 하지 않았다면
  // 아직 남은 요청이 있다는 AI 판단만으로 대화를 끝없이 재촉하게 두지 않는다.
  // 요청 버튼이 있더라도 같은 발화의 반복이면 이전 말풍선에서 충분히 보였다.
  const stalledRequest = nextTurn >= 4 && repeats >= 2 && !explicitQuestion &&
    ["acknowledge", "decline", "suspect", "exit", "verified_claimed"].includes(primary.learnerMove) &&
    (!audit || audit.learnerMove !== "question") &&
    (primary.hasPendingRequest || audit?.hasPendingRequest || activeRequest);
  const turnLimit = nextTurn >= maxTurns;
  const closed = natural || loop || stalledRequest || turnLimit;
  const reason: EndReason | undefined = natural || loop || stalledRequest ? "natural" : turnLimit ? "turn_limit" : undefined;
  if (loop) issues.push("repetition_stopped");
  if (stalledRequest) issues.push("stalled_request_stopped");
  const nextMemory: DialogueMemory = {
    stage: closed ? "closing" : primary.stage,
    hasPendingRequest: closed ? false : primary.hasPendingRequest,
    lastSpeakerMove: primary.speakerMove,
    lastReply: reply.slice(0, 300),
    lastSummary: primary.summary.replace(/https?:\/\/\S+|(?:\d[\s.-]?){8,}/gi, "[비공개]").slice(0, 140),
    repeatCount: repeats,
  };
  return { memory: nextMemory, closed, ...(reason ? { reason } : {}), issues };
}
