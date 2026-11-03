// AI 담당 영역. Phase 0~1은 mock: 미션의 단계별 기본 대사 + 키워드 판정.
// Phase 2에서 이 파일 내부만 Gemini로 교체 (export 시그니처 유지).
import type { AiInput, AiOutput, Outcome, Stage } from "./types.ts";

export const STAGES: Stage[] = ["approach", "trust", "pressure", "demand"];
export const nextStage = (s: Stage): Stage => STAGES[Math.min(STAGES.indexOf(s) + 1, STAGES.length - 1)];

// shortcut: 키워드 판정 — "안 확인할래요" 같은 부정문은 오판 가능. Phase 2에서 Gemini 판정으로 교체.
const SAFE = /(확인|직접\s*전화|끊|안\s*(보내|보낼|해|할|줄|드|누르|누를|알려)|못\s*(보내|보낼|해|할|드)|거절|신고|112|싫어|안\s*돼)/;
const UNSAFE = /(보낼게|보내드릴게|송금할게|이체할게|알려\s*드릴게|알려줄게|입력할게|누를게|눌러\s*볼게|설치할게)/;

export function classify(text: string): Outcome {
  if (SAFE.test(text)) return "safe";
  if (UNSAFE.test(text)) return "unsafe";
  return "incomplete";
}

export async function generateReply(input: AiInput): Promise<AiOutput> {
  const lines = input.mission.fallback_lines;
  if (!input.user_text) {
    return { reply: lines[input.stage], next_stage: input.stage, ended: false, used_fallback: false };
  }
  const verdict = classify(input.user_text);
  if (verdict === "safe") {
    return { reply: "...(상대방이 전화를 끊었습니다)", next_stage: input.stage, ended: true, used_fallback: false };
  }
  const ended = verdict === "unsafe" && input.stage === "demand";
  const next = nextStage(input.stage);
  return { reply: lines[next], next_stage: next, ended, used_fallback: false };
}

// LLM 호출은 llm-gateway(Groq → Gemini → OpenRouter 자동 전환)를 거침. 전부 실패하면 throw →
// chat-turn이 fallback_lines로 대체. 프롬프트·판정을 LLM으로 바꿀 때 generateReply 안에서 이걸 쓰면 됨.
export async function llm(messages: { role: "system" | "user" | "assistant"; content: string }[]): Promise<string> {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/llm-gateway`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!r.ok) throw new Error(`LLM_GATEWAY_${r.status}`);
  return (await r.json()).text;
}
