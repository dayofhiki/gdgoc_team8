// 무료 LLM 공급자 자동 전환 모듈. Edge Function(Deno)과 /api/lab(Node) 양쪽에서 import해서 씀.
// 셋 다 OpenAI 호환 → 같은 요청 형식, URL·키·모델만 다름. 키가 등록된 공급자만 이 순서대로 시도:
//   Gemini(프롬프트를 이걸로 다듬음) → Groq(빠름·한도 넉넉) → OpenRouter(:free 모델)
// 429 · 5xx · 시간 초과 · 빈 응답 · parse 실패면 다음 공급자로. 전부 실패하면 throw.
export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type Provider = { name: string; url: string; key: string; model: string; extra?: Record<string, unknown> };
export type Options<T> = {
  temperature?: number;
  maxTokens?: number;
  json?: boolean; // response_format json_object. shortcut: 스키마 강제는 아님(Groq Llama 미지원) → parse에서 검증
  parse?: (text: string) => T; // throw하면 형식 오류로 보고 다음 공급자로
  budgetMs?: number; // 전체 시간 예산. chat-turn 타임아웃(8초)보다 짧게
};
type Deps = { list?: Provider[]; fetch?: typeof fetch; now?: () => number };

const PER_TRY_MS = 4000;
const MIN_TRY_MS = 500;
const DEFAULT_BUDGET_MS = 7000;
const DEFAULT_COOLDOWN_MS = 60_000;

const env = (k: string): string | undefined => {
  const g = globalThis as {
    Deno?: { env: { get(k: string): string | undefined } };
    process?: { env: Record<string, string | undefined> };
  };
  return g.Deno ? g.Deno.env.get(k) : g.process?.env[k];
};

// 모델명은 env로 바꿀 수 있음. GEMINI_MODEL은 ai.ts와 같은 값을 공유.
export function providers(get: (k: string) => string | undefined = env): Provider[] {
  return [
    {
      name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: get("GEMINI_API_KEY"), model: get("GEMINI_MODEL") || "gemini-3.6-flash",
      // ai.ts의 thinkingLevel: minimal과 같은 의도 (생각 켜짐이면 최대 ~8초)
      extra: { reasoning_effort: "minimal" },
    },
    {
      name: "groq", url: "https://api.groq.com/openai/v1/chat/completions",
      key: get("GROQ_API_KEY"), model: get("GROQ_MODEL") || "llama-3.3-70b-versatile",
    },
    {
      name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions",
      key: get("OPENROUTER_API_KEY"), model: get("OPENROUTER_MODEL") || "meta-llama/llama-3.3-70b-instruct:free",
    },
  ].filter((p): p is Provider => !!p.key);
}

// shortcut: 쿨다운이 인스턴스 메모리라 콜드스타트마다 초기화됨 → 한 번 더 429 맞고 다시 건너뜀. 트래픽 커지면 DB/KV로.
export const cooldown = new Map<string, number>();

export async function complete<T = string>(
  messages: Msg[],
  opts: Options<T> = {},
  deps: Deps = {},
): Promise<{ value: T; text: string; provider: string }> {
  const { list = providers(), fetch: f = fetch, now = Date.now } = deps;
  const deadline = now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const errors: string[] = [];

  for (const p of list) {
    if ((cooldown.get(p.name) ?? 0) > now()) {
      errors.push(`${p.name}: cooldown`);
      continue;
    }
    const left = deadline - now();
    if (left < MIN_TRY_MS) {
      errors.push("budget exhausted");
      break;
    }
    try {
      const r = await f(p.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: p.model,
          messages,
          max_tokens: opts.maxTokens ?? 300,
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          ...p.extra,
        }),
        signal: AbortSignal.timeout(Math.min(PER_TRY_MS, left)),
      });
      if (r.status === 429) {
        const sec = Number(r.headers.get("retry-after"));
        cooldown.set(p.name, now() + (sec > 0 ? sec * 1000 : DEFAULT_COOLDOWN_MS));
      }
      if (!r.ok) {
        errors.push(`${p.name}: ${r.status} ${(await r.text()).slice(0, 120)}`);
        continue;
      }
      const text = (await r.json())?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) {
        errors.push(`${p.name}: empty`);
        continue;
      }
      const value = opts.parse ? opts.parse(text.trim()) : (text.trim() as T);
      if (errors.length) console.warn("llm fallback:", errors.join(" | "), "→", p.name);
      return { value, text: text.trim(), provider: p.name };
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  throw new Error(`ALL_PROVIDERS_FAILED (${errors.join(" | ") || "no keys"})`);
}
