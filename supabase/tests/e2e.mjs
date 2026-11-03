// 배포된 Supabase 프로젝트에 실제로 요청을 보내 핵심 경로를 확인. 실행: npm run test:e2e
// .env.local의 NEXT_PUBLIC_SUPABASE_URL·ANON_KEY 사용. 매 실행마다 익명 사용자 5명과 초대 2개가 새로 생김.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8").trim().split(/\r?\n/)
    .filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const user = async () => {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInAnonymously();
  if (error) throw error;
  return c;
};
// Edge Function 호출 → { data } 또는 { code } (서버의 error.code)
const call = async (c, name, body) => {
  const { data, error } = await c.functions.invoke(name, { body });
  if (!error) return { data };
  try { return { code: (await error.context.json()).error.code }; } catch { return { code: error.message }; }
};
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) failed++; };

const [guardian, a, b, c, outsider] = await Promise.all([user(), user(), user(), user(), user()]);

// 초대 생성 (정원 2)
const { data: inv, error: invErr } = await guardian.from("invites").insert({ senior_name: "E2E", max_participants: 2 }).select("token").single();
ok(!invErr && inv.token.length === 64, "보호자 초대 생성 (64자 토큰)");

// 3명 동시 입장 → 2명 성공, 1명 INVITE_FULL
const joins = await Promise.all([a, b, c].map((s) => call(s, "invite-join", { token: inv.token })));
const joined = joins.filter((r) => r.data).length, full = joins.filter((r) => r.code === "INVITE_FULL").length;
ok(joined === 2 && full === 1, `동시 입장 3명 → 성공 ${joined}명, INVITE_FULL ${full}명`);

// 다른 링크는 서로 막지 않음: 정원 1 링크 두 개에 동시에 1명씩
const [{ data: g1 }, { data: g2 }] = await Promise.all([1, 2].map(() => guardian.from("invites").insert({}).select("token").single()));
const cross = await Promise.all([call(b, "invite-join", { token: g1.token }), call(c, "invite-join", { token: g2.token })]);
ok(cross.every((r) => r.data), "다른 링크 동시 입장은 각자 성공");

ok((await call(a, "invite-join", { token: "nope" })).code === "INVITE_INVALID", "없는 토큰 → INVITE_INVALID");
const winner = [a, b, c][joins.findIndex((r) => r.data)];
const pid = joins.find((r) => r.data).data.participant_id;
ok((await call(winner, "invite-join", { token: inv.token })).data?.participant_id === pid, "같은 사용자 재입장 → 같은 참여자");

// 미션 → 세션 → 채팅
const { data: missions } = await winner.from("missions").select("id").order("sort");
ok(missions?.length === 3, "미션 3개 조회");
const { data: sess, error: sErr } = await winner.from("sessions").insert({ participant_id: pid, mission_id: "family" }).select("id").single();
ok(!sErr, "세션 생성");
const sid = sess.id;
const [open, open2] = await Promise.all([1, 2].map(() => call(winner, "chat-turn", { session_id: sid })));
ok(open.data?.reply.role === "scammer" && open.data.stage === "approach", "첫 대사 (approach)");
ok(open.data?.reply.id === open2.data?.reply.id, "첫 대사 동시 2회 호출 → 같은 메시지 1개");
ok((await call(winner, "chat-turn", { session_id: sid, text: "내 번호 010-1234-5678로 해" })).code === "PII_BLOCKED", "전화번호 입력 → PII_BLOCKED");
// 연타: 같은 턴을 동시에 2번 → 1번만 저장, 나머지는 TURN_CONFLICT
const dup = await Promise.all([1, 2].map(() => call(winner, "chat-turn", { session_id: sid, text: "누구세요?" })));
const t1 = dup.find((r) => r.data) ?? {};
ok(dup.filter((r) => r.data).length === 1 && dup.some((r) => r.code === "TURN_CONFLICT"), "보내기 연타 → 1번만 처리, 나머지 TURN_CONFLICT");
const t2 = await call(winner, "chat-turn", { session_id: sid, text: "무슨 일인데?" });
const t3 = await call(winner, "chat-turn", { session_id: sid, text: "직접 전화해서 확인할게" });
ok(t1.data?.stage === "trust" && t2.data?.stage === "pressure" && t3.data?.ended === true, "3턴: trust → pressure → ended");
const { count } = await winner.from("messages").select("id", { count: "exact", head: true }).eq("session_id", sid);
ok(count === 7, `messages ${count}행 (기대 7, PII 입력은 저장 안 됨)`);
ok((await call(winner, "chat-turn", { session_id: sid, text: "또" })).code === "SESSION_ENDED", "종료 후 채팅 → SESSION_ENDED");

// 결과
const r1 = await call(winner, "session-end", { session_id: sid });
const r2 = await call(winner, "session-end", { session_id: sid });
ok(r1.data?.result.outcome === "safe" && r1.data.result.red_flags.length === 3, "결과 safe, 위험 신호 3개");
ok(r1.data?.result.id === r2.data?.result.id, "session-end 재호출 → 같은 결과");
const { count: rc } = await winner.from("results").select("id", { count: "exact", head: true }).eq("session_id", sid);
ok(rc === 1, `results ${rc}행 (기대 1)`);

// 권한
const { data: peek } = await outsider.from("messages").select("id").eq("session_id", sid);
ok(peek?.length === 0, "다른 사용자는 그 대화 0행");
ok((await call(outsider, "chat-turn", { session_id: sid, text: "hi" })).code === "NOT_FOUND", "다른 사용자가 남의 세션으로 채팅 → NOT_FOUND");
const { error: upErr } = await winner.from("results").update({ outcome: "unsafe" }).eq("session_id", sid);
ok(!!upErr, "판정(outcome) 직접 수정 불가");

console.log(failed ? `\n${failed}개 실패` : "\n전부 통과");
process.exit(failed ? 1 : 0);
