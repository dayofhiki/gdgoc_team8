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
import { meaningfulRiskRequest } from "../src/lib/trainingDecision.ts";

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
    assert.ok(branches.every(b => [0, 1, 2].includes(b.requestAfterTurns)), scenario.topic);
    assert.ok(branches.some(b => b.requestAfterTurns === 0) && branches.some(b => b.requestAfterTurns === 2), scenario.topic);
    assert.ok(new Set(branches.map(b => b.kind)).size >= 2, scenario.topic);
    assert.ok(branches.length > 4 && branches.slice(4).every(branch => branch.sourceDetail?.length > 20));
    for (const [variant, branch] of branches.entries()) {
      const state = {
        version: 1, scenario: Number(scenario.id.split("-")[0]) * 2 + 1,
        caseVariant: variant, createdAt: Date.now(), turns: branch.requestAfterTurns,
        messages: [{ actor: "them", text: branch.opening }],
        events: [], verification: "none", closed: false,
      };
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
