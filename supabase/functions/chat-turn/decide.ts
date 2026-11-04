import type { AiOutput, EndedBy, EndReason, Stage } from "../_shared/types.ts";

export const MAX_TURNS = 8;

// 단계 전환·종료 판정은 여기 한 곳에만 둔다 (FE는 응답의 ended만 본다).
// AI 쪽 종료(ai.ended)가 없는데 턴 한도에 닿으면 판단 보류로 끝낸다.
export function decideNext(
  turnCount: number,
  ai: AiOutput,
): { turn_count: number; stage: Stage; ended: boolean; end_reason?: EndReason; ended_by?: EndedBy } {
  const turn_count = turnCount + 1;
  if (ai.ended) return { turn_count, stage: ai.next_stage, ended: true, end_reason: ai.end_reason, ended_by: ai.ended_by };
  if (turn_count >= MAX_TURNS) return { turn_count, stage: ai.next_stage, ended: true, end_reason: "inconclusive", ended_by: "system" };
  return { turn_count, stage: ai.next_stage, ended: false };
}
