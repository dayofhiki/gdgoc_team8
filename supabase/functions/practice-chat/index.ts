/**
 * 배포 가능한 독립형 AI 채팅 연습.
 * 기존 초대 기반 chat-turn은 그대로 유지하며, 홈의 '혼자 연습하기'만 담당합니다.
 * 브라우저의 익명 Supabase 인증을 요구하고, LLM 키(GEMINI·GROQ·OPENROUTER)는 Edge Function Secret에서만 읽습니다(llm.ts).
 * 이 간편 모드의 기록은 DB에 저장하지 않습니다.
 */
import { generateReply, nextStage } from "../_shared/ai.ts";
import { handle, HttpError, must } from "../_shared/http.ts";
import { hasPii, maskPii } from "../_shared/pii.ts";
import { providers } from "../_shared/llm.ts";
import type { AiInput, Difficulty, Message, Mission, Stage } from "../_shared/types.ts";

type History = Pick<Message, "role" | "text" | "stage">;
type Body = { mission_id?: string; difficulty?: Difficulty; stage?: Stage; history?: History[]; text?: string };
const stages: Stage[] = ["approach", "trust", "pressure", "demand"];
const difficulties: Difficulty[] = ["easy", "normal", "hard"];
const MAX_HISTORY = 24;

Deno.serve(handle<Body>(async ({ body, admin }) => {
  const id = body.mission_id ?? "family";
  if (typeof id !== "string" || id.length > 64) throw new HttpError(400, "BAD_REQUEST", "미션이 올바르지 않습니다");
  const mission = must(await admin.from("missions").select("*").eq("id", id).maybeSingle()) as Mission | null;
  if (!mission) throw new HttpError(404, "NOT_FOUND", "미션을 찾을 수 없습니다");
  const stage = body.stage ?? "approach";
  const difficulty = body.difficulty ?? "normal";
  if (!stages.includes(stage) || !difficulties.includes(difficulty)) throw new HttpError(400, "BAD_REQUEST", "단계 또는 난이도가 올바르지 않습니다");
  if (body.text !== undefined && typeof body.text !== "string") throw new HttpError(400, "BAD_REQUEST", "메시지 형식이 올바르지 않습니다");
  const userText = body.text?.trim() ?? "";
  if (userText.length > 500) throw new HttpError(400, "BAD_REQUEST", "메시지는 500자 이하로 작성해주세요");
  if (hasPii(userText)) throw new HttpError(422, "PII_BLOCKED", "실제 개인정보는 입력하지 마세요");
  if (body.history !== undefined && !Array.isArray(body.history)) throw new HttpError(400, "BAD_REQUEST", "대화 기록 형식이 올바르지 않습니다");
  const raw = body.history ?? [];
  if (raw.length > MAX_HISTORY || raw.some((m) => !m || !["senior", "scammer"].includes(m.role) || typeof m.text !== "string" || m.text.length > 500 || !stages.includes(m.stage) || hasPii(m.text))) {
    throw new HttpError(400, "BAD_REQUEST", "대화 기록이 올바르지 않습니다");
  }
  if (!userText) {
    return { reply: mission.fallback_lines[stage], stage, ended: false, used_fallback: false, ai_configured: providers().length > 0 };
  }
  const input: AiInput = { mission, difficulty, stage, history: raw, user_text: userText };
  const ai = await Promise.race([
    generateReply(input),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), 8000)),
  ]).catch((e) => {
    console.error("practice-chat LLM error", e);
    return { reply: mission.fallback_lines[nextStage(stage)], next_stage: nextStage(stage), ended: false, used_fallback: true };
  });
  return { reply: maskPii(ai.reply), stage: ai.next_stage, ended: ai.ended, used_fallback: ai.used_fallback, ai_configured: providers().length > 0 };
}));
