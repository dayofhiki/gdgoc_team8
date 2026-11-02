// node:test 사용 → `deno test supabase/functions` 와 `node --experimental-strip-types --test` 양쪽에서 실행
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, generateReply } from "./ai.ts";
import { hasPii, maskPii } from "./pii.ts";
import { decideNext, MAX_TURNS } from "../chat-turn/decide.ts";
import type { Mission } from "./types.ts";

test("pii", () => {
  assert.ok(hasPii("제 번호는 010-1234-5678이에요"));
  assert.ok(hasPii("계좌 110-123-456789"));
  assert.ok(hasPii("900101-1234567"));
  assert.ok(!hasPii("50만 원 보내줘"));
  assert.ok(!hasPii("2026년 11월 3일"));
  assert.equal(maskPii("010-1234-5678로 연락"), "***-****-****로 연락");
});

test("classify", () => {
  assert.equal(classify("직접 전화해서 확인할게"), "safe");
  assert.equal(classify("안 보낼게"), "safe");
  assert.equal(classify("지금 보낼게"), "unsafe");
  assert.equal(classify("누구세요?"), "incomplete");
});

test("decideNext", () => {
  const ai = { reply: "", next_stage: "trust" as const, ended: false, used_fallback: false };
  assert.deepEqual(decideNext(0, ai), { turn_count: 1, stage: "trust", ended: false });
  assert.equal(decideNext(MAX_TURNS - 1, ai).ended, true);
  assert.equal(decideNext(0, { ...ai, ended: true }).ended, true);
});

test("mock generateReply: 3 neutral turns advance stages, safe answer ends", async () => {
  const lines = { approach: "a", trust: "t", pressure: "p", demand: "d" };
  const mission: Mission = { id: "m", title: "", scam_type: "", persona: "", fallback_lines: lines, sort: 0 };
  const base = { mission, difficulty: "normal" as const, history: [] };
  assert.equal((await generateReply({ ...base, stage: "approach" })).reply, "a");
  const r = await generateReply({ ...base, stage: "approach", user_text: "누구세요?" });
  assert.deepEqual([r.reply, r.next_stage, r.ended], ["t", "trust", false]);
  assert.equal((await generateReply({ ...base, stage: "pressure", user_text: "확인해볼게요" })).ended, true);
  assert.equal((await generateReply({ ...base, stage: "demand", user_text: "보낼게" })).ended, true);
});
