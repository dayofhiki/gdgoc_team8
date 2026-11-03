import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import type { ErrorCode } from "./types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string) {
    super(message);
  }
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Ctx<B> = { body: B; user: User; admin: SupabaseClient };

// 공통 처리: CORS · POST 검사 · JWT로 사용자 확인 · 에러를 { error: { code, message } }로 변환.
// admin(service role)은 RLS를 우회하므로 핸들러가 소유권을 직접 확인해야 함.
export function handle<B>(fn: (ctx: Ctx<B>) => Promise<unknown>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    try {
      if (req.method !== "POST") throw new HttpError(405, "BAD_REQUEST", "POST only");
      const url = Deno.env.get("SUPABASE_URL")!;
      const auth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data, error } = await auth.auth.getUser();
      if (error || !data.user) throw new HttpError(401, "UNAUTHORIZED", "로그인이 필요합니다");
      const body = (await req.json().catch(() => null)) as B | null;
      if (!body || typeof body !== "object") throw new HttpError(400, "BAD_REQUEST", "JSON body가 필요합니다");
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      return json(200, await fn({ body, user: data.user, admin }));
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: { code: e.code, message: e.message } });
      console.error(e);
      return json(500, { error: { code: "INTERNAL", message: "서버 오류" } });
    }
  };
}

// supabase 쿼리 결과에서 에러면 500으로 던짐.
export function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
