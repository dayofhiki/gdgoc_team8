import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ApiError } from "@shared/types";

let client: SupabaseClient | null = null;

// 지연 생성: 빌드 시 서버 프리렌더에서 env 없이 import돼도 깨지지 않게
export function sb(): SupabaseClient {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}

export async function ensureAnon(): Promise<void> {
  const { data } = await sb().auth.getSession();
  if (data.session) return;
  const { error } = await sb().auth.signInAnonymously();
  if (error) throw error;
}

// Edge Function 호출. 실패 시 Error.message = 서버의 error.code (예: "INVITE_EXPIRED")
export async function callFn<Res>(name: string, body: object): Promise<Res> {
  const { data, error } = await sb().functions.invoke(name, { body });
  if (!error) return data as Res;
  let code = "INTERNAL";
  try {
    code = ((await error.context.json()) as ApiError).error.code;
  } catch {}
  throw new Error(code);
}
