// 종료 판단·발화/이벤트 구분·반복·리포트 근거 테스트. Gemini는 fetch를 바꿔 끼워 흉내 냄 (실제 호출 없음).
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { generateFeedback, generateReply } from "./ai.ts";
import { checkFeedback, decideTurn, fallbackFeedback, isExplicitStop, observations, repeatCount, turnContext } from "./judge.ts";
import { decideNext, MAX_TURNS } from "../chat-turn/decide.ts";
import type { AiInput, HistoryItem, Mission } from "./types.ts";

const lines = { approach: "a", trust: "t", pressure: "p", demand: "d" };
const mission: Mission = { id: "m", title: "가족·지인 사칭", scam_type: "", persona: "자녀 사칭", fallback_lines: lines, sort: 0 };
const base = { mission, difficulty: "normal" as const, history: [] as HistoryItem[] };
const senior = (text: string, intent?: HistoryItem["intent"]): HistoryItem => ({ role: "senior", text, stage: "pressure", ...(intent ? { intent } : {}) });
const scammer = (text: string): HistoryItem => ({ role: "scammer", text, stage: "pressure" });

const realFetch = globalThis.fetch;
let calls = 0;
function fakeGemini(out: unknown) {
  process.env.GEMINI_API_KEY = "test-key";
  calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof out === "string" ? out : JSON.stringify(out) }] } }] }), { status: 200 });
  }) as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GEMINI_API_KEY;
});
const turn = (o: Record<string, unknown>) => ({ intent: "continue", uncertain: false, note: "", scammer_action: "continue", reply: "응답", ...o });
const ask = (text: string, extra: Partial<AiInput> = {}) => generateReply({ ...base, stage: "pressure", user_text: text, ...extra });

test("직접 확인 의사: 원래 번호로 전화해 볼게 → verify_intent (mock·Gemini)", async () => {
  const m = await ask("원래 번호로 전화해 볼게");
  assert.equal(m.end_reason, "verify_intent");
  fakeGemini(turn({ intent: "verify_independent", reply: "아 지금은 전화 안 되는데…" }));
  const g = await ask("원래 번호로 전화해 볼게");
  assert.deepEqual([g.ended, g.end_reason, g.ended_by], [true, "verify_intent", "learner"]);
});

test("대화에서 가족에게 확인했다고 말함 → verified_claimed", async () => {
  fakeGemini(turn({ intent: "verified_in_chat", reply: "어… 그럼 됐어" }));
  const r = await ask("지금 내 딸 옆에 있는데 수리비 필요 없다는데?");
  assert.deepEqual([r.ended, r.end_reason], [true, "verified_claimed"]);
});

test("명확한 거절 → refused, 명시적 중단 → AI 호출 없이 즉시 user_stopped", async () => {
  assert.equal((await ask("링크는 안 누를게")).end_reason, "refused");
  fakeGemini(turn({}));
  const r = await ask("그만할래");
  assert.deepEqual([r.ended, r.end_reason, r.reply, calls], [true, "user_stopped", "", 0]);
  assert.ok(isExplicitStop("연습 그만 할래요"));
  assert.ok(!isExplicitStop("그만 연락해")); // 상대에게 하는 말은 중단이 아님
});

test("링크 눌렀어(이벤트 없음): 처음엔 재확인·단계 유지, 반복되면 claimed_action 종료", async () => {
  fakeGemini(turn({ intent: "claimed_action", scammer_action: "continue", reply: "안 들어왔는데?" }));
  const first = await ask("링크 눌렀어", { link_offered: true });
  assert.deepEqual([first.ended, first.scammer_action, first.next_stage], [false, "recheck", "pressure"]);
  const history = [scammer("눌러줘"), senior("링크 눌렀어", "claimed_action"), scammer("안 들어왔는데?")];
  const second = await ask("진짜 눌렀다니까", { history, link_offered: true });
  assert.deepEqual([second.ended, second.end_reason], [true, "claimed_action"]);
});

test("발화와 실제 이벤트 구분: 이벤트가 없으면 근거·피드백이 행동을 단정하지 않음", () => {
  const history = [senior("링크 눌렀어", "claimed_action"), senior("이미 보냈어", "claimed_action")];
  const obs = observations({ history, events: [], endReason: "claimed_action", linkOffered: false });
  assert.ok(obs.every((o) => !o.includes("모의 링크를 열었어요")));
  assert.ok(obs.some((o) => o.includes("기록되지 않았어요") && o.includes("링크는 표시되지 않았어요")));
  const fb = fallbackFeedback({ history, events: [], endReason: "claimed_action", linkOffered: false });
  assert.match(fb.summary, /기록되지 않았어요/);
  // 실제 클릭 이벤트가 있으면 그때만 '열었어요'
  const clicked = observations({ history: [], events: [{ type: "link_clicked", at: "t" }], endReason: "mock_action", linkOffered: true });
  assert.ok(clicked.includes("훈련 화면에서 모의 링크를 열었어요."));
  assert.match(fallbackFeedback({ history: [], events: [{ type: "link_clicked", at: "t" }], endReason: "mock_action", linkOffered: true }).summary, /모의 링크를 열었어요/);
});

