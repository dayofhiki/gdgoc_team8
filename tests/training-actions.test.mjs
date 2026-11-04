import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_RULES, RESPONSE_SCHEMA, parseResponse, buildActions, actionChoice } from "../src/lib/trainingActions.ts";
import { SCENARIOS, recordChoice, evaluate } from "../src/lib/realTraining.ts";

function session(i) {
  return { version: 1, scenario: i, createdAt: Date.now(), turns: 1,
    messages: [{ actor: "them", text: SCENARIOS[i].opening }], events: [], verification: "none", closed: false };
}
function proposal(kind, origin, target, task, title = "", description = "") {
  return { kind, origin, target, task, previewTitle: title, previewDescription: description };
}
function add(s, text, input) {
  s.messages.push({ actor: "them", text, actions: buildActions(input, s.turns) });
  return { message: s.messages[s.messages.length - 1], index: s.messages.length - 1 };
}
test("response contract is semantic and generic without scenario-specific keyword parser", () => {
  assert.ok(ACTION_RULES.includes("의미"));
  assert.equal(RESPONSE_SCHEMA.properties.actions.type, "array");
  const response = parseResponse(JSON.stringify({
    reply: "직접 앱에서 확인하고 카드 뒷면 번호로 전화하세요.",
    actions: [
      proposal("app", "installed", "은행", "거래 내역 확인"),
      proposal("phone", "preexisting", "고객센터", "거래 내역 확인"),
    ],
  }));
  assert.equal(response.actions.length, 2);
  assert.throws(() => parseResponse('{"reply":"안녕하세요","actions":[{"kind":"unknown","origin":"sender","target":"","task":"","previewTitle":"","previewDescription":""}]}'));
});
test("future delivery, tax office, used goods and family messages all reuse same action engine", () => {
  const examples = [
    proposal("app", "installed", "택배사", "배송지 주소 변경"),
    proposal("phone", "preexisting", "세무서", "서류 문의"),
    proposal("link", "sender", "거래 플랫폼", "결제 요청", "주문 확인", "결제 내역을 확인하세요"),
    proposal("transfer", "sender", "가족", "수리비 송금"),
    proposal("provide_data", "sender", "기관", "신분증 제출"),
  ];
  const actions = buildActions(examples, 3);
  assert.equal(actions.length, examples.length);
  assert.deepEqual(actions.map(actionChoice), ["verify", "verify", "open_link", "comply", "share"]);
  assert.equal(actions[0].label, "택배사 앱 열기");
  assert.equal(actions[1].label, "기존 번호로 전화");
  assert.match(actions[2].linkPreview.url, /\.example\//);
  assert.equal(actions[2].linkPreview.title, "주문 확인");
});
test("a message with two different fake links produces two clickable, distinct preview objects", () => {
  const actions = buildActions([
    proposal("link", "sender", "영수증", "거래 내역 조회", "거래 조회", "거래 내역 확인"),
    proposal("link", "sender", "배송", "배송 상태 확인", "배송 확인", "배송 정보"),
  ], 3);
  assert.equal(actions.length, 2);
  assert.notEqual(actions[0].id, actions[1].id);
  assert.notEqual(actions[0].linkPreview.url, actions[1].linkPreview.url);
  assert.ok(actions.every(a => a.linkPreview.domain.endsWith(".example")));
});
test("only a sealed action ID from the corresponding message can create a user event", () => {
  const s = session(3);
  const { index, message } = add(s, "아래 링크에서 배송지 수정이 가능합니다.", [
    proposal("link", "sender", "택배사", "배송지 수정", "주소 확인", "배송지 입력"),
  ]);
  const action = message.actions[0];
  assert.throws(() => recordChoice(s, SCENARIOS[3], "open_link", index, "forged-id"));
  assert.throws(() => recordChoice(s, SCENARIOS[3], "verify", index, action.id));
  const visited = recordChoice(s, SCENARIOS[3], "open_link", index, action.id).state;
  assert.equal(visited.closed, false);
  assert.equal(evaluate(visited, SCENARIOS[3], "uncertain").linkOpened, true);
  assert.throws(() => recordChoice(visited, SCENARIOS[3], "open_link", index, action.id));
  assert.throws(() => recordChoice(visited, SCENARIOS[3], "share", index, "forged-id"));
  const shared = recordChoice(visited, SCENARIOS[3], "share", index, action.id).state;
  assert.equal(shared.closed, true);
  assert.equal(evaluate(shared, SCENARIOS[3], "fraud").dangerousAction, true);
});
test("source of an app or phone call affects verification rather than the apparent brand", () => {
  const installed = buildActions([proposal("app", "installed", "은행", "거래 조회")], 0)[0];
  const senderApp = buildActions([proposal("app", "sender", "은행", "앱 설치")], 0)[0];
  const senderPhone = buildActions([proposal("phone", "sender", "은행", "통화")], 0)[0];
  const knownPhone = buildActions([proposal("phone", "preexisting", "은행", "거래 조회")], 0)[0];
  assert.equal(actionChoice(installed), "verify");
  assert.equal(actionChoice(senderApp), "open_link");
  assert.ok(senderApp.linkPreview);
  assert.equal(actionChoice(senderPhone), "verify_sender");
  assert.equal(actionChoice(knownPhone), "verify");
});
test("untrusted model details never become real URLs, phone numbers or executable content", () => {
  const items = buildActions([
    proposal("link", "sender", "<script>alert(1)</script>", "http://example.org/x", "https://bad-site.test", "01012345678"),
    proposal("phone", "sender", "02-1234-5678", "전화"),
  ], 1);
  assert.equal(items.length, 2);
  assert.ok(items[0].linkPreview.url.endsWith("/view/2-1"));
  assert.ok(!items[0].linkPreview.title.includes("https://"));
  assert.ok(!items[1].label.includes("1234"));
});


test("model response and second semantic audit cannot duplicate one action via paraphrase", () => {
  const actions = buildActions([
    proposal("app", "installed", "택배사", "배송지 변경"),
    proposal("app", "installed", "택배사", "주소 다시 지정"),
    proposal("link", "sender", "거래내역", "취소 신청", "거래 취소", "요청 취소"),
    proposal("link", "sender", "거래내역", "결제 취소", "거래 취소", "취소 페이지"),
  ], 2);
  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map(a => a.kind), ["app", "link"]);
});
