import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHONE_CASES, MAX_PHONE_TURNS, MAX_POST_ACTIONS, evaluatePhoneCase,
  findPhoneCase, allowedPhoneAction, phoneActionOutcome, pickPhoneCase } from "../src/lib/phoneTraining.ts";

function completed(scenario, postActions, requestObserved = true) {
  return {
    version: 2, scenario, createdAt: Date.now(), phase: "finished",
    endedAt: Date.now(), postActions, requestObserved,
  };
}

test("Gemini Live telephone training retains diverse fraud and legitimate call premises", () => {
  assert.equal(PHONE_CASES.length, 7);
  assert.equal(new Set(PHONE_CASES.map(c => c.id)).size, 7);
  assert.ok(PHONE_CASES.filter(c => c.kind === "fraud").length >= 4);
  assert.ok(PHONE_CASES.filter(c => c.kind === "legitimate").length >= 2);
  assert.ok(PHONE_CASES.every(c => c.opening.length > 20 && c.request.length > 15));
  assert.ok(PHONE_CASES.every(c => !/https?:\/\/|(?:\+?82|0)10\d{7,8}/.test(c.opening + c.request)));
  assert.equal(MAX_PHONE_TURNS, 5);
  assert.equal(MAX_POST_ACTIONS, 6);
});

test("scenarios rotate excluding recent experiences", () => {
  const recent = ["card_return", "account_protect", "normal_delivery"];
  for (let n = 0; n < 20; n++) assert.ok(!recent.includes(pickPhoneCase(recent, () => n / 20).id));
});

test("call hangup cannot produce a final result without an intentional post-call action", () => {
  assert.throws(() => evaluatePhoneCase({ ...completed("card_return", []), phase: "after_call" }), /INVALID_PHONE_RESULT/);
  assert.throws(() => evaluatePhoneCase(completed("card_return", [])), /INVALID_PHONE_RESULT/);
});

test("independent verification after disconnect earns stronger feedback than hanging up without checking", () => {
  const confirmed = evaluatePhoneCase(completed("card_return", ["official_call"]));
  const ignored = evaluatePhoneCase(completed("card_return", ["no_action"]));
  assert.equal(confirmed.status, "good");
  assert.equal(ignored.status, "incomplete");
  assert.match(confirmed.headline, /직접 확인/);
  assert.equal(confirmed.actions.length, 2);
  assert.equal(confirmed.actions[0].label, "통화를 끊음");
  assert.equal(confirmed.actions[1].safe, true);
});

test("caller-provided number stays risky even when user subsequently independently checks", () => {
  const result = evaluatePhoneCase(completed("card_return", ["caller_number", "official_call"]));
  assert.equal(result.status, "caution");
  assert.equal(result.actions[1].safe, false);
  assert.equal(result.actions[2].safe, true);
});

test("a wrong action and an independent check receive distinct feedback", () => {
  const risky = evaluatePhoneCase(completed("payment_auth", ["follow_request"]));
  assert.equal(risky.status, "caution");
  assert.match(risky.lesson, /로그인|거래 승인/);
  assert.match(phoneActionOutcome(findPhoneCase("payment_auth"), "follow_request"), /실제 코드/);
  const safe = evaluatePhoneCase(completed("payment_auth", ["official_app"]));
  assert.equal(safe.status, "good");
});

test("verification through an original family contact is supported only for impersonation calls", () => {
  const family = findPhoneCase("family_emergency");
  const card = findPhoneCase("card_return");
  assert.equal(allowedPhoneAction(family, "saved_family"), true);
  assert.equal(allowedPhoneAction(card, "saved_family"), false);
  const feedback = evaluatePhoneCase(completed("family_emergency", ["saved_family"]));
  assert.equal(feedback.status, "good");
});

test("legitimate ordinary requests need not be rejected automatically", () => {
  const benign = evaluatePhoneCase(completed("normal_delivery", ["follow_request"]));
  assert.equal(benign.status, "good");
  assert.equal(benign.identity, "legitimate");
  assert.match(benign.lesson, /정상/);
});

test("early hangup cannot claim that the learner heard the high-risk request", () => {
  const result = evaluatePhoneCase(completed("account_protect", ["no_action"], false));
  assert.equal(result.coverage, "before_request");
  assert.match(result.whatWasRequested, /확인되지/);
});

test("Live backend provisions ephemeral credentials and server-sealed multi-step decisions", () => {
  const server = readFileSync(new URL("../src/app/api/phone-training/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/lib/geminiLiveAudio.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/roleplay/phone/page.tsx", import.meta.url), "utf8");
  const worklet = readFileSync(new URL("../public/audio/live-input-processor.js", import.meta.url), "utf8");
  const home = readFileSync(new URL("../src/app/home/page.tsx", import.meta.url), "utf8");
  assert.match(server, /createCipheriv\("aes-256-gcm"/);
  assert.match(server, /createDecipheriv\("aes-256-gcm"/);
  assert.match(server, /auth_tokens/);
  assert.match(server, /"x-goog-api-key": key/);
  assert.match(server, /liveConnectConstraints/);
  assert.match(server, /uses: 1/);
  assert.match(server, /body\.action === "end_call"/);
  assert.match(server, /body\.action === "post_action"/);
  assert.match(server, /body\.action === "finish"/);
  assert.match(server, /state\.postActions\.length/);
  assert.match(server, /state\.phase !== "after_call"/);
  assert.doesNotMatch(server, /nextResponse\.json\(\{\s*apiKey/);
  assert.match(client, /new WebSocket/);
  assert.match(client, /access_token/);
  assert.match(client, /audio\/pcm;rate=16000/);
  assert.match(client, /24_000/);
  assert.match(client, /AudioWorkletNode/);
  assert.match(client, /inputTranscription/);
  assert.match(client, /outputTranscription/);
  assert.match(client, /interrupted/);
  assert.match(worklet, /registerProcessor\("mikki-live-input"/);
  assert.doesNotMatch(page, /SpeechSynthesisUtterance|speechSynthesis|SpeechRecognition|webkitSpeechRecognition/);
  assert.match(page, /GeminiLiveAudio/);
  assert.match(page, /hangUp\(\)/);
  assert.match(page, /phase === "after_call"/);
  assert.match(page, /post_action/);
  assert.match(page, /내 행동 피드백 보기/);
  assert.match(page, /postActions/);
  assert.match(page, /<Header title="AI 전화 대응 훈련" back=\{false\}/);
  assert.match(home, /href="\/roleplay\/phone"/);
});
