import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHONE_CASES, MAX_PHONE_TURNS, MAX_POST_ACTIONS, evaluatePhoneCase,
  findPhoneCase, allowedPhoneAction, availablePhoneActions, heardPhoneRequest, callerSaidTheyHungUp,
  phoneActionOutcome, pickPhoneCase } from "../src/lib/phoneTraining.ts";

function completed(scenario, postActions, requestObserved = true) {
  return {
    version: 2, scenario, createdAt: Date.now(), phase: "finished",
    endedAt: Date.now(), postActions, requestObserved,
  };
}

test("Gemini Live telephone training retains diverse fraud and legitimate call premises", () => {
  assert.equal(new Set(PHONE_CASES.map(c => c.id)).size, PHONE_CASES.length);
  const playable = PHONE_CASES.filter(c => c.kind === "fraud");
  assert.equal(playable.length, 9);
  assert.equal(new Set(playable.map(c => c.risk)).size, 6);
  assert.ok(PHONE_CASES.filter(c => c.kind === "legitimate").length >= 2);
  assert.ok(PHONE_CASES.every(c => c.opening.length > 20 && c.request.length > 15));
  assert.ok(PHONE_CASES.every(c => !/https?:\/\/|(?:\+?82|0)10\d{7,8}/.test(c.opening + c.request)));
  assert.equal(MAX_PHONE_TURNS, 5);
  assert.equal(MAX_POST_ACTIONS, 6);
});

test("scenarios rotate excluding recent experiences", () => {
  const recent = ["card_return", "account_protect", "normal_delivery"];
  for (let n = 0; n < 20; n++) {
    const selected = pickPhoneCase(recent, () => n / 20);
    assert.ok(!recent.includes(selected.id));
    assert.equal(selected.kind, "fraud");
  }
});

