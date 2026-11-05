import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUIZ, quizCategory, pickQuiz } from "../src/lib/quiz.ts";
import { CASE_STORIES } from "../src/lib/caseStories.ts";
import { CASE_VARIANT_COUNT, caseBranch } from "../src/lib/trainingCaseFacts.ts";
import { TRAINING_TOPICS } from "../src/lib/trainingCatalog.ts";
import { SCENARIOS } from "../src/lib/realTraining.ts";
import { fallbackTrainingTurn } from "../src/lib/trainingFallback.ts";

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

test("case records have verifiable sources and offer meaningful rewind actions", () => {
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
  assert.match(page, /사건 되감기/);
  assert.match(page, /기관 원문 자료 확인하기/);
  assert.doesNotMatch(page, /setTimeout/); // seniors must advance at their own pace
});

test("all eleven chat topics have three different anchored real-life risk branches", () => {
  assert.equal(TRAINING_TOPICS.length, 11);
  assert.equal(CASE_VARIANT_COUNT, 3);
  for (const scenario of SCENARIOS.filter(s => s.identity === "fraud")) {
    const branches = Array.from({ length: CASE_VARIANT_COUNT }, (_, n) => caseBranch(scenario, n));
    assert.equal(new Set(branches.map(b => b.opening)).size, 3, scenario.topic);
    assert.equal(new Set(branches.map(b => b.request)).size, 3, scenario.topic);
    assert.ok(branches.every(b => b.context.length > 12 && b.request.length > 15), scenario.topic);
    if (scenario.topic === "card") assert.ok(branches.every(b => b.kind === "phone"));
    if (scenario.topic === "team_mission") assert.ok(branches.every(b => b.kind === "transfer"));
    if (!["card","team_mission"].includes(scenario.topic)) {
      assert.ok(new Set(branches.map(b => b.kind)).size >= 2, scenario.topic);
    }
    for (const [variant, branch] of branches.entries()) {
      const state = {
        version: 1, scenario: Number(scenario.id.split("-")[0]) * 2 + 1,
        caseVariant: variant, createdAt: Date.now(), turns: 1,
        messages: [{ actor: "them", text: branch.opening }],
        events: [], verification: "none", closed: false,
      };
      const turn = fallbackTrainingTurn(state, scenario, "네, 설명해 주세요.");
      assert.ok(turn.reply.includes(branch.request), scenario.topic + "/" + variant);
      assert.equal(turn.actions[0]?.kind, branch.kind, scenario.topic + "/" + variant);
      assert.equal(turn.actions[0]?.origin, "sender");
    }
  }
});

test("the chat API fixes a branch in the sealed state and prevents action drift", () => {
  const api = readFileSync(new URL("../src/app/api/real-training/route.ts", import.meta.url), "utf8");
  const decision = readFileSync(new URL("../src/lib/trainingDecision.ts", import.meta.url), "utf8");
  assert.match(api, /caseVariant = nextCaseVariant/);
  assert.match(api, /version: 1, scenario: index, caseVariant/);
  assert.match(api, /caseBranch\(scenario, state\.caseVariant \?\? 0\)/);
  assert.match(decision, /expected\.kind/);
});
