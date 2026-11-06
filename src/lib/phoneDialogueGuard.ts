/**
 * Prevents a defensive phone-training session from stalling or falsely
 * resolving before a learner has faced the scenario's decision point.
 *
 * The model still chooses the natural wording. These guards do not produce
 * messages containing live links, telephone numbers, financial destinations
 * or authentication codes.
 */
import { heardPhoneRequest, type PhoneCase } from "./phoneTraining";

export type PhoneTurnIssue = "none" | "waiting" | "premature_resolution" | "missing_decision";

/** Analyse a completed AI turn, not the learner's transcript. */
export function reviewPhoneTurn(
  scenario: PhoneCase,
  text: string,
  modelTurnCount: number,
  requestAlreadyHeard: boolean,
): PhoneTurnIssue {
  if (scenario.kind !== "fraud" || requestAlreadyHeard || heardPhoneRequest(scenario, text))
    return "none";

  const spoken = text.replace(/\s+/g, " ").trim();
  const waiting = /(?:잠시|잠깐|조금만|계속|일단)\s*(?:기다리|대기)|(?:확인|조회|처리)\s*(?:해\s*보겠습니다|중(?:이니|입니다|이에요|이라서))/.test(spoken);
  if (waiting) return "waiting";

  const resolved = /(?:안전한\s*것으로|문제\s*없는\s*것으로|명의(?:는|가)?\s*안전|혐의\s*없|이상\s*없|모든\s*절차\s*완료|확인\s*마쳤|문제\s*없습니다|협조해\s*주셔서\s*감사|이제\s*통화\s*종료)/.test(spoken);
  if (resolved) return "premature_resolution";

  return modelTurnCount >= 2 ? "missing_decision" : "none";
}

/** Model receives an internal educational cue, not a simulated user response. */
export function decisionProgressionCue(scenario: PhoneCase): string {
  return [
    "[교육용 시나리오 진행 메시지. 사용자의 발화가 아닙니다. 이 메시지를 읽거나 언급하지 마세요.]",
    "앞의 대화에서 훈련의 판단 지점이 제시되지 않았습니다.",
    "이번 통화의 이미 정해진 행동 판단 지점으로 바로 진행해 주세요.",
    "판단 지점: " + scenario.request,
    "추가로 기다리게 하지 말고, 안전 확인 완료·문제 해결·무혐의라는 결론을 내리지 마세요.",
    "이 판단 지점이 실제 대사에 나타나기 전에는 통화를 종료하지 마세요.",
  ].join("\n");
}
