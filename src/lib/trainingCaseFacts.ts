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


export function episodeTactic(episode: TrainingEpisode): string {
  if (episode.callback) return `callback:${episode.callback.kind}:${episode.callback.install ? "install" : "direct"}`;
  if (episode.linkInteraction === "install") return "install";
  return episode.kind;
}

/** Rank unseen cases by a different next action and a different pace. */
export function variedCaseCandidates(scenario: Pick<Scenario, "id">, candidates: number[], last?: TrainingEpisode): number[] {
  if (!last || candidates.length < 2) return candidates;
  const scored = candidates.map(index => {
    const episode = caseBranch(scenario, index);
    const tactic = episodeTactic(episode);
    const score = (tactic === episodeTactic(last) ? 4 : 0) +
      (episode.kind === last.kind ? 2 : 0) +
      (episode.requestAfterTurns === last.requestAfterTurns ? 1 : 0);
    return { index, score };
  });
  const best = Math.min(...scored.map(item => item.score));
  return scored.filter(item => item.score === best).map(item => item.index);
}

export function episodeActorDirection(episode: TrainingEpisode): string {
  if (episode.callback) return "현재 화자는 다음 담당자를 연결하려는 역할이다. 문자에서 통화 이후에 등장할 내용이나 추가 요구를 먼저 꺼내지 않는다.";
  if (episode.linkInteraction === "install") return "문자에서는 안내 화면으로 이동할 명분을 만든다. 설치를 문자에서도 요구할지는 이 사건의 지정 대사를 따르고, 설치 자체는 모의 화면에서만 가능하다.";
  return {
    transfer: "상대가 주저하면 왜 지금 비용이 필요하다는 건지 사건의 기존 구실로 설명한다. 새 비용이나 계좌를 만들지 않는다.",
    provide_data: "상대가 정보 요구에 의문을 가지면 그 정보가 무슨 절차에 필요하다고 주장하는지 짧게 답한다. 다른 정보나 비용을 추가하지 않는다.",
    link: "링크를 왜 봐야 하는지 묻는다면 그 화면에서 확인할 수 있다고 주장한 내용으로 답한다. 새 링크나 절차를 추가하지 않는다.",
    phone: "현재 발신자가 처리할 수 없다고 주장하는 범위와 상대에게 안내할 창구를 구분한다. 연결된 다음 역할을 문자에서 대신 연기하지 않는다.",
  }[episode.kind];
}
