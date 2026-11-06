import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUIZ, quizCategory, pickQuiz } from "../src/lib/quiz.ts";
import { CASE_STORIES } from "../src/lib/caseStories.ts";
import { CASE_EXPERIENCES } from "../src/lib/caseExperience.ts";
import { caseVariantCount, caseBranch } from "../src/lib/trainingCaseFacts.ts";
import { TRAINING_TOPICS } from "../src/lib/trainingCatalog.ts";
import { SCENARIOS } from "../src/lib/realTraining.ts";
import { fallbackTrainingTurn } from "../src/lib/trainingFallback.ts";
import { isActionableReply, meaningfulRiskRequest, replyQualityIssue } from "../src/lib/trainingDecision.ts";

test("OX uses 50 unique source-authored questions and a balanced ten-question session", () => {
  assert.equal(QUIZ.length, 50);
  assert.equal(new Set(QUIZ.map(q => q.id)).size, 50);
  assert.equal(new Set(QUIZ.map(q => q.question)).size, 50);
  for (let seed = 0; seed < 100; seed++) {
    const round = pickQuiz(undefined, seed);
    assert.equal(round.length, 10);
    assert.equal(new Set(round.map(q => q.id)).size, 10);
    assert.equal(round.filter(q => q.answer === "O").length, 5);
    assert.equal(round.filter(q => q.answer === "X").length, 5);
    for (const category of ["family", "links", "money", "authority", "response"]) {
      assert.equal(round.filter(q => quizCategory(q) === category).length, 2, category);
    }
  }
  assert.notDeepEqual(pickQuiz(undefined, 1).map(q => q.id), pickQuiz(undefined, 2).map(q => q.id));
});

test("OX supports targeted retry and gives preference to prior mistakes", () => {
  assert.deepEqual(pickQuiz(["q3", "q1"]).map(q => q.id), ["q3", "q1"]);
  const weak = "q11";
  for (let seed = 0; seed < 12; seed++) {
    assert.ok(pickQuiz(undefined, seed, [weak], []).some(q => q.id === weak));
  }
});

test("case records have verifiable sources and offer a forward comparison of actions", () => {
  assert.ok(CASE_STORIES.length >= 6);
  assert.equal(new Set(CASE_STORIES.map(story => story.id)).size, CASE_STORIES.length);
  for (const story of CASE_STORIES) {
    assert.ok(story.sourceUrl.startsWith("https://"));
    assert.ok(story.sourceFact.length > 30);
    assert.ok(story.lesson.length > 15);
    assert.ok(story.actual.length > 20);
    assert.ok(story.events.length >= 4);
    assert.ok(story.checkpoint > 0 && story.checkpoint < story.events.length);
    assert.ok(story.actions.length >= 3);
    assert.ok(story.actions.some(a => a.safe) && story.actions.some(a => !a.safe));
    assert.ok(TRAINING_TOPICS.some(t => t.id === story.topic));
    assert.ok(story.actions.every(a => a.effect.length > 20 && a.followUp.length > 10));
  }
  const page = readFileSync(new URL("../src/app/roleplay/case/page.tsx", import.meta.url), "utf8");
  assert.match(page, /선택할 순간/);
  assert.match(page, /기관 원문 자료 확인하기/);
  assert.doesNotMatch(page, /setTimeout/); // seniors must advance at their own pace
  assert.doesNotMatch(page, /실전에서 연습|실전 연습|\/roleplay\/chat\?topic=/);
  assert.match(page, /case-play-device/);
  assert.match(page, /case-play-action-option/);
  assert.match(page, /다른 대응과 비교/);
  assert.match(page, /내가 고른 행동/);
  assert.doesNotMatch(page, /다른 행동 해보기|setPhase\("retry"\)/);
  const invitation = CASE_STORIES.find(item => item.id === "invitation");
  assert.deepEqual(invitation.events.slice(0, 3).map(event => event.surface), [undefined, "notice", "page"]);
  assert.match(invitation.events[1].text, /링크를 열어 봤어요/);
  assert.match(page, /<details className="case-play-sources">/);
  assert.match(page, /setPhase\("outcome"\)/);
  assert.match(page, /case-play-my-route/);
  assert.deepEqual(Object.keys(CASE_EXPERIENCES).sort(), CASE_STORIES.map(story => story.id).sort());
  for (const story of CASE_STORIES) {
    const experience = CASE_EXPERIENCES[story.id];
    assert.equal(experience.actions.length, story.actions.length, story.id);
    assert.equal(experience.riskPath.length, 3, story.id);
    for (const action of experience.actions) {
      assert.ok(action.label.length > 4 && action.label.length < 26);
      assert.ok(action.outcome.length > 15 && action.outcome.length < 105);
    }
  }
});