test("AI 피드백 검증: 이벤트 없이 송금·클릭을 사실로 쓰면 탈락, '말씀'은 허용", () => {
  const ok = { summary: "보냈다고 말씀하셨어요.", points: [], next_step: "가족에게 직접 확인해 보세요." };
  assert.ok(checkFeedback(ok, []));
  assert.equal(checkFeedback({ ...ok, summary: "돈을 보내셨어요." }, []), null);
  assert.equal(checkFeedback({ ...ok, summary: "링크를 여셨어요." }, []), null);
  assert.ok(checkFeedback({ ...ok, summary: "링크를 여셨어요." }, [{ type: "link_clicked", at: "t" }]));
  assert.equal(checkFeedback({ ...ok, next_step: "010-1234-5678로 전화" }, []), null);
  assert.equal(checkFeedback({ summary: "", points: [], next_step: "x" }, []), null);
});

test("generateFeedback: 키 없음·검증 탈락은 기본 피드백, 통과하면 ai", async () => {
  const input = { mission, history: [senior("보냈어", "claimed_action")], events: [], endReason: "claimed_action" as const, linkOffered: true, observations: [] };
  assert.equal((await generateFeedback(input)).source, "fallback");
  fakeGemini({ summary: "돈을 보내셨네요.", points: [], next_step: "확인하세요." });
  assert.equal((await generateFeedback(input)).source, "fallback");
  fakeGemini({ summary: "보냈다고 말씀하셨지만 기록된 송금은 없어요.", points: ["재촉에 바로 답하셨어요."], next_step: "원래 번호로 확인하세요." });
  const r = await generateFeedback(input);
  assert.deepEqual([r.source, r.feedback.points.length], ["ai", 1]);
});

test("장난·의심: 노골적 의심엔 물러날 수 있고, 근거 없는 leave는 재확인으로 낮춤, 불확실하면 종료 안 함", async () => {
  fakeGemini(turn({ intent: "suspect", scammer_action: "leave", reply: "뭐야 됐어" }));
  const r = await ask("사기꾼이지? 일부러 놀린 거야");
  assert.deepEqual([r.ended, r.end_reason, r.ended_by], [true, "scammer_left", "scammer"]);
  fakeGemini(turn({ intent: "unclear", scammer_action: "leave" }));
  const vague = await ask("음…");
  assert.deepEqual([vague.ended, vague.scammer_action], [false, "recheck"]);
  fakeGemini(turn({ intent: "refuse", uncertain: true }));
  assert.equal((await ask("글쎄 안 할 수도")).ended, false);
});

test("반복: 같은 답이 세 번째면 AI가 계속하자고 해도 상대가 물러나며 종료", async () => {
  const history = [senior("뭐라고?"), scammer("x"), senior("뭐라고"), scammer("y")];
  assert.equal(repeatCount(history, "뭐라고?!"), 2);
  assert.equal(turnContext(history, "뭐라고").forceLeave, true);
  fakeGemini(turn({ intent: "continue", scammer_action: "continue" }));
  const r = await ask("뭐라고", { history });
  assert.deepEqual([r.ended, r.end_reason], [true, "scammer_left"]);
});

test("최대 턴: AI가 끝내지 않아도 서버가 판단 보류로 종료", () => {
  const ai = { reply: "", next_stage: "trust" as const, ended: false, used_fallback: false };
  assert.deepEqual(decideNext(MAX_TURNS - 1, ai), { turn_count: MAX_TURNS, stage: "trust", ended: true, end_reason: "inconclusive", ended_by: "system" });
});

test("요청 수락 의사: 요구 전엔 계속, 요구 단계에선 complied (실제 행동 아님)", () => {
  const ctx = turnContext([], "보낼게");
  assert.equal(decideTurn({ intent: "comply", uncertain: false, stage: "trust", linkOffered: false, ctx, scammerAction: "continue" }).ended, false);
  assert.equal(decideTurn({ intent: "comply", uncertain: false, stage: "demand", linkOffered: false, ctx, scammerAction: "continue" }).end_reason, "complied");
});

test("모의 링크는 요구 단계에서 한 번만 표시, Gemini 형식 오류는 기본 대사로 대체", async () => {
  fakeGemini(turn({ intent: "continue" }));
  assert.equal((await ask("왜?")).offer_link, true); // pressure → demand
  assert.equal((await ask("왜?", { link_offered: true })).offer_link, false);
  fakeGemini("not json");
  const r = await ask("왜?");
  assert.equal(r.used_fallback, true);
});
