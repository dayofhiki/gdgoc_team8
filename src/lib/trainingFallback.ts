import type { Scenario, TrainingState } from "./realTraining.ts";
import type { DialogueOutput } from "./trainingDialogue.ts";
import type { Proposed } from "./trainingActions.ts";
import { BANK_CLAIMS, caseBranch } from "./trainingCaseFacts.ts";
import { FALLBACK_SCENE_LINES, PERSUASION_LINES } from "./trainingFallbackScenes.ts";
import { bankQuestionNeedsSpecifics, raisesObjection, riskDecisionDue } from "./trainingDecision.ts";
import { hasConcreteRequest } from "./trainingResolution.ts";
import type { TrainingTopicId } from "./trainingCatalog.ts";

type PracticeBeat = ReturnType<typeof caseBranch>;

const objectionReply: Record<TrainingTopicId, string> = {
  family: "갑자기 이쪽에서 연락해서 놀랐지. 지금 길게 통화할 상황이 아니라 문자부터 했어.",
  delivery: "갑자기 연락받으셔서 그러실 수 있어요. 저는 지금 전달받은 배송 건만 보고 있습니다.",
  bank: "이 연락만으로 판단하기 어려우실 수 있습니다. 지금 안내된 건의 상태만 먼저 말씀드릴게요.",
  invitation: "갑자기 연락해서 놀라셨죠. 소식이 먼저 전해졌는지 몰라서 한 분씩 따로 연락하고 있어요.",
  obituary: "갑작스러운 연락이라 조심스러우실 수 있어요. 저는 전달받은 조문 안내만 전하고 있습니다.",
  traffic: "문자로 받으시면 어떤 건인지 바로 알기 어려울 수 있습니다. 이 화면에는 고지 상태만 표시됩니다.",
  loan: "갑자기 연락드렸으니 조건부터 궁금하실 수 있어요. 아직 신청이나 승인이 확정된 단계는 아닙니다.",
  job: "지원하신 기억이 없으시면 생소하실 수 있어요. 지금은 채용 확정이 아니라 업무 안내 연락입니다.",
  health: "기억하시는 일정과 다를 수 있어요. 제가 말씀드리는 건 진료 내용이 아니라 안내 건입니다.",
  card: "신청하지 않으셨군요. 제가 가진 건 배송 지시뿐이라 발급이 어떻게 접수됐는지는 여기서 알 수 없습니다.",
  team_mission: "처음 듣는 절차라 헷갈리실 수 있어요. 방에 올라온 작업과 정산 안내가 따로 나와 있습니다.",
};

function proposal(beat: PracticeBeat): Proposed {
  return { kind: beat.kind, origin: "sender", target: beat.target, task: beat.task,
    previewTitle: beat.title ?? "", previewDescription: beat.field ?? "" };
}

export function fallbackTrainingTurn(state: TrainingState, scenario: Scenario, text: string): DialogueOutput {
  const variant = state.caseVariant ?? 0;
  const beat = caseBranch(scenario, variant);
  const hasRequest = hasConcreteRequest(state.messages);
  const specific = scenario.topic === "bank" && bankQuestionNeedsSpecifics(text);
  const bankClaim = BANK_CLAIMS[variant];
  const objection = objectionReply[scenario.topic];
  const persuasion = PERSUASION_LINES[beat.id];
  const authored = FALLBACK_SCENE_LINES[Number(scenario.id.split("-")[0])][variant] ?? [beat.context, beat.followUp ?? beat.context];
  const candidates = raisesObjection(text) ? [persuasion, objection, ...authored] :
    [authored[0], persuasion, authored[1], objection];
  const spoken = state.messages.filter(message => message.actor === "them").map(message => message.text);
  const unused = (line: string) => !spoken.some(previous => previous.includes(line));
  const ask = riskDecisionDue(state, scenario, text);
  const context = specific ? bankClaim : candidates.find(unused) ?? objection;
  let reply = context;
  if (ask) {
    reply = specific || unused(persuasion) ? `${specific ? bankClaim : persuasion} ${beat.request}` : beat.request;
  } else if (hasRequest && !specific) {
    reply = [persuasion, authored[1], objection].find(unused) ??
      (scenario.topic === "family" ? "응, 알겠어. 지금 바로 답하기 어렵다면 기다릴게." : "알겠습니다. 지금 결정하기 어려우시면 기다리겠습니다.");
  }
  return {
    reply,
    actions: ask ? [proposal(beat)] : [],
    dialogue: { stage: ask || hasRequest ? "request" : "context", learnerMove: "engage",
      speakerMove: "answer", hasPendingRequest: ask || hasRequest, conversationComplete: false, summary: "" },
  };
}
