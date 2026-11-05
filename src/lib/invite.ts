/**
 * 가족 키 + 초대 링크(도전장) ↔ Supabase families / invites 연결.
 * - 가족(families)은 영구, 초대 링크(invites)는 7일짜리 입장권. 링크로 들어온 사람은 그 가족 구성원이 됨.
 * - 구성원 누구나 자기 가족 링크를 만들 수 있어서, 받은 사람이 다시 공유해도 같은 가족으로 묶임.
 * - 가족 암호 질문은 family_questions에 저장 (답은 저장하지 않음).
 * Supabase 설정(.env.local)이 없거나 연결이 안 되면 null/"offline"을 돌려주고, 화면은 기존(토큰 없는) 방식으로 동작합니다.
 */
import type { InviteJoinResponse } from "@shared/types";
import { callFn, configured, ensureAnon, sb } from "./supabase";

const KEY_INVITE = "mikki:invite:v2"; // v1 캐시는 가족 없는 초대라 버림
const KEY_FAMILY = "mikki:family";
/** 가족 단톡방에 공유될 수 있어 여러 명 입장 허용 (백엔드 허용 범위 1~200) */
const MAX_PARTICIPANTS = 10;
/** 만료 하루 전부터는 새 링크를 만듦 */
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

type Cached = { token: string; expires_at: string; family_id: string };

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* 저장 불가 환경은 매번 서버에서 다시 찾음 */
  }
}

/** 화면이 별명을 안 넘겨도 되게: AppState가 저장한 별명(mikki:nickname)을 그대로 씀 */
const storedNickname = () => (load("mikki:nickname") ?? "").slice(0, 20);

/**
 * 내 가족 id. 없으면 만듦.
 * shortcut: 여러 가족에 속해도 이 기기에선 하나(최근 들어간/만든 가족)만 씀, 가족 선택 화면이 생기면 목록으로 바꿀 것.
 */
async function myFamilyId(nickname: string): Promise<string> {
  const cached = load(KEY_FAMILY);
  if (cached) return cached;
  await ensureAnon();
  const { data: rows, error } = await sb().from("family_members").select("family_id").order("joined_at").limit(1);
  if (error) throw error;
  let fid = rows[0]?.family_id as string | undefined;
  if (!fid) {
    const { data, error: e2 } = await sb().rpc("create_family", { p_nickname: nickname });
    if (e2) throw e2;
    fid = data as string;
  }
  save(KEY_FAMILY, fid);
  return fid;
}

/** 보내는 쪽: 공유할 가족 초대 토큰. 실패하면 null */
export async function getInviteToken(nickname = storedNickname()): Promise<string | null> {
  if (!configured()) return null;
  try {
    const fid = await myFamilyId(nickname);
    const c = JSON.parse(load(KEY_INVITE) ?? "null") as Cached | null;
    if (c?.token && c.family_id === fid && new Date(c.expires_at).getTime() - Date.now() > RENEW_BEFORE_MS) return c.token;
    const { data, error } = await sb()
      .from("invites")
      .insert({ max_participants: MAX_PARTICIPANTS, family_id: fid, inviter_name: nickname.slice(0, 20) })
      .select("token, expires_at, family_id")
      .single();
    if (error) throw error;
    save(KEY_INVITE, JSON.stringify(data));
    return data.token as string;
  } catch (e) {
    console.warn("초대 링크 생성 실패 → 토큰 없는 링크 사용", e);
    return null;
  }
}

/** 가족 공유 링크: 들어온 사람이 이 가족으로 묶이는 도전장 링크. 오프라인이면 안내 화면 링크 */
export async function familyShareUrl(origin: string): Promise<string> {
  const name = storedNickname();
  const token = await getInviteToken(name);
  return token ? `${origin}/challenge?invite=${token}&from=${encodeURIComponent(name || "가족")}` : `${origin}/family-code/guide`;
}

