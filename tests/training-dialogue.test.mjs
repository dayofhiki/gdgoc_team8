import test from "node:test";
import assert from "node:assert/strict";
import {
  CASE_GUIDES, DIALOGUE_SCHEMA, DIALOGUE_POLICY, INITIAL_DIALOGUE,
  caseGuide, actorBrief, parseDialogueOutput, replySimilarity, decideDialogueTurn,
} from "../src/lib/trainingDialogue.ts";
import { SCENARIOS, evaluate } from "../src/lib/realTraining.ts";
import { buildActions } from "../src/lib/trainingActions.ts";

const base = {
  stage: "closing",
  learnerMove: "acknowledge",
  speakerMove: "close",
  hasPendingRequest: false,
  conversationComplete: true,
  summary: "서로 마지막 인사를 나누고 다음 연락을 기약함",
};
const signal = (patch = {}) => ({ ...base, ...patch });
const decide = (patch = {}) => decideDialogueTurn({
  memory: INITIAL_DIALOGUE,
  primary: signal(),
  audit: signal(),
  reply: "나중에 다시 연락할게.",
  actions: [],
  nextTurn: 3, maxTurns: 8,
  ...patch,
});
const proposed = (kind, target = "") => ({
  kind, origin: "sender", target, task: "알려주기", previewTitle: "", previewDescription: "",
});

test("all 6 normal/fraud pairs reuse three grounded, distinct case guides", () => {
  assert.equal(SCENARIOS.length, 6);
  assert.deepEqual(Object.keys(CASE_GUIDES).sort(), ["0", "1", "2"]);
  for (const s of SCENARIOS) {
    assert.ok(caseGuide(s).length > 80);
    assert.ok(CASE_GUIDES[s.id.split("-")[0]].source.every(u => u.startsWith("https://")));
    assert.ok(caseGuide(s).includes("상황:"));
  }
  assert.notEqual(caseGuide(SCENARIOS[0]), caseGuide(SCENARIOS[1]));
  assert.ok(DIALOGUE_POLICY.includes("반복"));
});


test("each case keeps one shared first message but gives the actor distinct facts, voice and objective", () => {
  assert.equal(SCENARIOS.length, 6);
  for (let i = 0; i < SCENARIOS.length; i += 2) {
    const genuine = SCENARIOS[i], impersonation = SCENARIOS[i + 1];
    assert.equal(genuine.opening, impersonation.opening);
    for (const s of [genuine, impersonation]) {
      for (const key of ["voice", "situation", "progression", "responseRules", "objective"]) {
        assert.ok(s[key].length > 35, s.id + " missing " + key);
      }
      const brief = actorBrief(s, INITIAL_DIALOGUE, 0);
      assert.ok(brief.includes(s.voice));
      assert.ok(brief.includes(s.situation));
      assert.ok(brief.includes(s.objective));
      assert.ok(brief.includes("직전"));
      assert.ok(brief.includes("변경 금지"));
    }
    assert.notEqual(genuine.objective, impersonation.objective);
    assert.notEqual(actorBrief(genuine, INITIAL_DIALOGUE, 0), actorBrief(impersonation, INITIAL_DIALOGUE, 0));
  }
});

test("actor guidance adapts to the conversation stage without inventing a new case", () => {
  const s = SCENARIOS[1];
  const early = actorBrief(s, INITIAL_DIALOGUE, 0);
  const asked = actorBrief(s, { ...INITIAL_DIALOGUE, stage: "request" }, 3);
  const closing = actorBrief(s, { ...INITIAL_DIALOGUE, stage: "closing" }, 4);
  assert.match(early, /대화를 막 시작/);
  assert.match(asked, /동일한 요구를 되풀이하지 않는다/);
  assert.match(closing, /새로운 사건을 만들지 말고/);
  assert.match(asked, /사용자가 보낸 답장 횟수: 3/);
  assert.ok(DIALOGUE_POLICY.includes("사용자의 질문"));
});

test("conversation JSON schema validates natural user intent and speaker move", () => {
  assert.deepEqual(DIALOGUE_SCHEMA.required, ["reply", "actions", "dialogue"]);
  const parsed = parseDialogueOutput(JSON.stringify({
    reply: "응, 원래 번호로 나중에 연락할게.",
    actions: [],
    dialogue: signal(),
  }));
  assert.equal(parsed.dialogue.conversationComplete, true);
  assert.equal(parsed.actions.length, 0);
  assert.throws(() => parseDialogueOutput(JSON.stringify({
    reply: "", actions: [], dialogue: signal({ conversationComplete: false }),
  })), /EMPTY_NONTERMINAL/);
  const blank = parseDialogueOutput(JSON.stringify({
    reply: "", actions: [], dialogue: signal({ speakerMove: "none" }),
  }));
  assert.equal(blank.reply, "");
  assert.throws(() => parseDialogueOutput(JSON.stringify({
    reply: "네", actions: [], dialogue: signal({ learnerMove: "tampered" }),
  })), /INVALID_DIALOGUE_SCHEMA/);
});

