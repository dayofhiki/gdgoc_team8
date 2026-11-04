// 음성 인식 요청·응답 처리 테스트 (실제 API 호출 없음)
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMime, readTranscript, TranscribeError, transcribeAudio } from "./transcribe.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GEMINI_API_KEY;
});

test("녹음 형식 정규화", () => {
  assert.equal(normalizeMime("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(normalizeMime("audio/mp4"), "audio/m4a");
  assert.equal(normalizeMime("video/webm"), null);
});

test("응답 텍스트 읽기: output_text 또는 steps[].content[].text", () => {
  assert.equal(readTranscript({ output_text: " 안녕하세요 " }), "안녕하세요");
  assert.equal(readTranscript({ steps: [{ type: "model_output", content: [{ type: "text", text: "원래 번호로" }, { type: "text", text: "전화할게" }] }] }), "원래 번호로 전화할게");
  assert.equal(readTranscript({}), "");
});

test("키가 없으면 AI_NOT_CONFIGURED", async () => {
  await assert.rejects(transcribeAudio("AAAA", "audio/webm"), (e) => e instanceof TranscribeError && e.code === "AI_NOT_CONFIGURED");
});

test("요청 형식: Interactions API, inline audio, 한국어 힌트 / 오류 상태는 TRANSCRIBE_FAILED", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const seen: { req?: { url: string; body: Record<string, unknown>; headers: Record<string, string> } } = {};
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.req = { url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> };
    return new Response(JSON.stringify({ output_text: "링크는 안 누를게" }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(await transcribeAudio("AAAA", "audio/webm"), "링크는 안 누를게");
  const s = seen.req;
  assert.ok(s);
  assert.match(s.url, /\/v1beta\/interactions$/);
  assert.equal(s.headers["x-goog-api-key"], "test-key");
  assert.deepEqual(s.body.input, [{ type: "audio", data: "AAAA", mime_type: "audio/webm" }]);
  assert.equal(s.body.model, "models/gemini-3.5-transcribe");
  globalThis.fetch = (async () => new Response("quota", { status: 429 })) as typeof fetch;
  await assert.rejects(transcribeAudio("AAAA", "audio/webm"), (e) => e instanceof TranscribeError && e.code === "TRANSCRIBE_FAILED");
});
