/**
 * 실제 공개된 피싱 수법에서 출발하는 사건별 설정.
 * 개별 메시지는 허구이며 발신자의 주장만 담는다. 정체 판별에 사용하지 않는다.
 */
import type { Scenario } from "./realTraining.ts";
import { TRAINING_EPISODES, type TrainingEpisode } from "./trainingEpisodes.ts";

export const CASE_VARIANTS = TRAINING_EPISODES.map(group => group.map(episode => episode.facts));
export const BANK_CLAIMS = TRAINING_EPISODES[2].map(episode => episode.bankClaim ?? "");

export type CaseBranch = TrainingEpisode;

export function caseVariantCount(scenario: Pick<Scenario, "id">): number {
  return TRAINING_EPISODES[Number(scenario.id.split("-")[0])]?.length ?? 0;
}

function checked(scenario: Pick<Scenario,"id">, variant: number): TrainingEpisode {
  const category = Number(scenario.id.split("-")[0]);
  const group = TRAINING_EPISODES[category];
  if (!Number.isInteger(category) || !group || !Number.isInteger(variant) ||
    variant < 0 || variant >= group.length) throw new Error("INVALID_CASE_VARIANT");
  return group[variant];
}

export function caseDetail(scenario: Pick<Scenario,"id">, variant: number): string {
  return checked(scenario, variant).facts;
}

export function caseBranch(scenario: Pick<Scenario,"id">, variant: number): CaseBranch {
  return checked(scenario, variant);
}