test("one good-bye line on the first turn must not end the training", () => {
  assert.equal(decide({nextTurn:1}).closed, false);
});

test("both models must agree the real conversation is finished", () => {
  assert.deepEqual(decide().reason, "natural");
  const hallucinated = decide({audit:signal({ conversationComplete:false })});
  assert.equal(hallucinated.closed, false);
  const auditorPending = decide({audit: signal({hasPendingRequest:true})});
  assert.equal(auditorPending.closed, false);
  const missingAudit = decide({audit: undefined});
  assert.equal(missingAudit.closed, false);
});

test("learner's question overrides a premature actor good-bye", () => {
  assert.equal(decide({primary:signal({learnerMove:"question"})}).closed,false);
  assert.equal(decide({audit:signal({learnerMove:"question"})}).closed,false);
});

test("an unfinished request or a clickable money/link action blocks natural ending", () => {
  assert.equal(decide({primary:signal({hasPendingRequest:true})}).closed,false);
  assert.equal(decide({primary:signal({speakerMove:"ask"})}).closed,false);
  const money = buildActions([proposed("transfer", "금액")],1);
  const link = buildActions([proposed("link", "주소")],1);
  assert.equal(decide({actions:money}).closed,false);
  assert.equal(decide({actions:link}).closed,false);
  const app = buildActions([{kind:"app",origin:"installed",target:"은행",task:"조회",previewTitle:"",previewDescription:""}],1);
  assert.equal(decide({actions:app}).closed,false); // user must be able to click the legitimate app offer.
});

test("neutral acknowledgment after a goodbye can end without inventing another AI reply", () => {
  const output = parseDialogueOutput(JSON.stringify({
    reply:"", actions:[], dialogue:signal({speakerMove:"none"}),
  }));
  const completion = decide({primary:output.dialogue,audit:signal({speakerMove:"none"}),reply:"",nextTurn:4});
  assert.equal(completion.closed,true);
  assert.equal(completion.reason,"natural");
});

test("consecutive near-duplicate replies are detected without keyword lists", () => {
  assert.ok(replySimilarity("원래 번호로 나중에 연락할게, 엄마.", "원래 번호로 나중에 연락할게 엄마.") >= .78);
  assert.ok(replySimilarity("무슨 거래인가요?", "등기우편에 서명을 부탁드립니다.") < .5);
  const mem1=decide({
    memory:{ ...INITIAL_DIALOGUE, lastReply:"원래 번호로 연락할게.",repeatCount:0 },
    primary:signal({conversationComplete:false}),
    audit:signal({conversationComplete:false}),
    reply:"원래 번호로 연락할게.",
    nextTurn:3,
  });
  const mem2=decide({
    memory:mem1.memory, primary:signal({conversationComplete:false}),audit:signal({conversationComplete:false}),
    reply:"원래 번호로 연락할게.",nextTurn:4,
  });
  assert.equal(mem2.closed,true);
  assert.equal(mem2.reason,"natural");
  assert.ok(mem2.issues.includes("repetition_stopped"));
  const pending=decide({
    memory:mem1.memory,
    primary:signal({conversationComplete:false,hasPendingRequest:true}),
    audit:signal({conversationComplete:false,hasPendingRequest:true}),
    reply:"원래 번호로 연락할게.",nextTurn:4,
  });
  assert.equal(pending.closed,false);
});

test("hard turn limit closes even when an active request remains", () => {
  const limited=decide({
    primary:signal({speakerMove:"ask",hasPendingRequest:true,conversationComplete:false,learnerMove:"question"}),
    audit:signal({speakerMove:"ask",hasPendingRequest:true,conversationComplete:false,learnerMove:"question"}),
    nextTurn:8,
  });
  assert.equal(limited.closed,true);
  assert.equal(limited.reason,"turn_limit");
});

test("closing a talk does not claim a real-world official verification or award safe actions", () => {
  const state={
    version:1, scenario:1, createdAt:Date.now(),turns:4,
    messages:[{actor:"them",text:SCENARIOS[1].opening}],events:[],
    verification:"none",closed:true,endReason:"natural",
  };
  const result=evaluate(state,SCENARIOS[1],"fraud");
  assert.equal(result.checked,false);
  assert.equal(result.dangerousAction,false);
  assert.ok(result.feedback.some(x=>x.includes("자연스럽게 끝난")));
  assert.notEqual(result.highlights.status,"안전 확인");
});

test("never expose URLs or numerical identifiers in the dialogue's short summary", () => {
  const next=decide({
    primary:signal({summary:"http://danger.test 010-1234-5678"}),
  });
  assert.doesNotMatch(next.memory.lastSummary,/http|010-1234-5678/);
});


test("explicit question punctuation blocks completion even if both models misread it", () => {
  assert.equal(decide({userText:"정말 그게 맞나요?"}).closed,false);
  assert.ok(decide({userText:"정말 그게 맞나요?"}).issues.includes("pending_user_question"));
});