test("eleven topics contain fifty-six genuinely different case premises and bounded pacing", () => {
  assert.equal(TRAINING_TOPICS.length, 11);
  const all = [];
  for (const scenario of SCENARIOS.filter(s => s.identity === "fraud")) {
    const branches = Array.from({ length: caseVariantCount(scenario) }, (_, n) => caseBranch(scenario, n));
    assert.equal(new Set(branches.map(b => b.incident)).size, branches.length, scenario.topic);
    assert.equal(new Set(branches.map(b => b.opening)).size, branches.length, scenario.topic);
    assert.equal(new Set(branches.map(b => b.request)).size, branches.length, scenario.topic);
    assert.ok(branches.every(b => b.context.length > 12 && b.request.length > 15), scenario.topic);
    assert.ok(branches.every(b => b.facts.length > 30 && b.sourceUrl.startsWith("https://")));
    assert.ok(branches.every(b => [1, 2, 3].includes(b.requestAfterTurns)), scenario.topic);
    assert.ok(branches.some(b => b.requestAfterTurns === 1) && branches.some(b => b.requestAfterTurns === 3), scenario.topic);
    assert.ok(new Set(branches.map(b => b.kind)).size >= 2, scenario.topic);
    assert.ok(branches.length > 4 && branches.slice(4).every(branch => branch.sourceDetail?.length > 20));
    for (const [variant, branch] of branches.entries()) {
      const state = {
        version: 1, scenario: Number(scenario.id.split("-")[0]) * 2 + 1,
        caseVariant: variant, createdAt: Date.now(), turns: 0,
        messages: [{ actor: "them", text: branch.opening }],
        events: [], verification: "none", closed: false,
      };
      const scenes = new Set();
      for (; state.turns < branch.requestAfterTurns; state.turns++) {
        const lead = fallbackTrainingTurn(state, scenario, "네, 설명해 주세요.");
        assert.equal(isActionableReply(lead.reply, lead.actions), false, branch.id + ": " + lead.reply);
        assert.ok(!scenes.has(lead.reply), branch.id);
        scenes.add(lead.reply);
        state.messages.push({ actor: "me", text: "네, 설명해 주세요." }, { actor: "them", text: lead.reply });
      }
      const objection = "이거 사기 아니에요?";
      const response = fallbackTrainingTurn(state, scenario, objection);
      assert.equal(isActionableReply(response.reply, response.actions), false, branch.id);
      assert.ok(!scenes.has(response.reply), branch.id);
      const earlyOffer = [{ kind: branch.kind, origin: "sender", target: branch.target, task: branch.task, previewTitle: "", previewDescription: "" }];
      assert.match(replyQualityIssue(scenario, state, objection, branch.request, earlyOffer), /아직/);
      state.messages.push({ actor: "me", text: objection }, { actor: "them", text: response.reply });
      state.turns++;
      const turn = fallbackTrainingTurn(state, scenario, "네, 설명해 주세요.");
      assert.ok(turn.reply.includes(branch.request), scenario.topic + "/" + variant);
      assert.equal(turn.actions[0]?.kind, branch.kind, scenario.topic + "/" + variant);
      assert.equal(turn.actions[0]?.origin, "sender");
      assert.ok(meaningfulRiskRequest(turn.reply, turn.actions), scenario.topic + "/" + variant);
      assert.ok(branch.alternateOpening.length >= 10);
      all.push(branch.id);
    }
  }
  assert.equal(all.length, 56);
  assert.equal(new Set(all).size, 56);
});

test("the chat API fixes a branch in the sealed state and prevents action drift", () => {
  const api = readFileSync(new URL("../src/app/api/real-training/route.ts", import.meta.url), "utf8");
  const decision = readFileSync(new URL("../src/lib/trainingDecision.ts", import.meta.url), "utf8");
  assert.match(api, /caseVariant = nextCaseVariant/);
  assert.match(api, /recentByTopic\[scenario\.topic\]/);
  assert.match(api, /version: 1, scenario: index, caseVariant/);
  assert.match(api, /caseBranch\(scenario, state\.caseVariant \?\? 0\)/);
  assert.match(decision, /expected\.kind/);
});

