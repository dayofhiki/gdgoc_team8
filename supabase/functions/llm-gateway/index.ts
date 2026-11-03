// 내부 전용 LLM 게이트웨이: POST { messages } → { text, provider }. 모든 공급자 실패 시 503.
// 사용자 JWT 대신 service role 키로만 호출 가능 (config.toml에서 verify_jwt=false, 여기서 직접 검사).
import { json } from "../_shared/http.ts";
import { complete, type Msg, providers } from "./providers.ts";

const list = providers((k) => Deno.env.get(k));
const ROLES = ["system", "user", "assistant"];

Deno.serve(async (req) => {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return json(401, { error: { code: "UNAUTHORIZED", message: "internal only" } });
  }
  const body = await req.json().catch(() => null);
  const messages = body?.messages as Msg[] | undefined;
  if (!Array.isArray(messages) || !messages.length ||
    !messages.every((m) => ROLES.includes(m?.role) && typeof m.content === "string")) {
    return json(400, { error: { code: "BAD_REQUEST", message: "messages: [{ role, content }] 필요" } });
  }
  try {
    return json(200, await complete(list, messages));
  } catch (e) {
    console.error(e);
    return json(503, { error: { code: "AI_UNAVAILABLE", message: "모든 LLM 공급자 실패" } });
  }
});
