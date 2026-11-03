/**
 * 가족 초대 링크(도전장) ↔ Supabase invites 연결.
 * - 보내는 쪽: invites 행을 만들어 토큰을 링크에 담음. 유효한 토큰은 이 브라우저에 저장해 재사용(행이 계속 쌓이지 않게).
 * - 받는 쪽: invite-join으로 토큰 확인 (없는 토큰·만료·정원 초과 → 링크 오류 화면).
 * Supabase 설정(.env.local)이 없거나 연결이 안 되면 null/"offline"을 돌려주고, 화면은 기존(토큰 없는) 방식으로 동작합니다.
 */
import type { InviteJoinResponse } from "@shared/types";
import { callFn, ensureAnon, sb } from "./supabase";

const KEY = "mikki:invite";
/** 가족 단톡방에 공유될 수 있어 여러 명 입장 허용 (백엔드 허용 범위 1~200) */
const MAX_PARTICIPANTS = 10;
/** 만료 하루 전부터는 새 링크를 만듦 */
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type Cached = { token: string; expires_at: string };

function readCache(): Cached | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? "null") as Cached | null;
    if (c?.token && new Date(c.expires_at).getTime() - Date.now() > RENEW_BEFORE_MS) return c;
  } catch {
    /* 손상된 값은 무시 */
  }
  return null;
}

/** 보내는 쪽: 공유할 초대 토큰. 실패하면 null */
export async function getInviteToken(): Promise<string | null> {
  if (!configured()) return null;
  const cached = readCache();
  if (cached) return cached.token;
  try {
    await ensureAnon();
    const { data, error } = await sb()
      .from("invites")
      .insert({ max_participants: MAX_PARTICIPANTS })
      .select("token, expires_at")
      .single();
    if (error) throw error;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* 저장 불가 환경은 매번 새로 만듦 */
    }
    return data.token as string;
  } catch (e) {
    console.warn("초대 링크 생성 실패 → 토큰 없는 링크 사용", e);
    return null;
  }
}

export type JoinResult = "ok" | "invalid" | "offline";

/** 받는 쪽: 초대 토큰 확인 */
export async function joinInvite(token: string): Promise<JoinResult> {
  if (!configured()) return "offline";
  try {
    await ensureAnon();
    await callFn<InviteJoinResponse>("invite-join", { token });
    return "ok";
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "INVITE_INVALID" || code === "INVITE_EXPIRED" || code === "INVITE_FULL") return "invalid";
    console.warn("초대 확인 실패 → 오프라인으로 계속", e);
    return "offline";
  }
}
