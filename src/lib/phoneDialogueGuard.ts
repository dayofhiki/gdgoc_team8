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

