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
