import test from "node:test";
import assert from "node:assert/strict";
import {
  CASE_GUIDES, DIALOGUE_SCHEMA, DIALOGUE_POLICY, INITIAL_DIALOGUE,
  caseGuide, actorBrief, openingBrief, acceptableOpening, unsolicitedSolution, parseOpeningOutput, parseDialogueOutput, replySimilarity, decideDialogueTurn,
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


test("each case offers indistinguishable neutral opening conditions but distinct later actor objectives", () => {
  assert.equal(SCENARIOS.length, 6);
  for (let i = 0; i < SCENARIOS.length; i += 2) {
    const genuine = SCENARIOS[i], impersonation = SCENARIOS[i + 1];
    assert.equal(genuine.opening, impersonation.opening); // archival template; no longer sent by start API
    for (const style of [0, 1, 5, 7]) {
      assert.equal(openingBrief(genuine, style), openingBrief(impersonation, style));
      assert.ok(!openingBrief(genuine, style).includes("legitimate"));
      assert.ok(!openingBrief(genuine, style).includes("fraud"));
      assert.ok(!openingBrief(genuine, style).includes(genuine.opening));
    }
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


test("first message is genuinely AI-generated, not returned from a static scenario opening", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../src/app/api/real-training/route.ts", import.meta.url), "utf8");
  assert.match(route, /const opening = await generateOpening\(scenario\)/);
  assert.match(route, /text: opening/);
  assert.doesNotMatch(route, /text: scenario\.opening/);
  assert.match(route, /OPENING_SCHEMA/);
  assert.doesNotMatch(route, /return scenario\.opening/);
});

test("neutral opening contract rejects actionable paths and fabricated identifiers", () => {
  const opener = parseOpeningOutput(JSON.stringify({ opening: "엄마, 나 폰이 고장 나서 잠깐 다른 기기로 문자해. 지금 바빠?" }));
  assert.ok(acceptableOpening(opener.opening));
  assert.ok(acceptableOpening("안녕하세요, 배송 확인이 필요한 건이 있어 안내드립니다."));
  assert.equal(acceptableOpening("그 계좌로 입금해 주세요."), false);
  assert.equal(acceptableOpening("원래 번호로 전화해 주세요."), false);
  assert.equal(acceptableOpening("아래 링크로 들어가세요."), false);
  assert.equal(acceptableOpening("안녕하세요, 010-1234-5678입니다."), false);
  assert.throws(() => parseOpeningOutput('{"reply":"invalid"}'), /INVALID_OPENING_SCHEMA/);
  assert.notEqual(openingBrief(SCENARIOS[0], 0), openingBrief(SCENARIOS[0], 1));
});

test("genuine actors must not give away verification or transfer routes", () => {
  for (const s of SCENARIOS.filter(s => s.identity === "legitimate")) {
    assert.match(actorBrief(s, INITIAL_DIALOGUE, 1), /정상 인물 추가 제약/);
    assert.match(s.objective, /먼저|알려주지|제시하지/);
  }
  assert.ok(DIALOGUE_POLICY.includes("안전 강사가 아니다"));
  for (const reply of [
    "엄마, 원래 번호로 전화해봐.",
    "공식 앱에서 확인해 주세요.",
    "카드 뒷면 번호로 연락하세요.",
    "여기로 입금해줘.",
    "은행 고객센터로 전화해 주세요.",
  ]) assert.equal(unsolicitedSolution(reply), true, reply);
  for (const reply of [
    "엄마, 지금 폰이 고장 나서 연락했어.",
    "응, 알겠어. 그럼 그렇게 해.",
    "배송지 확인이 필요한 건은 맞습니다.",
    "네, 저희 쪽에서 확인 요청이 있었습니다.",
  ]) assert.equal(unsolicitedSolution(reply), false, reply);
});


test("SY-derived learner context separates speech claims, suspicion and real action evidence", async () => {
  const { learnerContext, learnerTurnGuidance, isExplicitTrainingStop } =
    await import("../src/lib/trainingTurnContext.ts");
  const history = [
    { actor: "them", text: "연락 돼?" },
    { actor: "me", text: "돈 보냈어" },
    { actor: "them", text: "아직 확인이 안 돼." },
    { actor: "me", text: "돈 보냈어" },
    { actor: "me", text: "너 사기꾼이지?" },
  ];
  const ctx = learnerContext(history, "돈 보냈어");
  assert.equal(ctx.repeats, 2);
  assert.equal(ctx.priorClaims, 2);
  assert.equal(ctx.priorSuspicions, 1);
  assert.equal(ctx.claimsAction, true);
  const fraud = learnerTurnGuidance(ctx, "fraud", 0);
  assert.match(fraud, /실제로 했다고 가정하면 안 된다/);
  assert.match(fraud, /물러난다/);
  assert.match(fraud, /같은 말을 세 번 이상/);
  assert.doesNotMatch(fraud, /실제 송금이 확인됐습니다/);
  const normal = learnerTurnGuidance(ctx, "legitimate", 0);
  assert.doesNotMatch(normal, /다시 '아직 안 왔다'/);
  assert.equal(learnerContext(history, "돈 안 보냈어").claimsAction, false);
  assert.equal(learnerContext(history, "링크 안 눌렀어").claimsAction, false);
  assert.equal(learnerContext(history, "링크 눌렀어").claimsAction, true);
  assert.equal(learnerContext(history, "딸이 지금 옆에 있는데?").verificationClaim, true);
  assert.equal(learnerContext(history, "진짜 너 맞아?").suspectsSender, false);
  assert.equal(isExplicitTrainingStop("연습 그만할래요"), true);
  assert.equal(isExplicitTrainingStop("상황극 종료"), true);
  assert.equal(isExplicitTrainingStop("그만 연락해"), false);
  assert.equal(isExplicitTrainingStop("돈은 안 보낼게요"), false);
});

test("SY-derived richer dialogue signals can close a resolved confrontation without claiming verification", () => {
  for (const learnerMove of ["claimed_action", "suspect", "verified_claimed"]) {
    const parsed = parseDialogueOutput(JSON.stringify({
      reply: "알겠어, 그럼 나중에 얘기하자.",
      actions: [],
      dialogue: signal({ learnerMove }),
    }));
    const settled = decide({ primary: parsed.dialogue, audit: parsed.dialogue, nextTurn: 3, userText: "그만 얘기하자." });
    assert.equal(settled.closed, true);
  }
  const unresolved = decide({
    primary: signal({ learnerMove: "suspect" }),
    audit: signal({ learnerMove: "suspect" }),
    userText: "사기꾼이야?",
  });
  assert.equal(unresolved.closed, false);
});

test("real training route handles explicit training stop and rejects invented genuine-actor actions", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../src/app/api/real-training/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(isExplicitTrainingStop\(text\)\)/);
  assert.match(route, /recordChoice\(withMessage, scenario, "stop"\)/);
  assert.match(route, /scenario\.identity === "legitimate"/);
  assert.match(route, /first\.value\.actions\.filter\(a => a\.kind === "transfer"\)/);
});
