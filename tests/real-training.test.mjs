import test from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, classifyOffer, classifyOffers, evaluate, normalizeKoreanReply, recordChoice, simulatedLink } from "../src/lib/realTraining.ts";
import { TRAINING_APPS, TRAINING_TOPICS, isPersonalTopic, isTrainingTopicId } from "../src/lib/trainingCatalog.ts";

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
  assert.equal(SCENARIOS.length, TRAINING_TOPICS.length * 2);
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


test("phone outcomes distinguish conclusive evidence, attempted checks and decisive resolution", () => {
  for (const scenario of SCENARIOS) {
    const s = state(SCENARIOS.indexOf(scenario));
    const family = isPersonalTopic(scenario.topic);
    const choice = family ? "family_contact" : "verify";
    const method = family ? "saved_family" : "official_directory";
    const checked = recordChoice(s, scenario, choice, undefined, undefined, method).state;
    assert.equal(checked.closed, scenario.topic === "card" && scenario.identity === "fraud");
    assert.equal(checked.events.length, 1);
    assert.equal(checked.events[0].choice, choice);
    assert.equal(checked.events[0].method, method);
    const missingRecruiter = scenario.identity === "fraud" && ["job", "team_mission"].includes(scenario.topic);
    assert.equal(checked.verification, missingRecruiter ? "none" : scenario.identity === "legitimate" ? "confirmed" : "failed");
    assert.equal(evaluate(checked, scenario, "uncertain").checked, !missingRecruiter);
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
  assert.match(ui, /rt-phone-button--hint/);
  assert.doesNotMatch(ui, /onClick=\{\(\) => void perform\("verify"\)\}/);
  assert.match(panel, /저장된 가족 연락처/);
  assert.match(panel, /최근 문자 발신 번호/);
  assert.match(panel, /TRAINING_APPS\.map/);
  assert.ok(TRAINING_APPS.some(app => app.label === "은행 앱"));
  assert.ok(TRAINING_APPS.some(app => app.label === "택배 앱"));
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
  assert.ok(installed.messages.at(-1).text.includes("택배 앱"));
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
  assert.match(ui, /shouldCuePhonePanel\(text, latestActorReply\)/);
  assert.doesNotMatch(ui, /next\.turns >= 2/);
  assert.match(ui, /phoneHintShown\.current = true/);
  assert.match(ui, /setPhoneHint\(false\)/);
  assert.match(css, /\.rt-phone-button--hint/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(ui, /coverage === "early"/);
});


test("sender-suggested independent safety routes are not handed out as inline answer buttons", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../src/app/api/real-training/route.ts", import.meta.url), "utf8");
  assert.match(route, /const inlineActions = grounded\.filter\(a => a\.origin === "sender" && a\.kind !== "app"/);
  assert.match(route, /buildEpisodeActions\(inlineActions, state\)/);
});


test("phone onboarding is explicit at start, optional on later runs and does not reveal a correct route", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  assert.match(ui, /localStorage\.getItem\(INTRO_HIDE_KEY\)/);
  assert.match(ui, /localStorage\.setItem\(INTRO_HIDE_KEY, "1"\)/);
  assert.match(ui, /type="checkbox" checked=\{skipIntroNextTime\}/);
  assert.match(ui, /다음부터 이 안내 보지 않기/);
  assert.match(ui, /<strong>직접 쓰기<\/strong>/);
  assert.match(ui, /화면 아래에서 연락처, 전화, 앱을 사용할 수 있어요/);
  assert.match(ui, /누르면 바로 보내요/);
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
  assert.match(ui, /이번 가상 연락의 설정 살펴보기/);
  assert.match(ui, /다음 연락에서도 기억할 행동/);
  assert.match(ui, /fb-promise-tile/);
  assert.match(ui, /가족 확인 질문/);
  assert.match(ui, /shareFamilyPractice/);
  assert.match(ui, /result\.coverage === "early"/);
  assert.match(css, /@media \(max-width: 365px\)/);
});


test("mock phone workspace replaces duplicate messages tile with transfer, requiring a sealed actor request", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/TrainingPhonePanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /tile\("transfer", "송금하기 \(가상\)"/);
  assert.doesNotMatch(panel, /tile\("messages"/);
  assert.match(panel, /transferRequests\.length/);
  assert.match(panel, /선택할 송금 요청이 없어요/);
  assert.match(panel, /screen === "transfer_confirm"/);
  assert.match(panel, /onTransfer\(chosenTransfer\)/);
  assert.match(panel, /실제 돈은 이동하지 않습니다/);
  assert.match(panel, /senderPhoneRequests\.map/);
  assert.match(ui, /transferRequests=\{transferRequests\}/);
  assert.match(ui, /onTransfer=\{\(\{ sourceIndex, action \}\) => perform\("comply", sourceIndex, action\.id, undefined, true\)\}/);
  assert.match(ui, /onSenderCall=\{\(\{ sourceIndex, action \}\) => perform\("verify_sender", sourceIndex, action\.id, undefined, true\)\}/);
  assert.match(ui, /!\["transfer", "phone", "app"\]\.includes\(action\.kind\)/);
  assert.match(ui, /action\.kind === "link"/);
  assert.match(ui, /rt-message-request/);
  assert.match(ui, /모의 송금 열기/);
  assert.match(ui, /openActions\("home", \{ sourceIndex: i, action \}\)/);
  assert.match(panel, /initialTransfer \? "transfer_confirm" : initialScreen/);
});

test("transfers from mock phone are permitted only for a genuine bound request and record a risky action", async () => {
  const { buildActions } = await import("../src/lib/trainingActions.ts");
  const scenario = SCENARIOS[1];
  const s = state(1);
  const action = buildActions([{
    kind: "transfer", origin: "sender", target: "자녀", task: "수리비 보내기",
    previewTitle: "", previewDescription: "",
  }], 0)[0];
  s.messages.push({ actor: "them", text: "수리비 보내줄래?", actions: [action] });
  const source = s.messages.length - 1;
  assert.throws(() => recordChoice(s, scenario, "comply"));
  assert.throws(() => recordChoice(s, scenario, "comply", source, "forged"));
  assert.throws(() => recordChoice(s, scenario, "comply", 0, action.id));
  const paid = recordChoice(s, scenario, "comply", source, action.id).state;
  assert.equal(paid.closed, true);
  assert.equal(paid.events.at(-1).sourceIndex, source);
  assert.equal(paid.events.at(-1).actionId, action.id);
  assert.equal(evaluate(paid, scenario, "uncertain").dangerousAction, true);
});

test("sender-provided phone numbers remain actionable in the phone panel without being mistaken for verification", async () => {
  const { buildActions } = await import("../src/lib/trainingActions.ts");
  const scenario = SCENARIOS[5];
  const s = state(5);
  const action = buildActions([{
    kind: "phone", origin: "sender", target: "안내 번호", task: "직접 전화",
    previewTitle: "", previewDescription: "",
  }], 0)[0];
  s.messages.push({ actor: "them", text: "제가 알려 드린 번호로 전화해 주세요.", actions: [action] });
  const source = s.messages.length - 1;
  assert.throws(() => recordChoice(s, scenario, "verify_sender", source, "wrong"));
  const called = recordChoice(s, scenario, "verify_sender", source, action.id).state;
  assert.equal(called.closed, false);
  assert.equal(called.verification, "none");
  assert.equal(evaluate(called, scenario, "uncertain").checked, false);
});


test("phone cue appears when the learner needs a tool, not automatically after a fixed turn count", async () => {
  const { shouldCuePhonePanel } = await import("../src/lib/trainingPhoneCue.ts");
  assert.equal(shouldCuePhonePanel("안녕하세요", { text: "오늘 날씨는 좋네요." }), false);
  assert.equal(shouldCuePhonePanel("알겠어요", { text: "어머니, 안녕히 주무세요." }), false);
  assert.equal(shouldCuePhonePanel("기존 번호로 확인해볼게요", { text: "응, 알겠어." }), true);
  assert.equal(shouldCuePhonePanel("은행 앱에서 확인할래요", { text: "그러세요." }), true);
  assert.equal(shouldCuePhonePanel("어떤 전화번호로 연락할까요?", { text: "그럼요." }), true);
  assert.equal(shouldCuePhonePanel("잘 모르겠어요", { text: "수리비 조금만 송금해 줄 수 있어?" }), true);
  assert.equal(shouldCuePhonePanel("네", { text: "아래 링크를 눌러 주세요." }), true);
  assert.equal(shouldCuePhonePanel("알겠습니다", { text: "배송지 입력을 부탁드려요.", actions: [{kind: "provide_data"}] }), true);
  assert.equal(shouldCuePhonePanel("네", { text: "통화할 필요 없어요", actions: [] }), false);
  assert.equal(shouldCuePhonePanel("보류할게요", { text: "지금 잠시 기다려주세요." }), false);
});

test("the phone cue has no identity input, no spoiler text and stays a single subtle prompt", async () => {
  const { readFileSync } = await import("node:fs");
  const implementation = readFileSync(new URL("../src/lib/trainingPhoneCue.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(ui, /!phoneHintShown\.current && !next\.closed/);
  assert.match(ui, /phoneHintShown\.current = true/);
  assert.match(ui, /shouldCuePhonePanel\(text, latestActorReply\)/);
  assert.doesNotMatch(implementation, /identity|scenario\.identity|truthLabel/);
  assert.match(css, /rt-phone-hint 1\.9s ease-in-out 1/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});


test("verified scam is resolved immediately once a concrete money request has been made", () => {
  const scam = state(1);
  scam.turns = 4;
  scam.messages.push({ actor: "them", text: "일단 80만 원 정도 보내줄 수 있어? 수리비 나오고 남으면 바로 다시 입금해 줄게.", actions: [] });
  const checked = recordChoice(scam, SCENARIOS[1], "family_contact", undefined, undefined, "saved_family").state;
  assert.equal(checked.verification, "failed");
  assert.equal(checked.closed, true);
  assert.equal(checked.endReason, "resolved");
  assert.match(checked.messages.at(-1).text, /문자 대화를 마무리/);
  assert.equal(evaluate(checked, SCENARIOS[1], "uncertain").coverage, "request_reached");
});

test("verification before a meaningful request is still nonterminal, including failed verification", () => {
  const early = recordChoice(state(1), SCENARIOS[1], "family_contact", undefined, undefined, "saved_family").state;
  assert.equal(early.verification, "failed");
  assert.equal(early.closed, false);
  assert.equal(early.endReason, undefined);
  const normal = state(0);
  normal.messages.push({ actor: "them", text: "수리비 좀 보내줄 수 있어?", actions: [] });
  const genuine = recordChoice(normal, SCENARIOS[0], "family_contact", undefined, undefined, "saved_family").state;
  assert.equal(genuine.verification, "confirmed");
  assert.equal(genuine.closed, false); // 정상 연락인 경우 실제 용건을 처리할 여지를 남긴다.
});

test("existing action IDs still allow requested money transfers and terminate after payment", () => {
  const s = state(1);
  const offered = withOffer(s, "transfer", "수리비 80만 원 보내줄래?");
  const paid = recordChoice(offered.state, SCENARIOS[1], "comply", offered.source).state;
  assert.equal(paid.closed, true);
  assert.equal(paid.endReason, "action");
  assert.equal(evaluate(paid, SCENARIOS[1], "uncertain").dangerousAction, true);
});

test("closed verified resolution keeps its explanation visible before the user opens behavior feedback", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /setTimeout\(\(\) => void finish\(/);
  assert.match(ui, /위의 행동 기록을 충분히 읽으신 뒤/);
  assert.doesNotMatch(ui, /session\.endReason === "resolved" && session\.verified/);
  assert.match(ui, /void finish\(\)/);
  assert.match(ui, /내 행동 피드백 보기/);
  assert.match(ui, /"resolved" \| null/);
});


test("all 11 public topics map to private normal/fraud pairs without exposing identity", () => {
  assert.equal(TRAINING_TOPICS.length, 11);
  assert.equal(SCENARIOS.length, TRAINING_TOPICS.length * 2);
  assert.equal(new Set(TRAINING_TOPICS.map(t => t.id)).size, 11);
  for (const [i, topic] of TRAINING_TOPICS.entries()) {
    assert.equal(SCENARIOS[i*2].topic, topic.id);
    assert.equal(SCENARIOS[i*2+1].topic, topic.id);
    assert.equal(SCENARIOS[i*2].identity, "legitimate");
    assert.equal(SCENARIOS[i*2+1].identity, "fraud");
    assert.equal(SCENARIOS[i*2].opening, SCENARIOS[i*2+1].opening);
    assert.ok(topic.description.length > 10);
    assert.ok(isTrainingTopicId(topic.id));
    assert.ok(!("identity" in topic));
  }
  assert.equal(isTrainingTopicId("invalid"), false);
  assert.equal(isTrainingTopicId(0), false);
});

test("personal scenarios use saved contacts; institutional scenarios use independently found official numbers", () => {
  for (const [index, scenario] of SCENARIOS.entries()) {
    const s = state(index);
    const personal = isPersonalTopic(scenario.topic);
    if (personal) {
      assert.throws(() => recordChoice(s, scenario, "verify", undefined, undefined, "official_directory"));
      const result = recordChoice(s, scenario, "family_contact", undefined, undefined, "saved_family").state;
      assert.equal(result.verification, scenario.identity === "fraud" ? "failed" : "confirmed");
      assert.equal(result.closed, false);
    } else {
      const result = recordChoice(s, scenario, "verify", undefined, undefined, "official_directory").state;
      const missingRecruiter = scenario.identity === "fraud" && ["job", "team_mission"].includes(scenario.topic);
      assert.equal(result.verification, missingRecruiter ? "none" : scenario.identity === "fraud" ? "failed" : "confirmed");
      assert.equal(result.closed, scenario.topic === "card" && scenario.identity === "fraud");
      const familyAdvice = recordChoice(s, scenario, "family_contact", undefined, undefined, "saved_family").state;
      assert.equal(familyAdvice.verification, "none");
    }
    if (scenario.topic === "loan" || scenario.topic === "bank") {
      assert.equal(recordChoice(s, scenario, "verify", undefined, undefined, "bank_app").state.closed, false);
    } else {
      assert.throws(() => recordChoice(s, scenario, "verify", undefined, undefined, "bank_app"));
    }
  }
});

test("entry flow separates unannounced real-life practice from focused scenario drills", async () => {
  const { readFileSync } = await import("node:fs");
  const selector = readFileSync(new URL("../src/app/roleplay/select/page.tsx", import.meta.url), "utf8");
  const mode = readFileSync(new URL("../src/app/roleplay/mode/page.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../src/app/home/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/real-training/route.ts", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  assert.match(mode, /문자·채팅 훈련/);
  assert.match(mode, /문자를 주고받고, 휴대전화로 직접 대응해요/);
  assert.match(mode, /연습할 문자 상황을 직접 고르기/);
  assert.doesNotMatch(mode, /사례로 배우기/);
  assert.match(home, /AI 상황극/);
  assert.match(home, /OX 퀴즈/);
  assert.doesNotMatch(home, /AI 전화 대응 훈련|문자·채팅 대응 훈련/);
  assert.match(mode, /path: "\/roleplay\/chat"/);
  assert.match(mode, /path: "\/roleplay\/phone"/);
  assert.match(selector, /상황별 연습/);
  assert.doesNotMatch(selector, /추천 상황으로 바로 시작|무작위|진짜인지는/);
  assert.match(selector, /TRAINING_TOPICS\.filter/);
  assert.match(selector, /\/roleplay\/chat\?topic=/);
  assert.match(mode, /\/roleplay\/select/);
  assert.match(chat, /new URLSearchParams\(window\.location\.search\)\.get\("topic"\)/);
  assert.match(chat, /router\.replace\("\/home"\)\}>홈으로<\/button>/);
  assert.match(chat, /다음 실전 훈련/);
  assert.match(chat, /다른 상황 고르기/);
  assert.match(route, /if \(body\.topic !== undefined && !isTrainingTopicId\(body\.topic\)\)/);
  assert.match(route, /topicIndex \* 2 \+ 1/);
  assert.match(route, /topic: scenario\.topic/);
});

test("training feedback uses concrete verb-first reminders instead of cryptic nouns", () => {
  const example = state(3);
  example.events.push({ choice: "share", verifiedBefore: false, turn: 1 });
  example.events.push({ choice: "open_link", verifiedBefore: false, turn: 1 });
  const summary = evaluate(example, SCENARIOS[3], "uncertain").behavior;
  assert.ok(summary.improve.every(p => /세요$/.test(p.keyword)), summary.improve.map(x=>x.keyword).join(", "));
  assert.ok(summary.improve.some(p => p.keyword.includes("개인정보를 보내기 전에")));
  assert.ok(summary.improve.some(p => p.keyword.includes("문자 속 링크를")));
  assert.ok(summary.promises.every(p => /기$/.test(p.title)));
  assert.ok(summary.receipts.some(r => r.label === "모의 정보 전송"));
});


test("action-first interface avoids identity-guessing quiz and prioritizes practical decisions", async () => {
  const { readFileSync } = await import("node:fs");
  const chat = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../src/app/home/page.tsx", import.meta.url), "utf8");
  const intro = readFileSync(new URL("../src/app/roleplay/page.tsx", import.meta.url), "utf8");
  const mode = readFileSync(new URL("../src/app/roleplay/mode/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(chat, /setPhase\("judge"\)|phase === "judge"|role="radiogroup" aria-label="상대방 정체 판단"/);
  assert.match(chat, /guess: "uncertain"/);
  assert.match(chat, /이번 대화가 마무리됐어요/);
  assert.match(chat, /내 행동 피드백 보기/);
  assert.match(chat, /안전 약속 확인하기/);
  assert.match(chat, /이번 가상 연락의 설정 살펴보기/);
  assert.ok(chat.indexOf("다음 연락에서도 기억할 행동") < chat.indexOf("이번 가상 연락의 설정 살펴보기"));
  assert.doesNotMatch(chat, /정체와 안전 약속 확인하기|정체를 몰라도 괜찮아요/);
  assert.doesNotMatch(home, /진짜 가족일까요/);
  assert.match(home, /추천 훈련 시작하기/);
  assert.match(home, /href="\/practice"/);
  assert.doesNotMatch(intro, /진짜 연락과 사칭 시도가 섞여/);
  assert.match(intro, /어떤 연락이 오더라도 안전하게 대응하는 연습/);
  assert.match(mode, /위험한 요구에 직접 대응하고/);
});


test("back navigation respects the selected mode while preserving the no-identity-quiz flow", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  assert.match(ui, /liveEntry \? "\/roleplay\/mode" : "\/roleplay\/select"/);
  assert.match(ui, /start\(randomTrainingTopic\(result.topic\).id\)/);
  assert.doesNotMatch(ui, /aria-label="내 휴대전화 기능 열기"/);
  assert.match(ui, /onClick=\{\(\) => void finish\(\)\}/);
  assert.doesNotMatch(ui, /setPhase\("judge"\)/);
});


test("risk-focused training avoids routine safe notices and samples one wrong-action scenario for each topic", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../src/app/api/real-training/route.ts", import.meta.url), "utf8");
  const { SCENARIO_DECISIONS } = await import("../src/lib/trainingDecision.ts");
  assert.deepEqual(Object.keys(SCENARIO_DECISIONS).sort(), TRAINING_TOPICS.map(t => t.id).sort());
  assert.match(route, /const index = topicIndex \* 2 \+ 1/);
  assert.doesNotMatch(route, /const index = topicIndex \* 2 \+ randomInt\(2\)/);
  for (const [i, topic] of TRAINING_TOPICS.entries()) {
    assert.equal(SCENARIOS[i*2+1].topic, topic.id);
    assert.equal(SCENARIOS[i*2+1].identity, "fraud");
    assert.ok(SCENARIO_DECISIONS[topic.id].length > 45);
  }
});

test("bank transaction facts are fictional and specific enough to answer 'what transaction?'", async () => {
  const { CASE_VARIANTS, caseDetail } = await import("../src/lib/trainingCaseFacts.ts");
  const { bankAnswerIsConcrete, bankQuestionNeedsSpecifics, replyQualityIssue,
    meaningfulRiskRequest, riskDecisionDue } = await import("../src/lib/trainingDecision.ts");
  const bank = SCENARIOS[5];
  assert.equal(bank.topic, "bank");
  assert.equal(bank.identity, "fraud");
  for (let i = 0; i < CASE_VARIANTS[2].length; i++) {
    assert.match(caseDetail(bank, i), /(?:모바일 상품권|정기결제|간편결제)/);
    assert.match(caseDetail(bank, i), /\d+만 원/);
    assert.doesNotMatch(caseDetail(bank, i), /(?:010[- ]\d{4}|https?:\/\/)/);
  }
  assert.equal(bankQuestionNeedsSpecifics("무슨 거래인데요?"), true);
  assert.equal(bankQuestionNeedsSpecifics("어떤 결제예요?"), true);
  assert.equal(bankQuestionNeedsSpecifics("그게 왜 그런가요?"), false);
  assert.equal(bankAnswerIsConcrete("본인이 진행하신 거래가 맞는지 확인 부탁드립니다."), false);
  assert.equal(bankAnswerIsConcrete("모바일 상품권 48만 원 결제 시도 관련입니다."), true);
  const s = state(5);
  const introIssue = replyQualityIssue(bank, s, "무슨 거래인데요?",
    "이상 거래 건입니다. 직접 확인 부탁드립니다.", []);
  assert.match(introIssue, /거래 유형과 금액/);
  assert.equal(replyQualityIssue(bank, s, "무슨 거래인데요?",
    "모바일 상품권 48만 원 결제 시도가 있었다는 연락입니다.", []), undefined);
  s.turns = 2;
  assert.equal(riskDecisionDue(s, bank, "제가 한 거래가 아닌데요."), false);
  s.turns = 3;
  assert.equal(riskDecisionDue(s, bank, "제가 한 거래가 아닌데요."), true);
  assert.match(replyQualityIssue(bank, s, "제가 한 거래가 아닌데요.",
    "본인 거래가 맞는지 확인 부탁드립니다.", []), /잘못된 요청/);
  const request = "피해 확인을 위해 계좌 잔액과 계좌번호 끝 4자리를 알려주실 수 있을까요?";
  const proposals = [{ kind: "provide_data", origin: "sender", target: "계좌 정보", task: "정보 제출",
    previewTitle: "", previewDescription: "" }];
  assert.equal(meaningfulRiskRequest(request, proposals), true);
  assert.equal(replyQualityIssue(bank, s, "제가 한 거래가 아닌데요.", request, proposals), undefined);
  assert.equal(meaningfulRiskRequest(request, []), false);
  assert.equal(meaningfulRiskRequest("본인 확인 부탁드립니다.", proposals), false);
  assert.match(replyQualityIssue(bank, s, "제가 한 거래가 아닌데요.",
    "모의 훈련에서 계좌 잔액을 알려주세요.", proposals), /실제 문자 상대/);
  assert.equal(riskDecisionDue({ ...s, messages: [...s.messages, { actor: "them", text: request }] },
    bank, "네"), false);
});

test("phone affordance is gently highlighted when actor requests confirmation without a structured action", async () => {
  const { shouldCuePhonePanel } = await import("../src/lib/trainingPhoneCue.ts");
  const samples = [
    "본인이 직접 진행하신 거래가 맞는지 확인 부탁드립니다.",
    "계좌 이용 여부를 확인해 주세요.",
    "거래 내용을 확인 부탁드립니다.",
    "사용 중인 계좌 잔액과 끝 4자리를 알려주실 수 있을까요?",
  ];
  for (const reply of samples) {
    assert.equal(shouldCuePhonePanel("무슨 거래인가요?", { text: reply, actions: [] }), true, reply);
  }
  assert.equal(shouldCuePhonePanel("안녕하세요", { text: "고객님께 연락드렸습니다.", actions: [] }), false);
  assert.equal(shouldCuePhonePanel("네", { text: "잠시만 기다려 주세요.", actions: [] }), false);
});

test("AI cannot silently replace an actionable fraud choice with an official app reminder", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../src/app/api/real-training/route.ts", import.meta.url), "utf8");
  assert.match(route, /replyQualityIssue\(scenario, state, text, reply, first\.value\.actions\)/);
  assert.match(route, /INCOMPLETE_TRAINING_DECISION/);
  assert.match(route, /branch\.incident/);
});

test("a bank app lookup is inconclusive but the independent callback can resolve the same request", () => {
  const scenario = SCENARIOS[5];
  const { state: s } = withOffer(state(5), "share", "잔액을 알려주세요.");
  const app = recordChoice(s, scenario, "verify", undefined, undefined, "bank_app");
  assert.equal(app.state.verification, "none");
  assert.equal(app.state.closed, false);
  assert.equal(app.state.events[0].evidence, "inconclusive");
  assert.match(app.notice, /은행 앱/);
  assert.doesNotMatch(app.notice, /대표번호/);
  assert.equal(evaluate(app.state, scenario, "uncertain").checked, false);
  const official = recordChoice(app.state, scenario, "verify", undefined, undefined, "official_directory");
  assert.equal(official.state.closed, true);
  assert.match(official.notice, /대표번호/);
  assert.equal(evaluate(official.state, scenario, "uncertain").checked, true);
});

test("reply examples keep hidden facts out of the conversation and leave prevention actions to the learner", async () => {
  const { trainingReplyExamples } = await import("../src/lib/trainingReplyExamples.ts");
  const invite = [{ actor: "them", text: "전해 드릴 소식이 있어요." }];
  assert.ok(trainingReplyExamples("invitation", invite).every(text => !text.includes("결혼")));
  assert.ok(trainingReplyExamples("invitation", [...invite, { actor: "them", text: "결혼하게 됐어요." }]).some(text => text.includes("결혼")));
  const request = [{ actor: "them", text: "상품대금을 먼저 입금해 주세요.", actions: [{ kind: "transfer", origin: "sender" }] }];
  const examples = trainingReplyExamples("team_mission", request);
  assert.equal(examples.length, 2);
  assert.ok(examples.includes("잠깐 생각해 볼게요."));
  assert.ok(!trainingReplyExamples("team_mission", [...request, { actor: "me", text: examples[0] }]).includes(examples[0]));
  const stoppedEarly = recordChoice(state(1), SCENARIOS[1], "stop").state;
  assert.equal(evaluate(stoppedEarly, SCENARIOS[1], "uncertain").behavior.tone, "neutral");
});

test("random training continues in a different topic", async () => {
  const { randomTrainingTopic } = await import("../src/lib/trainingCatalog.ts");
  for (const topic of TRAINING_TOPICS) assert.notEqual(randomTrainingTopic(topic.id).id, topic.id);
});
