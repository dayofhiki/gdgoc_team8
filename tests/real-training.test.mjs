import test from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, classifyOffer, classifyOffers, evaluate, normalizeKoreanReply, recordChoice, simulatedLink } from "../src/lib/realTraining.ts";

function state(index) {
  return {
    version: 1, scenario: index, createdAt: Date.now(), turns: 0,
    messages: [{ actor: "them", text: SCENARIOS[index].opening }],
    events: [], verification: "none", closed: false,
  };
}
function withOffer(state, kind, text = "송금해 주세요") {
  state.messages.push({ actor: "them", text, offers: [kind], ...(kind === "link" ? { linkPreview: simulatedLink(SCENARIOS[state.scenario]) } : {}) });
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
test("trusted verification records evidence without skipping the remaining conversation", () => {
  const genuineRequest = withOffer(state(0), "official_call", "카드 뒷면 대표번호로 전화해 주세요.");
  const legit = recordChoice(genuineRequest.state, SCENARIOS[0], "verify", genuineRequest.source).state;
  assert.equal(legit.verification, "confirmed");
  assert.equal(legit.closed, false);
  assert.equal(evaluate(legit, SCENARIOS[0], "legitimate").checked, true);
  const finished = recordChoice(legit, SCENARIOS[0], "stop").state;
  assert.equal(finished.closed, true);
  assert.equal(finished.events.length, 2);
  const fraudRequest = withOffer(state(1), "official_app", "은행 공식 앱에서 확인해 주세요.");
  const fraud = recordChoice(fraudRequest.state, SCENARIOS[1], "verify", fraudRequest.source).state;
  assert.equal(fraud.verification, "failed");
  assert.equal(fraud.closed, false);
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
  const req = withOffer(state(0), "official_app", "공식 앱에서 확인해 주세요.");
  const verified = evaluate(recordChoice(req.state, SCENARIOS[0], "verify", req.source).state, SCENARIOS[0], "legitimate");
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


test("a single message can contain independent official app and official call actions", () => {
  const reply = "스마트폰에 설치된 은행 공식 앱이나 카드 뒷면의 대표번호로 직접 연락해서 거래 내역을 조회해 주세요.";
  assert.deepEqual(classifyOffers(reply, []), ["official_app", "official_call"]);
  const { state: s, source } = withOffer(state(4), "official_call", reply);
  s.messages[source].offers = ["official_app", "official_call"];
  const checked = recordChoice(s, SCENARIOS[4], "verify", source).state;
  assert.equal(checked.verification, "confirmed");
  assert.equal(checked.closed, false);
});

test("an official app offer is not created unless it was actually suggested", () => {
  assert.deepEqual(classifyOffers("안녕하세요. 거래 내역을 확인 부탁드립니다.", []), []);
  assert.deepEqual(classifyOffers("스마트폰에 설치된 은행 공식 앱에서 직접 확인해 주세요.", []), ["official_app"]);
  assert.deepEqual(classifyOffers("제가 보낸 링크에서 공식 앱을 확인해 주세요.", ["official_app", "link"]), ["link"]);
});

test("links carry reserved non-resolving addresses and message-preview metadata", () => {
  const preview = simulatedLink(SCENARIOS[3]);
  assert.match(preview.url, /^https:\/\/.*\.example\//);
  assert.equal(preview.domain, new URL(preview.url).hostname);
  const withLink = withOffer(state(3), "link", "문자 링크를 눌러 확인해 주세요.");
  assert.deepEqual(withLink.state.messages[withLink.source].linkPreview, preview);
  const opened = recordChoice(withLink.state, SCENARIOS[3], "open_link", withLink.source).state;
  assert.equal(opened.closed, false);
  assert.equal(evaluate(opened, SCENARIOS[3], "uncertain").linkOpened, true);
});

test("phone workspace verifies via a chosen source, never via a direct menu shortcut", () => {
  const request = withOffer(state(4), "transfer", "송금해 주세요.");
  assert.throws(() => recordChoice(request.state, SCENARIOS[4], "verify", request.source));
  assert.throws(() => recordChoice(request.state, SCENARIOS[4], "verify"));
  const independent = recordChoice(request.state, SCENARIOS[4], "verify", undefined, undefined, "official_directory").state;
  assert.equal(independent.verification, "confirmed");
  assert.equal(independent.closed, false);
  assert.equal(independent.events[0].method, "official_directory");
  const familyBank = recordChoice(state(4), SCENARIOS[4], "family_contact", undefined, undefined, "saved_family").state;
  assert.equal(familyBank.closed, false);
  assert.equal(familyBank.verification, "none");
  assert.equal(evaluate(familyBank, SCENARIOS[4], "uncertain").checked, false);
  assert.ok(evaluate(familyBank, SCENARIOS[4], "uncertain").highlights.good.some(p => p.keyword === "가족 상담"));
  const familyVerified = recordChoice(state(0), SCENARIOS[0], "family_contact", undefined, undefined, "saved_family").state;
  assert.equal(familyVerified.verification, "confirmed");
  assert.equal(evaluate(familyVerified, SCENARIOS[0], "legitimate").checked, true);
});


test("delivery address change prompts expose official-app action, even if Gemini omits its offers", () => {
  const screenshotReply = "운송장 번호에 적힌 주소가 명확하지 않아 배송이 지연되고 있습니다. 스마트폰에 설치된 택배사 공식 앱에서 배송지 주소를 변경해 주시겠어요";
  assert.deepEqual(classifyOffers(screenshotReply, []), ["official_app"]);
  assert.deepEqual(classifyOffers(screenshotReply, ["official_app"]), ["official_app"]);
  assert.deepEqual(classifyOffers("택배사 공식 앱에서 배송지 정보를 수정해 주세요.", []), ["official_app"]);
  assert.deepEqual(classifyOffers("은행 공식 앱에서 비밀번호를 변경해 주세요.", []), ["official_app"]);

  const { state: s, source } = withOffer(state(2), "official_app", screenshotReply);
  const verified = recordChoice(s, SCENARIOS[2], "verify", source).state;
  assert.equal(verified.closed, false);
  assert.equal(verified.verification, "confirmed");
});
test("mentioning official apps in a warning or unrelated sentence does not create an action", () => {
  assert.deepEqual(classifyOffers("택배사 공식 앱을 열지 마세요. 링크로 확인하세요.", []), []);
  assert.deepEqual(classifyOffers("공식 앱이 아닌 문자 속 링크를 눌러 주소를 변경해 주세요.", ["official_app", "link"]), ["link"]);
  assert.deepEqual(classifyOffers("택배사 공식 앱에 대한 문의입니다.", []), []);
});


test("phone choices allow verification for every scenario without automatically ending the training", () => {
  for (const scenario of SCENARIOS) {
    const s = state(SCENARIOS.indexOf(scenario));
    const family = scenario.id.startsWith("0-");
    const choice = family ? "family_contact" : "verify";
    const method = family ? "saved_family" : "official_directory";
    const checked = recordChoice(s, scenario, choice, undefined, undefined, method).state;
    assert.equal(checked.closed, false);
    assert.equal(checked.events.length, 1);
    assert.equal(checked.events[0].choice, choice);
    assert.equal(checked.events[0].method, method);
    assert.equal(checked.verification, scenario.identity === "legitimate" ? "confirmed" : "failed");
    assert.equal(evaluate(checked, scenario, "uncertain").checked, true);
  }
});

test("v3 learner-initiated verification does not accept a forged partial inline source", () => {
  const s = state(1);
  assert.throws(() => recordChoice(s, SCENARIOS[1], "verify", 0));
  assert.throws(() => recordChoice(s, SCENARIOS[1], "verify", undefined, "forged"));
});

test("phone workspace presents neutral functions, not a ready-made verification answer", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/TrainingPhonePanel.tsx", import.meta.url), "utf8");
  assert.match(ui, /<TrainingPhonePanel/);
  assert.match(ui, /rt-header-more--hint/);
  assert.doesNotMatch(ui, /onClick=\{\(\) => void perform\("verify"\)\}/);
  assert.match(panel, /저장된 가족 연락처/);
  assert.match(panel, /최근 문자 발신 번호/);
  assert.match(panel, /은행 앱/);
  assert.match(panel, /택배 앱/);
  assert.match(panel, /문자로 돌아가기/);
  assert.doesNotMatch(panel, /다른 경로로 직접 확인하기/);
});


test("phone workspace cannot invent a verified route or repeat a one-tap shortcut", () => {
  for (const index of [0, 1]) {
    assert.throws(() => recordChoice(state(index), SCENARIOS[index], "verify", undefined, undefined, "bank_app"));
    assert.throws(() => recordChoice(state(index), SCENARIOS[index], "verify", undefined, undefined, "official_directory"));
  }
  for (const index of [2, 3]) {
    assert.throws(() => recordChoice(state(index), SCENARIOS[index], "verify", undefined, undefined, "bank_app"));
  }
  for (const index of [4, 5]) {
    assert.throws(() => recordChoice(state(index), SCENARIOS[index], "verify", undefined, undefined, "delivery_app"));
  }
  const s = state(4);
  assert.throws(() => recordChoice(s, SCENARIOS[4], "verify_sender", undefined, undefined, "bank_app"));
  assert.throws(() => recordChoice(s, SCENARIOS[4], "family_contact", undefined, undefined, "recent_sender"));
  const dialled = recordChoice(s, SCENARIOS[4], "verify_sender", undefined, undefined, "recent_sender").state;
  assert.equal(dialled.verification, "none");
  assert.equal(dialled.closed, false);
  assert.equal(evaluate(dialled, SCENARIOS[4], "uncertain").checked, false);
  assert.throws(() => recordChoice(dialled, SCENARIOS[4], "verify_sender", undefined, undefined, "recent_sender"));
  const checked = recordChoice(dialled, SCENARIOS[4], "verify", undefined, undefined, "bank_app").state;
  assert.equal(checked.verification, "confirmed");
  assert.equal(checked.closed, false);
  assert.equal(checked.events.length, 2);
  assert.equal(recordChoice(checked, SCENARIOS[4], "stop").state.closed, true);
});

test("phone actions require actual source choices but never an AI-provided suggestion", () => {
  const s = state(3);
  assert.throws(() => recordChoice(s, SCENARIOS[3], "verify"));
  assert.throws(() => recordChoice(s, SCENARIOS[3], "verify", undefined, undefined, "saved_family"));
  const installed = recordChoice(s, SCENARIOS[3], "verify", undefined, undefined, "delivery_app").state;
  assert.equal(installed.verification, "failed");
  assert.equal(installed.closed, false);
  assert.ok(installed.messages.at(-1).text.includes("공식 앱"));
});


test("early verification is useful but cannot complete or claim full request-response practice", () => {
  const early = recordChoice(state(4), SCENARIOS[4], "verify", undefined, undefined, "bank_app").state;
  assert.equal(early.turns, 0);
  assert.equal(early.closed, false);
  assert.equal(early.verification, "confirmed");
  assert.equal(evaluate(early, SCENARIOS[4], "legitimate").coverage, "early");
  const endedEarly = recordChoice(early, SCENARIOS[4], "stop").state;
  assert.equal(endedEarly.closed, true);
  assert.equal(evaluate(endedEarly, SCENARIOS[4], "legitimate").coverage, "early");
  const continued = { ...early, turns: 2 };
  assert.equal(evaluate(continued, SCENARIOS[4], "legitimate").coverage, "conversation_only");
  const requestState = {
    ...continued,
    messages: [...continued.messages, {
      actor: "them",
      text: "보안 절차를 위해 이체를 부탁드립니다.",
      actions: [{ kind: "transfer", origin: "sender", target: "은행", task: "보안 이체", id: "2-0", label: "송금하기" }],
    }],
  };
  assert.equal(evaluate(requestState, SCENARIOS[4], "uncertain").coverage, "request_reached");
});

test("phone panel cue is non-accusatory, appears once after interaction and respects reduced motion", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(ui, /next\.turns >= 2/);
  assert.match(ui, /phoneHintShown\.current = true/);
  assert.match(ui, /setPhoneHint\(false\)/);
  assert.match(css, /\.rt-header-more--hint/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(ui, /coverage === "early"/);
});


test("sender-suggested independent safety routes are not handed out as inline answer buttons", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../src/app/api/real-training/route.ts", import.meta.url), "utf8");
  assert.match(route, /const inlineActions = grounded\.filter\(a => a\.kind !== "app"/);
  assert.match(route, /a\.kind === "phone" && a\.origin === "preexisting"/);
  assert.match(route, /buildActions\(inlineActions, state\.turns\)/);
});


test("phone onboarding is explicit at start, optional on later runs and does not reveal a correct route", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  assert.match(ui, /localStorage\.getItem\(INTRO_HIDE_KEY\)/);
  assert.match(ui, /localStorage\.setItem\(INTRO_HIDE_KEY, "1"\)/);
  assert.match(ui, /type="checkbox" checked=\{skipIntroNextTime\}/);
  assert.match(ui, /다음부터 이 안내 보지 않기/);
  assert.match(ui, /오른쪽 위 <strong>휴대전화 아이콘<\/strong>/);
  assert.match(ui, /대화 중간에도 직접 기능을 선택해 보세요/);
  assert.match(ui, /기능을 사용해도 훈련이 바로 끝나지 않아요/);
  assert.match(ui, /if \(introOpen\) return/);
  assert.doesNotMatch(ui, /휴대전화 아이콘.*사칭범/);
});

test("feedback and truth screens put memorable keywords first, preserving optional evidence", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(ui, /fb-impact-hero/);
  assert.match(ui, /fb-keyword--good/);
  assert.match(ui, /fb-keyword--improve/);
  assert.match(ui, /잘한 행동/);
  assert.match(ui, /다음에 기억할 행동/);
  assert.match(ui, /<details className="fb-detail-panel">/);
  assert.match(ui, /feedback\.receipts\.map/);
  assert.match(ui, /feedback\.good\.map/);
  assert.match(ui, /feedback\.improve\.map/);
  assert.match(ui, /fb-truth-word--fraud/);
  assert.match(ui, /어떻게 확인했나요/);
  assert.match(ui, /fb-promise-tile/);
  assert.match(ui, /가족 확인 질문/);
  assert.match(ui, /shareFamilyPromises/);
  assert.match(ui, /result\.coverage === "early"/);
  assert.match(css, /@media \(max-width: 365px\)/);
});
