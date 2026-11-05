import type { Scenario, TrainingState } from "./realTraining.ts";
import type { DialogueOutput } from "./trainingDialogue.ts";
import type { Proposed } from "./trainingActions.ts";
import { BANK_CLAIMS, caseBranch } from "./trainingCaseFacts.ts";
import { bankQuestionNeedsSpecifics, riskDecisionDue } from "./trainingDecision.ts";
import { hasConcreteRequest } from "./trainingResolution.ts";

type PracticeBeat = ReturnType<typeof caseBranch>;

function proposal(beat: PracticeBeat): Proposed {
  return { kind: beat.kind, origin: "sender", target: beat.target, task: beat.task,
    previewTitle: beat.title ?? "", previewDescription: beat.field ?? "" };
}

export function fallbackTrainingTurn(state: TrainingState, scenario: Scenario, text: string): DialogueOutput {
  const beat = caseBranch(scenario, state.caseVariant ?? 0);
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
