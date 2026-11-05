import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_RULES, RESPONSE_SCHEMA, parseResponse, buildActions, actionChoice } from "../src/lib/trainingActions.ts";
import { SCENARIOS, recordChoice, evaluate } from "../src/lib/realTraining.ts";
import { groundedProposals } from "../src/lib/trainingActionGuard.ts";

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


test("v3 uses only actions actually requested by the actor, confirmed by independent semantic audit", () => {
  const link = proposal("link", "sender", "택배사", "배송지 확인");
  const money = proposal("transfer", "sender", "가족", "수리비 송금");
  const app = proposal("app", "installed", "은행", "거래 확인");
  assert.equal(groundedProposals("아래 링크를 눌러서 배송지를 확인해 주세요.", [link], [link], "fraud").length, 1);
  assert.equal(groundedProposals("주소 확인이 필요합니다.", [link], [link], "fraud").length, 0);
  assert.equal(groundedProposals("아래 링크를 눌러서 확인해 주세요.", [], [link], "fraud").length, 0);
  assert.equal(groundedProposals("아래 링크를 눌러서 확인해 주세요.", [link], [], "fraud").length, 0);
  assert.equal(groundedProposals("아래 링크를 눌러서 확인해 주세요.", [link], undefined, "fraud").length, 1);
  assert.equal(groundedProposals("링크는 누르지 마시고 공식 앱에서 확인하세요.", [link, app], [link, app], "fraud").length, 1);
  assert.equal(groundedProposals("수리비 좀 보내줄 수 있어?", [money], [money], "legitimate").length, 1);
  assert.equal(groundedProposals("수리비가 필요하긴 해.", [money], [money], "legitimate").length, 0);
  assert.equal(groundedProposals("돈은 보내지 마세요.", [money], [money], "fraud").length, 0);
  assert.equal(groundedProposals("수리비 조금 도와주실 수 있어?", [money], [money], "legitimate").length, 1);
  assert.equal(groundedProposals("은행 앱에서 직접 확인해 주세요.", [app], [app], "legitimate").length, 0);
  assert.equal(groundedProposals("", [link], [link], "fraud").length, 0);
});

test("v3 keeps sender-provided and preexisting verification sources distinct", () => {
  const sender = proposal("phone", "sender", "고객센터", "확인");
  const trusted = proposal("phone", "preexisting", "고객센터", "확인");
  assert.equal(groundedProposals("지금 저희 번호로 전화해 주세요.", [sender], [trusted], "fraud").length, 0);
  assert.equal(groundedProposals("지금 저희 번호로 전화해 주세요.", [sender], [sender], "fraud").length, 1);
});

test("card callback branches only from the attached number and requires opening the mock page before installing", async () => {
  const { fallbackTrainingTurn } = await import("../src/lib/trainingFallback.ts");
  const scenario = SCENARIOS.find(item => item.topic === "card" && item.identity === "fraud");
  const s = session(SCENARIOS.indexOf(scenario));
  const beat = fallbackTrainingTurn(s, scenario, "카드 신청한 적 없어요.");
  const { index, message } = add(s, beat.reply, beat.actions);
  const recent = recordChoice(s, scenario, "verify_sender", undefined, undefined, "recent_sender");
  assert.equal(recent.state.messages.filter(item => item.actor === "them").length, 2);
  const called = recordChoice(s, scenario, "verify_sender", index, message.actions[0].id);
  assert.equal(called.state.verification, "none");
  assert.equal(called.state.closed, false);
  const linkIndex = called.state.messages.length - 1;
  const link = called.state.messages[linkIndex].actions[0];
  assert.equal(link.linkPreview.interaction, "install");
  assert.throws(() => recordChoice(called.state, scenario, "install", linkIndex, link.id));
  const opened = recordChoice(called.state, scenario, "open_link", linkIndex, link.id);
  assert.throws(() => recordChoice(opened.state, scenario, "share", linkIndex, link.id));
  const installed = recordChoice(opened.state, scenario, "install", linkIndex, link.id).state;
  assert.equal(installed.closed, true);
  assert.equal(evaluate(installed, scenario, "uncertain").dangerousAction, true);
  const feedback = evaluate(installed, scenario, "uncertain").behavior;
  assert.equal(feedback.receipts.at(-1).label, "모의 원격 지원 앱 설치");
  assert.match(feedback.promises[0].title, /원격 지원 앱을 설치하지 않기/);
  assert.equal(feedback.promises[0].practiced, false);
  const stopped = recordChoice(called.state, scenario, "stop").state;
  assert.equal(evaluate(stopped, scenario, "uncertain").behavior.promises.find(p => p.id === "hold").practiced, true);
});

test("every authored fallback offers a grounded action by its scheduled third reply at latest", async () => {
  const { fallbackTrainingTurn } = await import("../src/lib/trainingFallback.ts");
  const { meaningfulRiskRequest } = await import("../src/lib/trainingDecision.ts");
  const { caseBranch, caseVariantCount } = await import("../src/lib/trainingCaseFacts.ts");
  for (const scenario of SCENARIOS.filter(item => item.identity === "fraud")) {
    for (let variant = 0; variant < caseVariantCount(scenario); variant++) {
      const branch = caseBranch(scenario, variant);
      const s = session(SCENARIOS.indexOf(scenario));
      s.caseVariant = variant;
      s.turns = branch.requestAfterTurns;
      const turn = fallbackTrainingTurn(s, scenario, "무슨 내용인가요?");
      assert.ok(meaningfulRiskRequest(turn.reply, turn.actions),
        scenario.topic + "/" + variant);
    }
  }
});

test("feedback describes the episode and only reports independently verified evidence from the learner's actions", async () => {
  const { caseBranch } = await import("../src/lib/trainingCaseFacts.ts");
  const scenario = SCENARIOS.find(item => item.topic === "card" && item.identity === "fraud");
  const state = session(SCENARIOS.indexOf(scenario));
  state.caseVariant = 4;
  const stopped = recordChoice(state, scenario, "stop").state;
  const stoppedResult = evaluate(stopped, scenario, "uncertain");
  assert.equal(stoppedResult.purpose, caseBranch(scenario, state.caseVariant).incident);
  assert.equal(stoppedResult.verificationEvidence, "");
  const attempted = recordChoice(state, scenario, "verify", undefined, undefined, "card_app");
  assert.equal(evaluate(attempted.state, scenario, "uncertain").verificationEvidence, "");
  const confirmed = recordChoice(state, scenario, "verify", undefined, undefined, "official_directory");
  assert.equal(evaluate(confirmed.state, scenario, "uncertain").verificationEvidence, confirmed.notice);
});
