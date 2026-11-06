import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trainingReplyExamples } from "../src/lib/trainingReplyExamples.ts";
import { TRAINING_TOPIC_IDS } from "../src/lib/trainingCatalog.ts";

const them = (text, actions = []) => ({ actor: "them", text, actions });
const me = text => ({ actor: "me", text });

test("suggestions answer the latest concrete request, not a stale topic template", () => {
  const messages = [them("결제 관련 안내입니다."), me("어떤 결제인가요?"),
    them("계좌 보호를 위해 30만 원을 송금해 주세요.", [{ kind: "transfer", origin: "sender" }])];
  const replies = trainingReplyExamples("bank", messages);
  assert.match(replies[0], /왜 돈을 보내야/);
  assert.ok(replies.every(reply => !/어떤 결제인가요/.test(reply)));
  assert.ok(replies.every(reply => !/보냈습니다|확인했어요/.test(reply)));
});

test("deposit explanations get follow-up replies even without sender actions", () => {
  const messages = [
    them("작업 재료를 택배로 보내드립니다. 재료비 보증금을 먼저 입금해 주셔야 합니다."),
    me("왜 돈을 보내야 하나요?"),
    them("물품만 받고 연락이 두절되는 경우가 있어 안전장치로 보증금을 받고 있습니다. 작업을 제출하면 수당과 함께 돌려드려요."),
  ];
  for (const topic of ["job", "team_mission"]) {
    assert.deepEqual(trainingReplyExamples(topic, messages), [
      "보증금 없이 진행할 수 있나요?", "보증금은 보내지 않겠습니다.",
    ]);
  }
});

test("follow-up suggestions do not fall back to asking why the sender contacted them", () => {
  const replies = trainingReplyExamples("job", [
    them("안녕하세요. 재택 일자리 안내입니다."),
    me("어떤 일을 하는 건가요?"),
    them("포장 업무예요. 연락이 두절되는 경우에는 다음 작업 배정이 어려워요."),
  ]);
  assert.ok(replies.every(reply => !/용건|연락하셨|근무 시간|급여 조건/.test(reply)));
});

test("bereavement messages produce context-appropriate sympathetic replies", () => {
  const opening = trainingReplyExamples("obituary", [them("갑작스러운 부고 소식을 전합니다.")]);
  assert.ok(opening.some(reply => /고인|빈소|부고/.test(reply)));
  const link = trainingReplyExamples("obituary", [
    them("부고 소식을 전합니다."), me("누구의 부고인가요?"),
    them("부고장 내용은 아래 링크를 눌러 확인해 주세요.", [{ kind: "link", origin: "sender" }]),
  ]);
  assert.match(link[0], /링크/);
  assert.ok(!link.includes("누구의 부고인가요?"));
});

test("family device repair and money requests keep informal realistic wording", () => {
  const opening = trainingReplyExamples("family", [them("엄마 나 폰이 고장나서 다른 번호로 문자해.")]);
  assert.match(opening[0], /무슨 일|고장/);
  const demand = trainingReplyExamples("family", [them("수리비가 필요해. 지금 돈 좀 보내줘.", [{ kind: "transfer", origin: "sender" }])]);
  assert.match(demand[0], /왜 필요해/);
  assert.ok(demand.every(reply => !reply.includes("요?")));
});

test("source-specific phone request and private-data request change suggestions", () => {
  assert.match(trainingReplyExamples("card", [
    them("반송 처리를 위해 이 번호로 전화해 주세요.", [{ kind: "phone", origin: "sender" }]),
  ])[0], /전화로 무엇을/);
  assert.match(trainingReplyExamples("bank", [
    them("보안 조치를 위해 인증번호를 알려 주세요.", [{ kind: "provide_data", origin: "sender" }]),
  ])[0], /정보가 왜 필요한가요/);
});

test("external activities do not trigger stale reply recommendations", () => {
  assert.deepEqual(trainingReplyExamples("obituary", [
    them("지인의 부고를 알립니다."), { actor: "system", text: "기존 연락처로 확인했어요." },
  ]), []);
});

test("every topic has distinct, non-duplicated response suggestions", () => {
  for (const topic of TRAINING_TOPIC_IDS) {
    const initial = trainingReplyExamples(topic, [them("안녕하세요. 연락드렸습니다.")]);
    assert.equal(initial.length, 2, topic);
    assert.notEqual(initial[0], initial[1], topic);
    const followup = trainingReplyExamples(topic, [them("안녕하세요. 연락드렸습니다."), me(initial[0]), them("계속 안내드리겠습니다.")]);
    assert.equal(followup.length, 2, topic);
    assert.ok(!followup.includes(initial[0]), topic);
  }
});

test("training never jumps automatically from action receipt to feedback", () => {
  const page = readFileSync(new URL("../src/app/roleplay/chat/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /setTimeout\(\(\) => void finish\(/);
  assert.match(page, /내 행동 피드백 보기/);
  const phone = readFileSync(new URL("../src/components/TrainingPhonePanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(phone, /이 문자 대화 끝내기/);
  assert.match(phone, /setScreen\("outcome"\)/);
});

test("offers a statement at the opening and a bounded, actionable refusal after the request", async () => {
  const { clearlyDisengaged, requestHasTwoReplies } = await import("../src/lib/trainingResolution.ts");
  const opening = trainingReplyExamples("invitation", [them("우리 딸이 다음 달에 결혼해요.")]);
  assert.ok(opening.includes("결혼 축하해요."));
  for (const kind of ["phone", "link", "provide_data", "transfer"]) {
    const messages = [them("아래 내용을 확인해 주세요.", [{ kind, origin: "sender" }]),
      me("무슨 일인가요?"), them("이 절차를 거치셔야 합니다.")];
    const replies = trainingReplyExamples("bank", messages);
    assert.ok(clearlyDisengaged(replies[0]), kind);
    assert.equal(requestHasTwoReplies(messages), false);
    messages.push(me("다른 방법은 없나요?"), them("이 방법으로만 가능합니다."));
    assert.equal(requestHasTwoReplies(messages), true);
    messages.push(them("새로 보내드린 인증번호를 알려주세요.", [{ kind: "provide_data", origin: "sender" }]));
    assert.equal(requestHasTwoReplies(messages), false);
  }
});
