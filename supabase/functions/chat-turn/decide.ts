import type { AiOutput, Stage } from "../_shared/types.ts";

export const MAX_TURNS = 8;

// 단계 전환·종료 판정은 여기 한 곳에만 둔다 (FE는 응답의 ended만 본다).
export function decideNext(turnCount: number, ai: AiOutput): { turn_count: number; stage: Stage; ended: boolean } {
  const turn_count = turnCount + 1;
  return { turn_count, stage: ai.next_stage, ended: ai.ended || turn_count >= MAX_TURNS };
}
