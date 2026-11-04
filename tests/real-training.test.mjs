import test from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, classifyOffer, evaluate, normalizeKoreanReply, recordChoice } from "../src/lib/realTraining.ts";

function state(index) {
  return {
    version: 1, scenario: index, createdAt: Date.now(), turns: 0,
    messages: [{ actor: "them", text: SCENARIOS[index].opening }],
    events: [], verification: "none", closed: false,
  };
}
function withOffer(state, kind, text = "송금해 주세요") {
  state.messages.push({ actor: "them", text, offer: kind });
  return { state, source: state.messages.length - 1 };
}

test("normal/fraud pair starts with an identical message", () => {
  assert.equal(SCENARIOS.length, 6);
  for (let i = 0; i < SCENARIOS.length; i += 2) {
    assert.equal(SCENARIOS[i].identity, "legitimate");
    assert.equal(SCENARIOS[i+1].identity, "fraud");
    assert.equal(SCENARIOS[i].opening, SCENARIOS[i+1].opening);
    assert.notEqual(SCENARIOS[i].verification, SCENARIOS[i+1].verification);
  }
});
test("explicit asks become appropriate inline actions; chatter does not", () => {
  assert.equal(classifyOffer("수리비를 이체해 주실 수 있나요?", "transfer"), "transfer");
  assert.equal(classifyOffer("주소를 입력해 주세요.", "share"), "share");
  assert.equal(classifyOffer("배송 확인 링크를 눌러 주세요.", "link"), "link");
  assert.equal(classifyOffer("제가 알려준 번호로 전화해 주세요.", "call"), "call");
  assert.equal(classifyOffer("그렇군요, 잘 지내세요.", "transfer"), undefined);
  assert.equal(classifyOffer("배송 안내가 필요하신가요?", "link"), undefined);
  assert.equal(classifyOffer("이체해 주세요.", "link"), undefined);
});
test("trusted verification ends the conversation and gives the correct evidence", () => {
  const legit = recordChoice(state(0), SCENARIOS[0], "verify").state;
  assert.equal(legit.verification, "confirmed");
  assert.equal(legit.closed, true);
  assert.equal(evaluate(legit, SCENARIOS[0], "legitimate").checked, true);
  assert.throws(() => recordChoice(legit, SCENARIOS[0], "stop"));
  const fraud = recordChoice(state(1), SCENARIOS[1], "verify").state;
  assert.equal(fraud.verification, "failed");
  assert.equal(fraud.closed, true);
});
test("stopping a genuine conversation is safe, but not an accurate fraud identification", () => {
  const stopped = recordChoice(state(0), SCENARIOS[0], "stop").state;
  assert.equal(stopped.closed, true);
  assert.equal(evaluate(stopped, SCENARIOS[0], "fraud").judgment, "실제 정체와 다름");
});
test("only a real message offer can trigger money or information transfer", () => {
  const empty = state(1);
  assert.throws(() => recordChoice(empty, SCENARIOS[1], "comply"));
  assert.throws(() => recordChoice(empty, SCENARIOS[1], "share", 0));
  const { state: transferState, source } = withOffer(state(1), "transfer");
  assert.throws(() => recordChoice(transferState, SCENARIOS[1], "share", source));
  const paid = recordChoice(transferState, SCENARIOS[1], "comply", source).state;
  assert.equal(paid.closed, true);
  assert.equal(evaluate(paid, SCENARIOS[1], "fraud").dangerousAction, true);
  const genuine = withOffer(state(0), "transfer");
  const paidGenuine = recordChoice(genuine.state, SCENARIOS[0], "comply", genuine.source).state;
  assert.equal(evaluate(paidGenuine, SCENARIOS[0], "legitimate").dangerousAction, true);
});
test("link opening is logged separately, can be closed without submitting and does not end training", () => {
  const { state: s, source } = withOffer(state(3), "link", "배송 확인 링크를 눌러 주세요.");
  const visited = recordChoice(s, SCENARIOS[3], "open_link", source).state;
  assert.equal(visited.closed, false);
  assert.equal(evaluate(visited, SCENARIOS[3], "uncertain").linkOpened, true);
  assert.equal(evaluate(visited, SCENARIOS[3], "uncertain").dangerousAction, false);
  assert.throws(() => recordChoice(visited, SCENARIOS[3], "open_link", source));
  const submitted = recordChoice(visited, SCENARIOS[3], "share", source).state;
  assert.equal(submitted.closed, true);
  assert.equal(evaluate(submitted, SCENARIOS[3], "fraud").dangerousAction, true);
});
test("sender-provided phone verification is not independent", () => {
  const { state: s, source } = withOffer(state(1), "call", "제가 알려준 번호로 전화해 주세요.");
  const called = recordChoice(s, SCENARIOS[1], "verify_sender", source).state;
  assert.equal(called.verification, "none");
  assert.equal(called.closed, false);
  assert.equal(evaluate(called, SCENARIOS[1], "fraud").checked, false);
  assert.throws(() => recordChoice(called, SCENARIOS[1], "verify_sender", source));
});
test("a text promise to verify or a lucky correct guess is not a verification event", () => {
  const s = state(1);
  s.messages.push({ actor: "me", text: "원래 번호로 전화할게요." });
  const result = evaluate(s, SCENARIOS[1], "fraud");
  assert.equal(result.checked, false);
  assert.equal(result.judgment, "실제 정체와 일치");
});


test("natural Korean replies do not show stray English to senior learners", () => {
  assert.equal(normalizeKoreanReply("official 앱이나 official website에서 확인해 주세요."), "공식 앱이나 공식 웹사이트에서 확인해 주세요.");
  assert.equal(normalizeKoreanReply("official 택배 앱에서 직접 확인해 주세요."), "공식 택배 앱에서 직접 확인해 주세요.");
  assert.equal(normalizeKoreanReply("이 link를 누르지 말고 app으로 확인하세요."), "이 링크를 누르지 말고 앱으로 확인하세요.");
  assert.doesNotMatch(normalizeKoreanReply("official app에서 확인해 주세요."), /[A-Za-z]/);
});
test("feedback reveals truth prominently while strengths and improvements follow real behavior", () => {
  const verified = evaluate(recordChoice(state(0), SCENARIOS[0], "verify").state, SCENARIOS[0], "legitimate");
  assert.equal(verified.highlights.status, "안전 확인");
  assert.equal(verified.identity, "legitimate");
  assert.ok(verified.highlights.good.some((point) => point.keyword === "독립 확인"));
  assert.equal(verified.highlights.improve.length, 0);

  const noCheck = evaluate(state(1), SCENARIOS[1], "fraud");
  assert.equal(noCheck.identity, "fraud");
  assert.equal(noCheck.highlights.judgment, "판단 일치");
  assert.ok(noCheck.highlights.improve.some((point) => point.keyword === "신원 확인"));
  assert.ok(noCheck.highlights.good.every((point) => point.keyword !== "독립 확인"));

  const offered = withOffer(state(1), "transfer");
  const unsafe = evaluate(recordChoice(offered.state, SCENARIOS[1], "comply", offered.source).state, SCENARIOS[1], "uncertain");
  assert.equal(unsafe.highlights.status, "위험 행동");
  assert.ok(unsafe.highlights.improve.some((point) => point.keyword === "송금 위험"));
  assert.equal(unsafe.highlights.good.some((point) => point.keyword === "정보 보호"), false);
});
