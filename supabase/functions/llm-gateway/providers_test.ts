import { test } from "node:test";
import assert from "node:assert/strict";
import { complete, cooldown, type Provider, providers } from "./providers.ts";

const P = (name: string): Provider => ({ name, url: `https://${name}`, key: "k", model: "m" });
const ok = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }));
const msgs = [{ role: "user" as const, content: "hi" }];

test("providers: 키 있는 것만, 순서 유지", () => {
  const env: Record<string, string> = { OPENROUTER_API_KEY: "a", GROQ_API_KEY: "b" };
  assert.deepEqual(providers((k) => env[k]).map((p) => p.name), ["groq", "openrouter"]);
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
  assert.deepEqual(await complete(list, msgs, f, () => 0), { text: "안녕", provider: "d" });
  assert.equal(cooldown.get("a"), 30_000);

  calls.length = 0;
  await complete(list, msgs, f, () => 1000); // 쿨다운 중인 a는 호출 안 함
  assert.ok(!calls.includes("https://a"));
});

test("전부 실패하면 throw", async () => {
  cooldown.clear();
  const f = (async () => { throw new Error("net"); }) as typeof fetch;
  await assert.rejects(complete([P("a")], msgs, f), /ALL_PROVIDERS_FAILED \(a: net\)/);
  await assert.rejects(complete([], msgs, f), /no keys/);
});