test("each playable scenario has an independent verification path and a concrete request action", () => {
  for (const c of PHONE_CASES.filter(item => item.kind === "fraud")) {
    assert.equal(heardPhoneRequest(c, c.opening), false, c.id);
    assert.equal(heardPhoneRequest(c, c.request), true, c.id);
    const afterRequest = availablePhoneActions(c, true);
    const beforeRequest = availablePhoneActions(c, false);
    assert.ok(beforeRequest.includes(c.family ? "saved_family" : "official_call"), c.id);
    assert.ok(beforeRequest.includes("no_action"), c.id);
    const risky = c.risk === "sender_number" ? "caller_number" : "follow_request";
    assert.ok(afterRequest.includes(risky), c.id);
    assert.ok(!beforeRequest.includes(risky), c.id);
    assert.equal(allowedPhoneAction(c, risky, false), false, c.id);
  }
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
  assert.match(benign.lesson, /위험한 요구가 없는 일상 연락/);
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
  assert.match(client, /onModelTurnStart\(\)/);
  assert.match(page, /onModelTurnStart: \(\) => \{/);
  assert.match(page, /별도 행동 하지 않기/);
  assert.match(worklet, /registerProcessor\("mikki-live-input"/);
  assert.doesNotMatch(page, /SpeechSynthesisUtterance|speechSynthesis|SpeechRecognition|webkitSpeechRecognition/);
  assert.match(page, /GeminiLiveAudio/);
  assert.match(page, /hangUp\(\)/);
  assert.match(page, /phase === "after_call"/);
  assert.match(page, /post_action/);
  assert.match(page, /내 행동 피드백 보기/);
  assert.match(page, /postActions/);
  assert.match(page, /<Header title="AI 전화 대응 훈련" back=\{false\}/);
  assert.match(home, /href="\/roleplay"/);
  const mode = readFileSync(new URL("../src/app/roleplay/mode/page.tsx", import.meta.url), "utf8");
  assert.match(mode, /path: "\/roleplay\/phone"/);
});

test("home menu has AI situation and OX, with chat and phone nested in AI situation", () => {
  const home = readFileSync(new URL("../src/app/home/page.tsx", import.meta.url), "utf8");
  const practice = readFileSync(new URL("../src/app/practice/page.tsx", import.meta.url), "utf8");
  const mode = readFileSync(new URL("../src/app/roleplay/mode/page.tsx", import.meta.url), "utf8");
  const intro = readFileSync(new URL("../src/app/roleplay/page.tsx", import.meta.url), "utf8");
  assert.match(home, /className="home-practice-title">AI 상황극<\/span>/);
  assert.match(home, /className="home-practice-title">OX 퀴즈<\/span>/);
  assert.doesNotMatch(home, /href="\/roleplay\/phone"|href="\/roleplay\/case"/);
  assert.match(mode, /path: "\/roleplay\/chat"/);
  assert.match(mode, /path: "\/roleplay\/phone"/);
  assert.match(mode, /연습할 문자 상황을 직접 고르기/);
  assert.match(intro, /redirect\("\/roleplay\/mode"\)/);
  assert.match(practice, /href: "\/roleplay\/case"/);
});

test("training presentation hides Gemini Live technology branding and clarifies phone service failures", () => {
  const page = readFileSync(new URL("../src/app/roleplay/phone/page.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/lib/geminiLiveAudio.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/app/api/phone-training/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(page, /GEMINI LIVE|Gemini Live/);
  assert.match(page, /AI 피싱범과 실시간으로 통화하기/);
  assert.match(page, /AI 피싱범 · 모의 통화 중/);
  assert.doesNotMatch(page, /className="pv-topline"/);
  assert.match(server, /"v1alpha", "v1beta"/);
  assert.match(server, /bidiGenerateContentSetup: \{\s*model: "models\/" \+ LIVE_MODEL,\s*generationConfig: \{ responseModalities: \["AUDIO"\] \}/);
  assert.match(server, /fieldMask: "model,generationConfig.responseModalities"/);
  assert.doesNotMatch(server, /liveConnectConstraints:/);
  assert.match(client, /ws.binaryType = "arraybuffer"/);
  assert.match(client, /typeof data === "string" \? data : decoder.decode\(data\)/);
  assert.match(server, /PHONE_AUTH/);
  assert.match(server, /PHONE_PERMISSION/);
  assert.match(server, /PHONE_REQUEST/);
  assert.match(client, /realtimeInput: \{ text \}/);
  assert.doesNotMatch(client, /clientContent: \{ turns:/);
});

test("simulated caller signs off only on an explicit FINAL model statement", () => {
  for (const line of [
    "알겠습니다. 통화 종료하겠습니다.",
    "그럼 여기서 끊겠습니다.",
    "네, 이만 끊을게요.",
    "통화를 여기서 마치겠습니다.",
  ]) assert.equal(callerSaidTheyHungUp(line), true, line);
  for (const line of [
    "꺼져 그냥",
    "지금은 통화를 끊지 마세요.",
    "통화 종료한다고 말하면 안 됩니다.",
    "제가 안내한 번호로 연락하면 통화가 종료됩니다.",
    "끊으시면 접수가 안 됩니다.",
    "통화를 종료하시겠어요?",
  ]) assert.equal(callerSaidTheyHungUp(line), false, line);
});

test("Live fraudster persona challenges a first rejection and signals genuine disconnect via tool", () => {
  const server = readFileSync(new URL("../src/app/api/phone-training/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/lib/geminiLiveAudio.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../src/app/roleplay/phone/page.tsx", import.meta.url), "utf8");
  assert.match(server, /꺼져 그냥/);
  assert.match(server, /첫.+거절|거절이나 짜증을 처음 받으면/);
  assert.match(server, /한 번의 설득/);
  assert.match(server, /end_training_call/);
  assert.match(server, /functionDeclarations:/);
  assert.match(client, /wire\.toolCall/);
  assert.match(client, /toolResponse:/);
  assert.match(client, /functionResponses:/);
  assert.match(client, /callerSaidTheyHungUp\(this\.modelTurnText\)/);
  assert.match(client, /private requestCallerHangup\(/);
  assert.match(client, /private finishCallerHangup\(/);
  assert.match(client, /this\.callbacks\.onCallerHangup\(\)/);
  assert.match(client, /this\.callbacks\.onConnectionClosed\(\)/);
  assert.match(ui, /onCallerHangup: \(\) =>/);
  assert.match(ui, /void hangUp\("caller"\)/);
  assert.match(ui, /void hangUp\("connection"\)/);
  assert.match(ui, /phase === "after_call"/);
  assert.match(server, /endedBy/);
});

test("AI hangup and network loss are not falsely credited as a user's decision to disconnect", () => {
  const auto = evaluatePhoneCase({ ...completed("card_return", ["official_call"]), endedBy: "caller" });
  const interrupted = evaluatePhoneCase({ ...completed("card_return", ["no_action"]), endedBy: "connection" });
  const manual = evaluatePhoneCase({ ...completed("card_return", ["official_call"]), endedBy: "user" });
  assert.equal(auto.status, "good");
  assert.match(auto.actions[0].label, /상대가 먼저/);
  assert.equal(auto.actions[0].safe, null);
  assert.match(interrupted.actions[0].label, /연결이 끊김/);
  assert.equal(interrupted.actions[0].safe, null);
  assert.match(manual.actions[0].label, /직접 끊음/);
  assert.equal(manual.actions[0].safe, true);
});
