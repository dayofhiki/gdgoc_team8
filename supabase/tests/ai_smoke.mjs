// 배포된 chat-turn이 실제 LLM으로 답하는지 확인 (키가 Supabase Secrets에 있어야 함). 실행: npm run test:ai
// 판정은 LLM이라 매번 조금 다를 수 있음 → 통과/실패 대신 결과를 표로 보여 줌. 무료 한도를 쓰므로 필요할 때만.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8").trim().split(/\r?\n/)
    .filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { error: authErr } = await c.auth.signInAnonymously();
if (authErr) throw authErr;
const call = async (name, body) => {
  const { data, error } = await c.functions.invoke(name, { body });
  if (!error) return data;
  try { return { error: (await error.context.json()).error.code }; } catch { return { error: error.message }; }
};

const { data: inv } = await c.from("invites").insert({ senior_name: "AI 스모크" }).select("token").single();
const { participant_id } = await call("invite-join", { token: inv.token });

// 시나리오별로 새 세션. 마지막 답에서 끝나야(ended) 하는지 기대값을 같이 보여 줌.
const scripts = [
  { name: "직접 확인 → 종료", says: ["누구세요?", "아빠한테 먼저 전화해서 물어볼게"], expectEnd: true },
  { name: "의심 질문 → 계속", says: ["진짜 너 맞아? 목소리 들려줘"], expectEnd: false },
  { name: "거절 → 종료", says: ["무슨 일인데?", "돈은 못 보내. 끊을게"], expectEnd: true },
];

let llmTurns = 0, fallbackTurns = 0;
for (const s of scripts) {
  const { data: sess } = await c.from("sessions").insert({ participant_id, mission_id: "family" }).select("id").single();
  const open = await call("chat-turn", { session_id: sess.id });
  console.log(`\n■ ${s.name}\n  사기범: ${open.reply?.text ?? JSON.stringify(open)}`);
  let last;
  for (const text of s.says) {
    const t0 = Date.now();
    last = await call("chat-turn", { session_id: sess.id, text });
    const ms = Date.now() - t0;
    if (last.error) { console.log(`  나: ${text}\n  ✗ ${last.error}`); break; }
    last.used_fallback ? fallbackTurns++ : llmTurns++;
    console.log(`  나: ${text}\n  사기범: ${last.reply.text}`);
    console.log(`    → stage=${last.stage} ended=${last.ended} ${last.used_fallback ? "기본 대사(LLM 실패)" : "LLM"} ${(ms / 1000).toFixed(1)}초`);
  }
  console.log(`  ${last?.ended === s.expectEnd ? "기대대로" : "기대와 다름"} (기대 ended=${s.expectEnd})`);
}
console.log(`\nLLM 응답 ${llmTurns}턴, 기본 대사 ${fallbackTurns}턴`);
console.log("어느 공급자가 답했는지: Supabase 대시보드 → Edge Functions → chat-turn → Logs 의 'llm: <공급자> → <intent>'");
