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
export type LearnerMove = "question" | "acknowledge" | "decline" | "verify_intent" | "engage" | "exit";
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
export type EndReason = "natural" | "turn_limit" | "action";

const STAGES: Stage[] = ["contact", "context", "request", "closing"];
const LEARNER: LearnerMove[] = ["question", "acknowledge", "decline", "verify_intent", "engage", "exit"];
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
  "사용자가 묻는 구체적인 질문에 먼저 답한다. 맥락에 없는 새 사건이나 피해금액은 지어내지 않는다.",
  "모든 턴마다 금전·링크 요청을 반복할 필요는 없다. 대화의 흐름과 현재 관계에 맞는 한 가지 반응을 한다.",
  "사용자의 짧은 맞장구를 질문으로 오인하지 않는다. 응답할 필요가 사라졌으면 대화를 마무리한다.",
  "대화가 끝난 다음에 새 문자로 또 인사하거나 같은 약속을 반복하지 않는다.",
  "실제로 상대가 더 이상 할 말이 없고, 사용자가 마지막 인사에 응한 경우 reply를 빈 문자열로 둘 수 있다. 이때 speakerMove=none, conversationComplete=true.",
  "아직 해결되지 않은 명시적인 확인 요청이나 사용자의 질문이 있으면 conversationComplete=false.",
  "위협·재촉·공식 기관 사칭 같은 징후는 관련 시나리오의 맥락에서만 사용한다. 모든 시나리오에 똑같은 진행 단계를 강요하지 않는다.",
  "피싱 교육 상황의 가상 대화로만 응답하며 실제 결제·인증·설치·송금·전화번호·외부 URL은 만들지 않는다.",
  "독립 확인을 하겠다는 말은 실제로 확인했다는 뜻이 아니다. 확인 완료 사실은 서버의 행동 이벤트가 있을 때만 성립한다.",
  "정체와 답을 대화에 직접 공개하지 않는다. 정상 연락과 사칭 연락 모두 평범한 한국어 대화가 가능해야 한다.",
  "dialogue.stage는 contact(첫 접촉), context(사정 설명), request(진행 중인 요청), closing(요청이 해결되거나 대화를 끝내는 중) 중 하나다.",
  "dialogue.learnerMove는 마지막 사용자 발화의 실제 의도다. question / acknowledge / decline / verify_intent / engage / exit.",
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
    source: ["https://www.counterscam112.go.kr/bbs009/board/boardList.do"],
    scene: "새 번호에서 시작된 가족 연락. 직접 확인하기 전까지는 정상/사칭 정체를 단정하지 않는다.",
    dynamics: "짧은 일상적 발화, 서로가 이미 아는 사실과 아직 확인되지 않은 사실을 구분하고, 대화가 정리되면 인사만 반복하지 않는다.",
    legitimate: "실제 자녀의 급한 사정이 있어도 가족이 확인하겠다는 요청을 존중한다. 새로운 핑계나 송금 요구를 끝없이 추가하지 않는다.",
    fraud: "관계의 친밀함을 주장하는 메시지와 금전 관련 용건이 등장할 수 있다. 사용자가 독립 확인을 하려는 경우 반응은 인물의 설정 범위 내에서만 묘사한다.",
  },
  "1": {
    source: ["https://www.counterscam112.go.kr/bbs009/board/boardList.do"],
    scene: "배송 주소나 운송장 안내가 왔다. 사용자는 실제 배송 여부를 모른다.",
    dynamics: "일반적인 배송 안내와 불확실한 외부 링크 요청을 구별하게 한다. 주소 문제가 해결됐다고 주장하기 전에 실제 처리 이벤트가 있었는지 살핀다.",
    legitimate: "실제 배송사의 고객 응대이며 사용자가 기존 공식 경로로 확인해도 무방하다. 임의의 사기 징후를 만들지 않는다.",
    fraud: "외부 사이트나 정보 제출 유도는 가상의 행동 대상으로만 표현한다. 실제 사이트·계좌·개인정보를 만들어내지 않는다.",
  },
  "2": {
    source: [
      "https://www.counterscam112.go.kr/bbs009/board/boardList.do",
      "https://www.counterscam112.go.kr/bbs003/board/boardList.do",
    ],
    scene: "기존 금융 거래에 관한 이상 거래 안내. 접촉만으로 신원은 확인되지 않았다.",
    dynamics: "사용자가 거래 내용을 물으면 제한된 사실 안에서 자연스럽게 대응한다. 이미 제시한 내용을 다시 설명하는 것과 새 행동을 요구하는 것을 구분한다.",
    legitimate: "실제 거래 안내로, 독립적 확인을 존중하고 새 송금이나 개인정보 제공을 강요하지 않는다.",
    fraud: "기관·안전 조치를 내세우는 연락일 수 있다. 진행되는 과정 자체를 교육용으로 묘사하되 실제 계좌·앱·주소를 생성하지 않는다.",
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
  const agree = !!audit && audit.conversationComplete && !audit.hasPendingRequest &&
    (audit.speakerMove === "close" || audit.speakerMove === "none");
  const replyEnded = primary.speakerMove === "close" || primary.speakerMove === "none";
  const learnerDone = ["acknowledge", "decline", "verify_intent", "exit"].includes(primary.learnerMove) &&
    (!audit || ["acknowledge", "decline", "verify_intent", "exit"].includes(audit.learnerMove));
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
  const turnLimit = nextTurn >= maxTurns;
  const closed = natural || loop || turnLimit;
  const reason: EndReason | undefined = natural || loop ? "natural" : turnLimit ? "turn_limit" : undefined;
  if (loop) issues.push("repetition_stopped");
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
