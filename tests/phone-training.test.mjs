import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHONE_CASES, MAX_PHONE_TURNS, evaluatePhoneCase, findPhoneCase, pickPhoneCase } from "../src/lib/phoneTraining.ts";

function state(scenario, decision, riskPresented = true) {
  return {
    version: 1, scenario, createdAt: Date.now(), turns: riskPresented ? 2 : 0,
    riskPresented, closed: true, decision,
    messages: [{ actor: "caller", text: findPhoneCase(scenario).opening }],
  };
}

test("voice training contains multiple grounded phone-only scenarios including genuine calls", () => {
  assert.equal(PHONE_CASES.length, 7);
  assert.equal(new Set(PHONE_CASES.map(c => c.id)).size, 7);
  assert.ok(PHONE_CASES.filter(c => c.kind === "fraud").length >= 4);
  assert.ok(PHONE_CASES.filter(c => c.kind === "legitimate").length >= 2);
  assert.ok(PHONE_CASES.every(c => c.opening.length > 20 && c.request.length > 15 && c.safeAction.length > 15));
  assert.ok(PHONE_CASES.every(c => !/https?:\/\/|(?:\+?82|0)10\d{7,8}/.test(c.opening + c.request)));
  assert.ok(PHONE_CASES.every(c => !/교육용|가상|피싱|연습입니다/.test(c.opening)));
  assert.equal(MAX_PHONE_TURNS, 4);
});

test("recent calls are excluded without exposing whether a scenario is a scam", () => {
  const recent = ["card_return", "account_protect", "normal_delivery"];
  for (let n = 0; n < 20; n++) {
    assert.ok(!recent.includes(pickPhoneCase(recent, () => n / 20).id));
  }
  assert.ok(PHONE_CASES.some(c => c.id === pickPhoneCase([], () => 0).id));
});

test("action scoring distinguishes independent official checks from caller-supplied numbers", () => {
  const safe = evaluatePhoneCase(state("card_return", "official"));
  const trapped = evaluatePhoneCase(state("card_return", "sender"));
  assert.equal(safe.status, "good");
  assert.equal(trapped.status, "caution");
  assert.match(trapped.detail, /직접 찾은 공식 번호/);
  assert.equal(safe.identity, "fraud");
  assert.equal(safe.coverage, "request_reached");
});

test("auth codes are treated as login/transaction authorization, not instant-money magic", () => {
  const result = evaluatePhoneCase(state("payment_auth", "comply"));
  assert.equal(result.status, "caution");
  assert.match(result.detail, /로그인·인증/);
  assert.match(result.lesson, /로그인|거래 승인/);
});

test("stopping before hearing the request never earns full safe-action credit", () => {
  const early = evaluatePhoneCase(state("family_emergency", "hangup", false));
  assert.equal(early.status, "incomplete");
  assert.equal(early.coverage, "before_request");
  const late = evaluatePhoneCase(state("family_emergency", "hangup", true));
  assert.equal(late.status, "good");
});

test("caller-supplied callback number is never treated as independent verification", () => {
  const normal = evaluatePhoneCase(state("normal_delivery", "sender"));
  const fake = evaluatePhoneCase(state("card_return", "sender"));
  assert.equal(normal.status, "caution");
  assert.equal(fake.status, "caution");
  assert.match(normal.detail, /직접 찾은 공식 번호/);
});

test("legitimate appointments are not incorrectly graded as phishing", () => {
  const result = evaluatePhoneCase(state("normal_appointment", "comply"));
  assert.equal(result.status, "good");
  assert.equal(result.identity, "legitimate");
  assert.match(result.lesson, /정상 전화/);
});

test("family callback is a distinct behavior for impersonation calls", () => {
  const result = evaluatePhoneCase(state("family_emergency", "family"));
  assert.equal(result.status, "good");
  assert.match(result.action, /가족/);
});

test("phone AI route keeps state sealed and media local while enforcing safety", () => {
  const route = readFileSync(new URL("../src/app/api/phone-training/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/roleplay/phone/page.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../src/app/home/page.tsx", import.meta.url), "utf8");
  const catalog = readFileSync(new URL("../src/app/practice/page.tsx", import.meta.url), "utf8");
  assert.match(route, /createCipheriv\("aes-256-gcm"/);
  assert.match(route, /createDecipheriv\("aes-256-gcm"/);
  assert.match(route, /providers\(\)/);
  assert.match(route, /p\.name === "gemini"/);
  assert.match(route, /detectPii\(body\.text\)/);
  assert.match(route, /MAX_PHONE_TURNS/);
  assert.match(route, /session\.decision|state\.decision/);
  assert.doesNotMatch(route, /GEMINI_API_KEY[^\n]*NextResponse\.json/);
  assert.match(page, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(page, /SpeechSynthesisUtterance/);
  assert.match(page, /speechSynthesis\.cancel/);
  assert.match(page, /다른 방법으로 확인/);
  assert.match(page, /통화 끊기/);
  assert.match(page, /실제 인증번호나 계좌번호는 말하지 마세요/);
  assert.match(page, /type="text"/);
  assert.match(page, /saveRecord/);
  assert.match(home, /href="\/roleplay\/phone"/);
  assert.match(catalog, /href: "\/roleplay\/phone"/);
});