test("quiz and family code shares target distinct pages, with a public link from local preview", async () => {
  const { familyCodeUrl, quizInviteUrl } = await import("../src/lib/share.ts");
  const quiz = new URL(quizInviteUrl("http://192.168.0.3:3000", "테스트 가족", "invite-token"));
  assert.equal(quiz.origin, "https://team8.gdgoc-devfest.org");
  assert.equal(quiz.pathname, "/challenge");
  assert.equal(quiz.searchParams.get("from"), "테스트 가족");
  assert.equal(quiz.searchParams.get("invite"), "invite-token");

  const code = new URL(familyCodeUrl("https://team8.gdgoc-devfest.org", "encrypted-token"));
  assert.equal(code.pathname, "/family-code/shared");
  assert.equal(code.search, "");
  assert.equal(new URLSearchParams(code.hash.slice(1)).get("code"), "encrypted-token");
});

test("device sharing distinguishes cancelling from an unavailable share sheet and never copies", async () => {
  const { shareWithDevice } = await import("../src/lib/share.ts");
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let payload;
  const set = share => Object.defineProperty(globalThis, "navigator", { configurable: true, value: { share } });
  try {
    const data = { title: "미끼주의보", text: "초대 문구", url: "https://example.com/challenge" };
    set(value => { payload = value; });
    assert.equal(await shareWithDevice(data), "shared");
    assert.deepEqual(payload, data);
    set(() => { throw new DOMException("cancelled", "AbortError"); });
    assert.equal(await shareWithDevice(data), "cancelled");
    set(() => { throw new DOMException("blocked", "NotAllowedError"); });
    assert.equal(await shareWithDevice(data), "unavailable");
    set(undefined);
    assert.equal(await shareWithDevice(data), "unavailable");
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }
});

test("family codes are encrypted, reject tampering and expire before saving, then stay bound to the saving account", async () => {
  const { normalizeFamilyCode, openFamilyCode, sealFamilyCode } = await import("../src/server/familyCodeSeal.ts");
  const secret = "test-family-code-secret";
  const code = { question: "우리 집 별명은?", answer: "테스트 답" };
  assert.deepEqual(normalizeFamilyCode({ question: " 우리 집 별명은? ", answer: "테스트 답" }), code);
  assert.equal(normalizeFamilyCode({ question: "질문", answer: "" }), null);
  assert.equal(normalizeFamilyCode({ question: "질문", answer: "a".repeat(21) }), null);
  const payload = { type: "share", code, invite: "a".repeat(64), expiresAt: 2000 };
  const token = sealFamilyCode(payload, secret);
  assert.doesNotMatch(Buffer.from(token, "base64url").toString(), /테스트 답|우리 집 별명/);
  assert.notEqual(sealFamilyCode(payload, secret), token);
  assert.deepEqual(openFamilyCode(token, secret, "recipient", 1999), payload);
  assert.equal(openFamilyCode(token, secret, "recipient", 2000), null);
  const raw = Buffer.from(token, "base64url");
  raw[raw.length - 1] ^= 1;
  assert.equal(openFamilyCode(raw.toString("base64url"), secret, "recipient", 1999), null);

  const saved = sealFamilyCode({ type: "saved", code, owner: "recipient" }, secret);
  assert.deepEqual(openFamilyCode(saved, secret, "recipient", 999999)?.code, code);
  assert.equal(openFamilyCode(saved, secret, "other-account", 999999), null);
});

test("exported Figma refresh keeps chat actions live while adding large-print and memory card", () => {
  const chat = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  const mode = readFileSync(new URL("../src/app/roleplay/mode/page.tsx", import.meta.url), "utf8");
  const quiz = readFileSync(new URL("../src/components/QuizRunner.tsx", import.meta.url), "utf8");
  const phone = readFileSync(new URL("../src/components/TrainingPhonePanel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(mode, /role="radiogroup"/);
  assert.match(mode, /"\/roleplay\/chat"/);
  assert.match(mode, /"\/roleplay\/select"/);
  assert.match(mode, /채팅 훈련 시작하기/);
  assert.match(chat, /figma-chat-reply-heading/);
  assert.match(chat, /글자 크게 보기/);
  assert.match(chat, /figma-font-dialog/);
  assert.match(chat, /figma-flashcard/);
  assert.match(chat, /caseVariant/);
  assert.match(chat, /<TrainingPhonePanel/);
  assert.match(chat, /void send\(text\)/);
  assert.match(chat, /void perform\("stop"\)/);
  assert.match(chat, /void shareFamilyPractice\(false\)/);
  assert.match(phone, /onTransfer/);
  assert.match(phone, /onSenderCall/);
  assert.match(quiz, /figma-quiz-result/);
  assert.match(quiz, /틀린 문제 다시 풀기/);
  assert.match(quiz, /wrong\.length \? retry : nextSet/);
  for (const selector of [".figma-mode", ".figma-chat", ".figma-font-dialog",
    ".figma-flashcard", ".figma-quiz-result", ".rt-device-grid"]) assert.ok(css.includes(selector));
});
