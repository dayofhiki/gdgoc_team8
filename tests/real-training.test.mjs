import test from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, evaluate, recordChoice } from "../src/lib/realTraining.ts";

function state(index) {
  return {
    version: 1, scenario: index, createdAt: Date.now(), turns: 0,
    messages: [{ actor: "them", text: SCENARIOS[index].opening }],
    events: [], verification: "none", closed: false,
  };
}
test("every training situation has an indistinguishable first message paired with a different truth", () => {
  assert.equal(SCENARIOS.length, 6);
  for (let i = 0; i < SCENARIOS.length; i += 2) {
    assert.equal(SCENARIOS[i].identity, "legitimate");
    assert.equal(SCENARIOS[i + 1].identity, "fraud");
    assert.equal(SCENARIOS[i].opening, SCENARIOS[i + 1].opening);
    assert.notEqual(SCENARIOS[i].verification, SCENARIOS[i + 1].verification);
  }
});
test("verified genuine request may be followed safely", () => {
  let s = state(0);
  s = recordChoice(s, SCENARIOS[0], "verify").state;
  assert.equal(s.verification, "confirmed");
  s = recordChoice(s, SCENARIOS[0], "comply").state;
  const result = evaluate(s, SCENARIOS[0], "legitimate");
  assert.equal(result.checked, true);
  assert.equal(result.dangerousAction, false);
});
test("complying with a fraud remains risky even after an unsuccessful verification", () => {
  let s = state(1);
  s = recordChoice(s, SCENARIOS[1], "verify").state;
  assert.equal(s.verification, "failed");
  s = recordChoice(s, SCENARIOS[1], "comply").state;
  const result = evaluate(s, SCENARIOS[1], "fraud");
  assert.equal(result.checked, true);
  assert.equal(result.dangerousAction, true);
});
test("correct guessing is not treated as independent verification", () => {
  const result = evaluate(state(1), SCENARIOS[1], "fraud");
  assert.equal(result.judgment, "실제 정체와 일치");
  assert.equal(result.checked, false);
  assert.match(result.safety, /확인 행동도 없었어요/);
});
test("acting before checking is risky even when the caller was genuine", () => {
  const s = recordChoice(state(0), SCENARIOS[0], "comply").state;
  const result = evaluate(s, SCENARIOS[0], "legitimate");
  assert.equal(result.dangerousAction, true);
});
test("ending a genuine conversation is not incorrectly scored as fraud recognition", () => {
  const s = recordChoice(state(0), SCENARIOS[0], "stop").state;
  const result = evaluate(s, SCENARIOS[0], "fraud");
  assert.equal(result.dangerousAction, false);
  assert.equal(result.judgment, "실제 정체와 다름");
  assert.equal(result.checked, false);
});
test("sender-provided channels and in-chat questions do not complete independent verification", () => {
  let s = state(1);
  s = recordChoice(s, SCENARIOS[1], "verify_sender").state;
  assert.equal(s.verification, "none");
  assert.equal(evaluate(s, SCENARIOS[1], "uncertain").checked, false);
  s = recordChoice(s, SCENARIOS[1], "verify_chat").state;
  assert.equal(s.verification, "none");
  s = recordChoice(s, SCENARIOS[1], "verify").state;
  assert.equal(s.verification, "failed");
  assert.equal(evaluate(s, SCENARIOS[1], "fraud").checked, true);
});
test("identity verification is recorded once and cannot be fabricated by a chat message", () => {
  const s = state(0);
  s.messages.push({ actor: "me", text: "원래 번호로 전화해 볼게요." });
  assert.equal(evaluate(s, SCENARIOS[0], "uncertain").checked, false);
  const verified = recordChoice(s, SCENARIOS[0], "verify").state;
  assert.throws(() => recordChoice(verified, SCENARIOS[0], "verify"));
});
