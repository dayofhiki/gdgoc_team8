import { test } from "node:test";
import assert from "node:assert/strict";
import { complete, cooldown, type Provider, providers } from "./llm.ts";

const P = (name: string): Provider => ({ name, url: `https://${name}`, key: "k", model: "m" });
const ok = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }));
const msgs = [{ role: "user" as const, content: "hi" }];

test("providers: 키 있는 것만, gemini → groq → openrouter 순", () => {
  const env: Record<string, string> = { OPENROUTER_API_KEY: "a", GROQ_API_KEY: "b", GEMINI_API_KEY: "c" };
  assert.deepEqual(providers((k) => env[k]).map((p) => p.name), ["gemini", "groq", "openrouter"]);
  assert.deepEqual(providers(() => undefined), []);
});

test("429·500·빈 응답이면 다음 공급자, 429는 쿨다운", async () => {
  cooldown.clear();
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    if (url === "https://a") return new Response("", { status: 429, headers: { "retry-after": "30" } });
    if (url === "https://b") return new Response("", { status: 500 });
    if (url === "https://c") return ok("  ");
    return ok("안녕");
  }) as typeof fetch;
  const list = [P("a"), P("b"), P("c"), P("d")];
  const r = await complete(msgs, {}, { list, fetch: f, now: () => 0 });
  assert.deepEqual(r, { value: "안녕", text: "안녕", provider: "d" });
  assert.equal(cooldown.get("a"), 30_000);

  calls.length = 0;
  await complete(msgs, {}, { list, fetch: f, now: () => 1000 }); // 쿨다운 중인 a는 호출 안 함
  assert.ok(!calls.includes("https://a"));
});

test("parse 실패(형식 오류)면 다음 공급자, json·temperature 옵션 전달", async () => {
  cooldown.clear();
  const bodies: Record<string, unknown>[] = [];
  const f = (async (url: string, init: RequestInit) => {
    bodies.push(JSON.parse(init.body as string));
    return ok(url === "https://a" ? "형식 아님" : '{"intent":"refuse"}');
  }) as typeof fetch;
  const r = await complete(msgs, { json: true, temperature: 0.2, parse: (t) => JSON.parse(t) as { intent: string } }, {
    list: [P("a"), P("b")], fetch: f,
  });
  assert.equal(r.provider, "b");
  assert.equal(r.value.intent, "refuse");
  assert.deepEqual(bodies[0].response_format, { type: "json_object" });
  assert.equal(bodies[0].temperature, 0.2);
});

test("시간 예산을 다 쓰면 남은 공급자는 시도하지 않음", async () => {
  cooldown.clear();
  let t = 0;
  const f = (async () => {
    t += 5000; // 호출 하나가 5초 걸린 것처럼
    return new Response("", { status: 500 });
  }) as typeof fetch;
  await assert.rejects(
    complete(msgs, { budgetMs: 7000 }, { list: [P("a"), P("b"), P("c")], fetch: f, now: () => t }),
    /a: 500.*b: 500.*budget exhausted/,
  );
});

test("전부 실패하면 throw", async () => {
  cooldown.clear();
  const f = (async () => { throw new Error("net"); }) as typeof fetch;
  await assert.rejects(complete(msgs, {}, { list: [P("a")], fetch: f }), /ALL_PROVIDERS_FAILED \(a: net\)/);
  await assert.rejects(complete(msgs, {}, { list: [], fetch: f }), /no keys/);
});
