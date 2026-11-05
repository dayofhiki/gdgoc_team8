import test from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, evaluate, recordChoice } from "../src/lib/realTraining.ts";
import { buildBehaviorFeedback } from "../src/lib/trainingFeedback.ts";
import { buildActions } from "../src/lib/trainingActions.ts";

const state = (scenario = 0) => ({
  version: 1, scenario, createdAt: Date.now(), turns: 1,
  messages: [{ actor: "them", text: SCENARIOS[scenario].opening }],
  events: [], verification: "none", closed: true, endReason: "natural",
});
const event = (choice, extra = {}) => ({ choice, verifiedBefore: false, turn: 1, ...extra });
const action = (kind, target = "") => ({
  kind, origin: "sender", target, task: "확인", previewTitle: "", previewDescription: "",
});
const feedback = s => buildBehaviorFeedback(s, SCENARIOS[s.scenario]);

test("a normal and impersonating caller with identical actions get identical behavioral priorities", () => {
  const a = state(0), b = state(1);
  a.events.push(event("family_contact"));
  b.events.push(event("family_contact"));
  const x = feedback(a), y = feedback(b);
  assert.equal(x.headline, y.headline);
  assert.equal(x.tone, y.tone);
  assert.deepEqual(x.good, y.good);
  assert.deepEqual(x.improve, y.improve);
  assert.equal(x.promises[0].practiced, true);
  assert.equal(evaluate(a, SCENARIOS[0], "fraud").behavior.headline,
    evaluate(b, SCENARIOS[1], "legitimate").behavior.headline);
});

test("guessing the caller's identity is not a substitute for actually checking", () => {
  const original = state(1);
  original.messages.push({ actor: "me", text: "기존 번호로 확인해 볼게요." });
  const guessedRight = evaluate(original, SCENARIOS[1], "fraud");
  const guessedWrong = evaluate(original, SCENARIOS[1], "legitimate");
  assert.equal(guessedRight.behavior.tone, "neutral");
  assert.equal(guessedRight.behavior.hasConfirmedAction, false);
  assert.equal(guessedRight.behavior.promises[0].practiced, false);
  assert.deepEqual(guessedRight.behavior, guessedWrong.behavior);
  assert.ok(guessedRight.behavior.receipts[0].detail.includes("말"));
});

test("independent verification promotes confirmed behavior rather than guessing correctly", () => {
  for (const scenarioIndex of [2, 3, 4, 5]) {
    const s = state(scenarioIndex);
    s.events.push(event("verify"));
    const result = feedback(s);
    assert.equal(result.tone, "good");
    assert.ok(result.headline.includes("직접 확인"));
    assert.equal(result.promises[0].practiced, true);
    assert.ok(result.good.some(point => point.keyword.includes("직접 확인했어요")));
  }
});

test("family consultation is not institution verification and includes follow-up advice", () => {
  const bank = state(4);
  bank.events.push(event("family_contact"));
  const result = feedback(bank);
  assert.equal(result.promises[0].practiced, false);
  assert.equal(result.promises[2].practiced, true);
  assert.ok(result.improve.some(x => x.keyword.includes("공식 앱이나 대표번호")));
  assert.ok(result.receipts[0].detail.includes("기관 확인"));
});

test("a risky request alone does not award automatic restraint or a perfect score", () => {
  const s = state(3);
  s.messages.push({
    actor:"them", text:"가상 링크를 눌러 주세요",
    actions:buildActions([action("link","택배")],1),
  });
  const noChoice = feedback(s);
  assert.equal(noChoice.promises[1].practiced,false);
  assert.equal(noChoice.good.length,0);
  s.events.push(event("stop"));
  const deliberatelyStopped = feedback(s);
  assert.equal(deliberatelyStopped.promises[1].practiced,true);
  assert.ok(deliberatelyStopped.good.some(x=>x.keyword.includes("확인 전에는 돈과 정보를 보내지")));
});

test("sensitive information, links and sender-provided phone are reported as distinct choices", () => {
  const s = state(3);
  s.events.push(event("open_link"),event("verify_sender"),event("share"));
  const result = feedback(s);
  assert.equal(result.tone,"caution");
  assert.equal(result.receipts.length,3);
  assert.ok(result.improve.some(x=>x.keyword.includes("개인정보를 보내기 전에")));
  assert.ok(result.improve.some(x=>x.keyword.includes("문자 속 링크를")));
  assert.ok(result.improve.some(x=>x.keyword.includes("상대가 알려준 번호")));
  assert.equal(result.promises[1].practiced,false);
});

test("unverified transfer is not disguised by a correct guess", () => {
  const s = state(1);
  s.events.push(event("comply"));
  const guessedCorrect = evaluate(s,SCENARIOS[1],"fraud");
  assert.equal(guessedCorrect.behavior.tone,"caution");
  assert.ok(guessedCorrect.behavior.headline.includes("송금"));
  assert.equal(guessedCorrect.behavior.promises[1].practiced,false);
});

test("family question reminder does not assert it was answered or shared", () => {
  const s = state(0);
  s.events.push(event("family_contact"));
  const result = feedback(s);
  assert.equal(result.promises[0].practiced,true);
  assert.equal(result.promises[2].practiced,false);
  assert.match(result.promises[2].detail,/의심되는 연락에는 답을 알려주지 않고/);
});

test("recorded official-app action remains the authority for credit, not an AI sentence", () => {
  const s = state(4);
  s.closed = false;
  const idx = s.messages.length;
  s.messages.push({
    actor:"them", text:"은행 공식 앱에서 확인해 주세요",
    actions:buildActions([{
      kind:"app",origin:"installed",target:"은행",task:"거래 확인",
      previewTitle:"",previewDescription:"",
    }],1),
  });
  const before = feedback(s);
  assert.equal(before.promises[0].practiced,false);
  const chosen = recordChoice(s,SCENARIOS[4],"verify",idx,s.messages[idx].actions[0].id).state;
  const after = feedback(chosen);
  assert.equal(after.promises[0].practiced,true);
  assert.ok(after.receipts.some(x=>x.label==="공식 경로로 직접 확인"));
});
