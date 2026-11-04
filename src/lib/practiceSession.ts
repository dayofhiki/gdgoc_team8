/**
 * 혼자 연습하기(practice-chat) 화면 상태. React와 분리한 순수 함수라 Node 테스트로 검증합니다.
 * - runId: 새 훈련마다 바뀜. 이전 훈련의 늦은 응답은 runId가 달라 반영되지 않습니다.
 * - 학습자 발화의 intent(AI 추정)와 화면에서 기록된 행동(events)을 따로 보관합니다.
 */
import type {
  ActionEvent, EndedBy, EndReason, HistoryItem, PracticeReportResponse, PracticeTurnResponse, Stage, TurnAnalysis,
} from "../../supabase/functions/_shared/types.ts";
import { fallbackFeedback, observations } from "../../supabase/functions/_shared/judge.ts";

export type ChatMsg = HistoryItem & { offerLink?: boolean };

export type PracticeState = {
  runId: number;
  messages: ChatMsg[];
  stage: Stage;
  turnCount: number;
  maxTurns: number;
  linkOffered: boolean;
  events: ActionEvent[];
  analyses: TurnAnalysis[];
  ended: boolean;
  endReason?: EndReason;
  endedBy?: EndedBy;
  usedFallback: boolean;
};

export const freshPractice = (runId: number): PracticeState => ({
  runId, messages: [], stage: "approach", turnCount: 0, maxTurns: 8, linkOffered: false,
  events: [], analyses: [], ended: false, usedFallback: false,
});

/** 서버에 보낼 기록 (화면 전용 필드 제외) */
export const toHistory = (messages: ChatMsg[]): HistoryItem[] =>
  messages.map(({ role, text, stage, intent }) => ({ role, text, stage, ...(intent ? { intent } : {}) }));

export function applyOpening(s: PracticeState, runId: number, r: PracticeTurnResponse): PracticeState {
  if (runId !== s.runId) return s;
  return { ...s, messages: [{ role: "scammer", text: r.reply, stage: r.stage }], stage: r.stage, maxTurns: r.max_turns ?? s.maxTurns };
}

/** 보내기 직후: 학습자 말을 먼저 보여줌 */
export function addPending(s: PracticeState, text: string): PracticeState {
  if (s.ended) return s;
  return { ...s, messages: [...s.messages, { role: "senior", text, stage: s.stage }] };
}

/** 전송 실패: 방금 추가한 학습자 말을 되돌림 */
export function rollback(s: PracticeState, runId: number): PracticeState {
  if (runId !== s.runId || s.messages.at(-1)?.role !== "senior") return s;
  return { ...s, messages: s.messages.slice(0, -1) };
}

export function applyTurn(s: PracticeState, runId: number, r: PracticeTurnResponse): PracticeState {
  if (runId !== s.runId || s.ended) return s;
  const messages = [...s.messages];
  const last = messages.at(-1);
  if (last?.role === "senior" && r.analysis) messages[messages.length - 1] = { ...last, intent: r.analysis.intent };
  if (r.reply) messages.push({ role: "scammer", text: r.reply, stage: r.stage, ...(r.offer_link ? { offerLink: true } : {}) });
  return {
    ...s,
    messages,
    stage: r.stage,
    turnCount: r.turn_count ?? s.turnCount + 1,
    maxTurns: r.max_turns ?? s.maxTurns,
    linkOffered: s.linkOffered || Boolean(r.offer_link),
    analyses: r.analysis ? [...s.analyses, r.analysis] : s.analyses,
    ended: r.ended,
    endReason: r.ended ? r.end_reason ?? "inconclusive" : undefined,
    endedBy: r.ended ? r.ended_by ?? "system" : undefined,
    usedFallback: s.usedFallback || r.used_fallback || !r.ai_configured,
  };
}

/** 화면에서 끝낸 경우: 모의 링크 클릭, 중단 버튼, 서버 턴 제한 응답 */
export function endLocally(s: PracticeState, runId: number, reason: EndReason, endedBy: EndedBy, event?: ActionEvent): PracticeState {
  if (runId !== s.runId || s.ended) return s;
  return { ...s, ended: true, endReason: reason, endedBy, events: event ? [...s.events, event] : s.events };
}

// ───────────── 리포트 ─────────────

export type PracticeReport = {
  id: string;
  mission_title: string;
  end_reason: EndReason;
  ended_by: EndedBy;
  messages: HistoryItem[];
  analyses: TurnAnalysis[];
  events: ActionEvent[];
  link_offered: boolean;
  observations: string[];
  feedback: PracticeReportResponse["feedback"];
  feedback_source: "ai" | "fallback";
  used_fallback: boolean;
  created_at: string;
};

/** 서버 리포트 응답이 없으면(null) 같은 규칙으로 근거·기본 피드백을 만든다 */
export function buildReport(s: PracticeState, id: string, missionTitle: string, server: PracticeReportResponse | null): PracticeReport {
  const endReason = s.endReason ?? "inconclusive";
  const facts = { history: toHistory(s.messages), events: s.events, endReason, linkOffered: s.linkOffered };
  return {
    id,
    mission_title: missionTitle,
    end_reason: endReason,
    ended_by: s.endedBy ?? "system",
    messages: facts.history,
    analyses: s.analyses,
    events: s.events,
    link_offered: s.linkOffered,
    observations: server?.observations ?? observations(facts),
    feedback: server?.feedback ?? fallbackFeedback(facts),
    feedback_source: server?.feedback_source ?? "fallback",
    used_fallback: s.usedFallback,
    created_at: new Date().toISOString(),
  };
}

// 리포트 임시 보관: 같은 탭의 sessionStorage (새로고침해도 유지, 탭을 닫으면 사라짐).
// 저장이 막힌 환경에서는 메모리에만 두므로 새로고침하면 사라집니다. URL에는 id만 넣습니다.
const KEY = "mikki:practice-report";
let memory: PracticeReport | null = null;

const storage = (): Storage | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};

export function saveReport(r: PracticeReport): void {
  memory = r;
  try {
    storage()?.setItem(KEY, JSON.stringify(r));
  } catch {
    /* 저장 불가 환경은 메모리만 사용 */
  }
}

export function loadReport(id: string | null): PracticeReport | null {
  let r = memory;
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) r = JSON.parse(raw) as PracticeReport;
  } catch {
    /* 손상된 값은 무시 */
  }
  return r && (!id || r.id === id) ? r : null;
}

export function clearReport(): void {
  memory = null;
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}
