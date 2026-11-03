// 무료 LLM 공급자 자동 전환. 셋 다 OpenAI 호환 → 같은 요청 형식, URL·키·모델만 다름.
// Deno 전역을 쓰지 않음 → node 테스트에서도 import 가능.
export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type Provider = { name: string; url: string; key: string; model: string };

const PER_TRY_MS = 4000;
const DEFAULT_COOLDOWN_MS = 60_000;

// 키가 등록된 공급자만, 이 순서대로 시도 (빠르고 한도 넉넉한 순). 모델명은 env로 바꿀 수 있음.
export function providers(env: (k: string) => string | undefined): Provider[] {
  return [
    { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions",
      key: env("GROQ_API_KEY"), model: env("GROQ_MODEL") ?? "llama-3.3-70b-versatile" },
    { name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: env("GEMINI_API_KEY"), model: env("GEMINI_MODEL") ?? "gemini-2.5-flash" },
    { name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions",
      key: env("OPENROUTER_API_KEY"), model: env("OPENROUTER_MODEL") ?? "meta-llama/llama-3.3-70b-instruct:free" },
  ].filter((p): p is Provider => !!p.key);
}

// shortcut: 쿨다운이 인스턴스 메모리라 콜드스타트마다 초기화됨 → 한 번 더 429 맞고 다시 건너뜀. 트래픽 커지면 DB/KV로.
export const cooldown = new Map<string, number>();

export async function complete(list: Provider[], messages: Msg[], f: typeof fetch = fetch, now = Date.now) {
  const errors: string[] = [];
  for (const p of list) {
    if ((cooldown.get(p.name) ?? 0) > now()) {
      errors.push(`${p.name}: cooldown`);
      continue;
    }
    try {
      const r = await f(p.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: p.model, messages, max_tokens: 300 }),
        signal: AbortSignal.timeout(PER_TRY_MS),
      });
      if (r.status === 429) {
        const sec = Number(r.headers.get("retry-after"));
        cooldown.set(p.name, now() + (sec > 0 ? sec * 1000 : DEFAULT_COOLDOWN_MS));
      }
      if (!r.ok) {
        errors.push(`${p.name}: ${r.status}`);
        continue;
      }
      const text = (await r.json())?.choices?.[0]?.message?.content;
      if (typeof text === "string" && text.trim()) return { text: text.trim(), provider: p.name };
      errors.push(`${p.name}: empty`);
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  throw new Error(`ALL_PROVIDERS_FAILED (${errors.join(", ") || "no keys"})`);
}
