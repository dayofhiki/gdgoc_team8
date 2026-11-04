/**
 * 로컬 AI 테스트 전용 API (/api/lab). Supabase 서버·DB를 전혀 건드리지 않습니다.
 * Edge Function과 같은 코드(ai.ts · decide.ts · pii.ts)를 Next.js 서버에서 직접 실행해
 * Gemini 대사·판정을 확인하는 용도. 대화 상태는 브라우저가 들고 다닙니다(저장 안 함).
 *
 * - GEMINI_API_KEY는 .env.local에서 서버 쪽으로만 읽힘 (NEXT_PUBLIC 아님 → 브라우저에 노출 안 됨)
 * - 개발 서버(npm run dev)에서만 동작. 빌드·배포 환경에서는 404 → 외부에서 토큰을 쓸 수 없음
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { generateReply, nextStage, classify } from "../../../../supabase/functions/_shared/ai";
import { hasPii, maskPii } from "../../../../supabase/functions/_shared/pii";
import { decideNext } from "../../../../supabase/functions/chat-turn/decide";
import type { AiOutput, Difficulty, Message, Mission, Outcome, Stage } from "@shared/types";

type Hist = Pick<Message, "role" | "text" | "stage">[];
type Body =
  | { action: "missions" }
  | { action: "turn"; mission_id: string; difficulty: Difficulty; stage: Stage; turn_count: number; history: Hist; text?: string }
  | { action: "end"; history: Hist };

const AI_TIMEOUT_MS = 8000; // chat-turn과 동일
const MAX_TEXT = 500;

// 미션은 supabase/seed.sql을 그대로 읽어 씀 (복사본을 두지 않기 위해)
function loadMissions(): Mission[] {
  const sql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
  const re = /\('([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'(\{[^']*\})',\s*(\d+)\)/g;
  return [...sql.matchAll(re)].map(([, id, title, scam_type, persona, lines, sort]) => ({
    id, title, scam_type, persona, fallback_lines: JSON.parse(lines), sort: Number(sort),
  }));
}

// session-end/index.ts와 같은 규칙 (그 파일은 Deno.serve라 import 불가)
const STAGE_FLAGS: Record<Stage, string> = {
  approach: "낯선 번호·처음 보는 상대가 먼저 연락함",
  trust: "그럴듯한 사연이나 신분을 내세워 믿게 만듦",
  pressure: "급하다며 생각할 시간을 주지 않음",
  demand: "송금·개인정보·앱 설치를 요구함",
};
const FEEDBACK: Record<Outcome, string[]> = {
  safe: ["잘하셨어요! 요구에 응하지 않고 확인을 먼저 했습니다.", "앞으로도 평소 알던 번호로 직접 확인하세요."],
  unsafe: ["요구에 응하려는 답이 있었어요. 실제라면 피해로 이어질 수 있습니다.", "송금·정보 요구를 받으면 일단 멈추고 가족에게 직접 전화하세요."],
  incomplete: ["판단하기 전에 대화가 끝났어요.", "의심되면 대화를 끊고 평소 연락처로 확인하는 연습을 해 보세요."],
};

const err = (status: number, code: string) => NextResponse.json({ error: { code } }, { status });

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") return err(404, "NOT_FOUND");
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return err(400, "BAD_REQUEST");

  if (body.action === "missions") {
    return NextResponse.json({ missions: loadMissions(), gemini: Boolean(process.env.GEMINI_API_KEY) });
  }

  if (body.action === "turn") {
    const mission = loadMissions().find((m) => m.id === body.mission_id);
    if (!mission) return err(404, "NOT_FOUND");
    const text = body.text?.trim().slice(0, MAX_TEXT) ?? "";
    if (!text) {
      return NextResponse.json({ reply: mission.fallback_lines[body.stage], stage: body.stage, turn_count: 0, ended: false, used_fallback: false });
    }
    if (hasPii(text)) return err(422, "PII_BLOCKED");

    const started = Date.now();
    const ai: AiOutput = await Promise.race([
      generateReply({ mission, difficulty: body.difficulty, stage: body.stage, history: body.history, user_text: text }),
      new Promise<AiOutput>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), AI_TIMEOUT_MS)),
    ]).catch((e) => {
      console.error("[lab] generateReply failed", e);
      const next = nextStage(body.stage);
      return { reply: mission.fallback_lines[next], next_stage: next, ended: false, used_fallback: true };
    });
    const d = decideNext(body.turn_count, ai);
    return NextResponse.json({
      reply: maskPii(ai.reply), stage: d.stage, turn_count: d.turn_count, ended: d.ended,
      used_fallback: ai.used_fallback, ms: Date.now() - started,
      end_reason: d.end_reason, ended_by: d.ended_by, analysis: ai.analysis, offer_link: ai.offer_link,
    });
  }

  if (body.action === "end") {
    const verdicts = body.history.filter((m) => m.role === "senior").map((m) => classify(m.text));
    const outcome: Outcome = verdicts.includes("unsafe") ? "unsafe" : verdicts.at(-1) === "safe" ? "safe" : "incomplete";
    const red_flags = [...new Set(body.history.filter((m) => m.role === "scammer").map((m) => STAGE_FLAGS[m.stage]))];
    return NextResponse.json({ result: { outcome, red_flags, feedback: FEEDBACK[outcome] } });
  }

  return err(400, "BAD_REQUEST");
}