/** 가족 암호 질문을 가족에 저장 (같은 질문이 이미 있으면 그대로). 실패해도 화면 흐름은 계속 */
export async function saveFamilyQuestion(question: string, nickname = storedNickname()): Promise<void> {
  if (!configured() || !question) return;
  try {
    const fid = await myFamilyId(nickname);
    const { data, error } = await sb().from("family_questions").select("id").eq("family_id", fid).eq("question", question).limit(1);
    if (error) throw error;
    if (data.length) return;
    const { error: e2 } = await sb().from("family_questions").insert({ family_id: fid, question });
    if (e2) throw e2;
  } catch (e) {
    console.warn("가족 질문 저장 실패", e);
  }
}

/** 우리 가족 암호 질문 목록 (최신순). 가족이 없거나 오프라인이면 null */
export async function familyQuestions(): Promise<{ id: string; question: string; created_at: string }[] | null> {
  const fid = configured() ? load(KEY_FAMILY) : null;
  if (!fid) return null;
  try {
    await ensureAnon();
    const { data, error } = await sb()
      .from("family_questions")
      .select("id, question, created_at")
      .eq("family_id", fid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn("가족 질문 불러오기 실패", e);
    return null;
  }
}

/** 연결된 가족 수 (나 포함). 가족이 아직 없거나 오프라인이면 null — 가족을 새로 만들지는 않음 */
export async function familySize(): Promise<number | null> {
  const fid = configured() ? load(KEY_FAMILY) : null;
  if (!fid) return null;
  try {
    await ensureAnon();
    const { count, error } = await sb().from("family_members").select("user_id", { count: "exact", head: true }).eq("family_id", fid);
    if (error) throw error;
    return count;
  } catch {
    return null;
  }
}

/** 이 가족에게 내 연습 결과를 보여줄지 (가족별 동의, 기본 꺼짐). 성공 여부 반환 */
export async function setShareResults(share: boolean): Promise<boolean> {
  const fid = configured() ? load(KEY_FAMILY) : null;
  if (!fid) return false;
  try {
    await ensureAnon();
    const { data: me } = await sb().auth.getUser();
    const { error } = await sb().from("family_members").update({ share_results: share }).eq("family_id", fid).eq("user_id", me.user!.id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("공유 설정 실패", e);
    return false;
  }
}

export type FamilyMemberSummary = {
  user_id: string;
  nickname: string;
  is_me: boolean;
  share_results: boolean;
  joined_at: string;
  /** 공유를 끈 구성원은 아래가 null */
  record_count: number | null;
  safe_count: number | null;
  last_at: string | null;
  recent: { kind: "quiz" | "challenge" | "training"; title: string; safe: boolean | null; score: number | null; total: number | null; created_at: string }[] | null;
};

/** 보호자 화면용: 가족 구성원별 연습 요약. 가족이 없거나 오프라인이면 null */
export async function familyOverview(): Promise<FamilyMemberSummary[] | null> {
  const fid = configured() ? load(KEY_FAMILY) : null;
  if (!fid) return null;
  try {
    await ensureAnon();
    const { data, error } = await sb().rpc("family_overview", { p_family: fid });
    if (error) throw error;
    return data as FamilyMemberSummary[];
  } catch (e) {
    console.warn("가족 요약 불러오기 실패", e);
    return null;
  }
}

export type JoinResult = "ok" | "invalid" | "offline";

/** 받는 쪽: 초대 토큰 확인. 가족 링크면 그 가족 구성원으로 등록되고, 이 기기의 가족으로 기억 */
export async function joinInvite(token: string, nickname = storedNickname()): Promise<JoinResult> {
  if (!configured()) return "offline";
  try {
    await ensureAnon();
    const res = await callFn<InviteJoinResponse>("invite-join", { token, nickname });
    const fid = res.invite.family_id;
    if (fid) {
      save(KEY_FAMILY, fid);
      // 예전에 이름 없이 들어온 구성원이면 이번 별명으로 채움 (이미 이름이 있으면 그대로)
      const { data: me } = await sb().auth.getUser();
      if (nickname && me.user) await sb().from("family_members").update({ nickname }).eq("family_id", fid).eq("user_id", me.user.id).eq("nickname", "");
    }
    return "ok";
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "INVITE_INVALID" || code === "INVITE_EXPIRED" || code === "INVITE_FULL") return "invalid";
    console.warn("초대 확인 실패 → 오프라인으로 계속", e);
    return "offline";
  }
}
