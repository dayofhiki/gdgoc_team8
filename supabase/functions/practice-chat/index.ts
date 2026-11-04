/**
 * 배포 가능한 독립형 AI 채팅 연습.
 * 기존 초대 기반 chat-turn은 그대로 유지하며, 홈의 '혼자 연습하기'만 담당합니다.
 * 브라우저의 익명 Supabase 인증을 요구하고, Gemini 키는 Edge Function Secret에서만 읽습니다.
 * 이 간편 모드의 기록은 DB에 저장하지 않습니다. 대화 기록은 FE가 들고 다니며 매번 보냅니다.
 *
 * - action 생략(또는 "turn"): 대화 1턴. 학습자 발화 수는 history로 세고, MAX_TURNS에 닿으면 판단 보류로 종료.
 * - action "report": 종료 후 근거 문장 + 피드백 (AI 실패 시 기본 피드백).
 */
import { generateFeedback, generateReply, nextStage } from "../_shared/ai.ts";
import { handle, HttpError, must } from "../_shared/http.ts";
import { END_REASONS, fallbackFeedback, INTENTS, observations } from "../_shared/judge.ts";
import { hasPii, maskPii } from "../_shared/pii.ts";
import type {
  ActionEvent, AiInput, AiOutput, Difficulty, HistoryItem, Mission, PracticeReportRequest, PracticeReportResponse,
  PracticeTurnRequest, PracticeTurnResponse, Stage,
} from "../_shared/types.ts";
import { decideNext, MAX_TURNS } from "../chat-turn/decide.ts";

type Body = PracticeTurnRequest | PracticeReportRequest;
const stages: Stage[] = ["approach", "trust", "pressure", "demand"];
const difficulties: Difficulty[] = ["easy", "normal", "hard"];
const MAX_HISTORY = 24;
const AI_TIMEOUT_MS = 8000;
const bad = (message: string) => new HttpError(400, "BAD_REQUEST", message);

function validHistory(raw: unknown): HistoryItem[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY) throw bad("대화 기록 형식이 올바르지 않습니다");
  for (const m of raw as HistoryItem[]) {
    if (
      !m || !["senior", "scammer"].includes(m.role) || typeof m.text !== "string" || m.text.length > 500 ||
      !stages.includes(m.stage) || (m.intent !== undefined && !INTENTS.includes(m.intent)) || hasPii(m.text)
    ) throw bad("대화 기록이 올바르지 않습니다");
  }
  return (raw as HistoryItem[]).map(({ role, text, stage, intent }) => ({ role, text, stage, ...(intent ? { intent } : {}) }));
}

function validEvents(raw: unknown): ActionEvent[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 5) throw bad("행동 기록 형식이 올바르지 않습니다");
  for (const e of raw as ActionEvent[]) {
    if (!e || !["link_clicked", "transfer_sent"].includes(e.type) || typeof e.at !== "string" || e.at.length > 40) throw bad("행동 기록이 올바르지 않습니다");
  }
  return (raw as ActionEvent[]).map(({ type, at }) => ({ type, at }));
}

Deno.serve(handle<Body>(async ({ body, admin }) => {
  const id = body.mission_id ?? "family";
  if (typeof id !== "string" || id.length > 64) throw bad("미션이 올바르지 않습니다");
  const mission = must(await admin.from("missions").select("*").eq("id", id).maybeSingle()) as Mission | null;
  if (!mission) throw new HttpError(404, "NOT_FOUND", "미션을 찾을 수 없습니다");
  const history = validHistory(body.history);
  if (body.link_offered !== undefined && typeof body.link_offered !== "boolean") throw bad("link_offered 형식이 올바르지 않습니다");
  const linkOffered = Boolean(body.link_offered);

  if (body.action === "report") {
    if (!END_REASONS.includes(body.end_reason)) throw bad("종료 이유가 올바르지 않습니다");
    const events = validEvents(body.events);
    const facts = { history, events, endReason: body.end_reason, linkOffered };
    const obs = observations(facts);
    const fb = await Promise.race([
      generateFeedback({ mission, ...facts, observations: obs }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), AI_TIMEOUT_MS)),
    ]).catch((e) => {
      console.error("practice-chat feedback error", e);
      return { feedback: fallbackFeedback(facts), source: "fallback" as const };
    });
    const res: PracticeReportResponse = { feedback: fb.feedback, feedback_source: fb.source, observations: obs };
    return res;
  }

  const stage = body.stage ?? "approach";
  const difficulty = body.difficulty ?? "normal";
  if (!stages.includes(stage) || !difficulties.includes(difficulty)) throw bad("단계 또는 난이도가 올바르지 않습니다");
  if (body.text !== undefined && typeof body.text !== "string") throw bad("메시지 형식이 올바르지 않습니다");
  const userText = body.text?.trim() ?? "";
  if (userText.length > 500) throw bad("메시지는 500자 이하로 작성해주세요");
  if (hasPii(userText)) throw new HttpError(422, "PII_BLOCKED", "실제 개인정보는 입력하지 마세요");
  const aiConfigured = Boolean(Deno.env.get("GEMINI_API_KEY"));
  const turnCount = history.filter((m) => m.role === "senior").length;

  if (!userText) {
    const res: PracticeTurnResponse = {
      reply: mission.fallback_lines[stage], stage, ended: false, used_fallback: false, ai_configured: aiConfigured,
      turn_count: turnCount, max_turns: MAX_TURNS,
    };
    return res;
  }
  // 서버 측 턴 제한: FE가 막지 못해도 대화가 끝없이 이어지지 않게
  if (turnCount >= MAX_TURNS) throw new HttpError(409, "SESSION_ENDED", "이미 끝난 연습입니다");

  const input: AiInput = { mission, difficulty, stage, history, user_text: userText, link_offered: linkOffered };
  const ai: AiOutput = await Promise.race([
    generateReply(input),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), AI_TIMEOUT_MS)),
  ]).catch((e) => {
    console.error("practice-chat Gemini error", e);
    return { reply: mission.fallback_lines[nextStage(stage)], next_stage: nextStage(stage), ended: false, used_fallback: true };
  });
  const d = decideNext(turnCount, ai);
  const res: PracticeTurnResponse = {
    reply: maskPii(ai.reply),
    stage: d.stage,
    ended: d.ended,
    used_fallback: ai.used_fallback,
    ai_configured: aiConfigured,
    turn_count: d.turn_count,
    max_turns: MAX_TURNS,
    ...(d.end_reason ? { end_reason: d.end_reason, ended_by: d.ended_by } : {}),
    ...(ai.analysis ? { analysis: ai.analysis } : {}),
    ...(ai.offer_link && !d.ended ? { offer_link: true } : {}),
  };
  return res;
}));
