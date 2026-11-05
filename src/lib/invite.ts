/**
 * 가족 키 + 초대 링크(도전장) ↔ Firebase(Cloud Function backend, Firestore) 연결.
 * - 가족(families)은 영구, 초대 링크(invites)는 7일짜리 입장권. 링크로 들어온 사람은 그 가족 구성원이 됨.
 * - 구성원 누구나 자기 가족 링크를 만들 수 있어서, 받은 사람이 다시 공유해도 같은 가족으로 묶임.
 * - 가족 암호 질문은 가족별로 저장 (답은 저장하지 않음).
 * Firebase 설정(.env.local)이 없거나 연결이 안 되면 null/"offline"을 돌려주고, 화면은 기존(토큰 없는) 방식으로 동작합니다.
 */
import type { FamilyMemberSummary, InviteJoinResponse } from "@/server/types";
import { callFn, configured } from "./firebase";

export type { FamilyMemberSummary };

// v3 / v2: Supabase 시절 id 캐시는 Firebase에 없는 가족이라 버림
const KEY_INVITE = "mikki:invite:v3";
const KEY_FAMILY = "mikki:family:v2";
/** 가족 단톡방에 공유될 수 있어 여러 명 입장 허용 (백엔드 허용 범위 1~200) */
const MAX_PARTICIPANTS = 10;
/** 만료 하루 전부터는 새 링크를 만듦 */
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

type Cached = { token: string; expires_at: string; family_id: string };
type FamilyQuestion = { id: string; question: string; created_at: string };

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

function forget(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 저장 불가 환경은 버릴 것도 없음 */
  }
}

const isForbidden = (e: unknown) => e instanceof Error && e.message === "FORBIDDEN";

/**
 * 저장된 가족 id로 호출. FORBIDDEN = 이 계정이 그 가족 구성원이 아님(로그인 계정이 바뀜·가족 삭제 등)
 * → 저장값을 버려서 이 기기가 계속 실패 상태로 남지 않게 함.
 */
async function callFamily<Res>(action: string, fid: string, body: object = {}): Promise<Res> {
  try {
    return await callFn<Res>(action, { ...body, familyId: fid });
  } catch (e) {
    if (isForbidden(e)) {
      forget(KEY_FAMILY);
      forget(KEY_INVITE);
    }
    throw e;
  }
}

/** 가족을 만들 수 있는 호출용: FORBIDDEN이면 저장값을 버린 뒤 한 번 더 (서버에서 내 가족을 다시 찾거나 새로 만듦) */
async function retryForbidden<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isForbidden(e)) return fn();
    throw e;
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
  const { familyId: fid } = await callFn<{ familyId: string }>("myFamily", { nickname });
  save(KEY_FAMILY, fid);
  return fid;
}

/** 보내는 쪽: 공유할 가족 초대 토큰. 실패하면 null */
export async function getInviteToken(nickname = storedNickname()): Promise<string | null> {
  if (!configured()) return null;
  try {
    return await retryForbidden(async () => {
      const fid = await myFamilyId(nickname);
      const c = JSON.parse(load(KEY_INVITE) ?? "null") as Cached | null;
      if (c?.token && c.family_id === fid && new Date(c.expires_at).getTime() - Date.now() > RENEW_BEFORE_MS) return c.token;
      const data = await callFamily<Cached>("createInvite", fid, { maxParticipants: MAX_PARTICIPANTS, nickname: nickname.slice(0, 20) });
      save(KEY_INVITE, JSON.stringify(data));
      return data.token;
    });
  } catch (e) {
    console.warn("초대 링크 생성 실패 → 토큰 없는 링크 사용", e);
    return null;
  }
}

/** 가족 암호의 질문만 가족 목록에 저장한다. */
export async function saveFamilyQuestion(question: string, nickname = storedNickname()): Promise<void> {
  if (!configured() || !question) return;
  try {
    await retryForbidden(async () => callFamily("saveQuestion", await myFamilyId(nickname), { question }));
  } catch (e) {
    console.warn("가족 질문 저장 실패", e);
  }
}

/** 우리 가족 암호 질문 목록 (최신순). 가족이 없거나 오프라인이면 null */
export async function familyQuestions(): Promise<FamilyQuestion[] | null> {
  const fid = configured() ? load(KEY_FAMILY) : null;
  if (!fid) return null;
  try {
    return await callFamily<FamilyQuestion[]>("questions", fid);
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
    return (await callFamily<{ count: number }>("familySize", fid)).count;
  } catch {
    return null;
  }
}

/** 이 가족에게 내 연습 결과를 보여줄지 (가족별 동의, 기본 꺼짐). 성공 여부 반환 */
export async function setShareResults(share: boolean): Promise<boolean> {
  const fid = configured() ? load(KEY_FAMILY) : null;
  if (!fid) return false;
  try {
    const data = await callFamily<{ share_results: boolean }>("setShare", fid, { share });
    return data.share_results === share;
  } catch (e) {
    console.warn("공유 설정 실패", e);
    return false;
  }
}

/** 보호자 화면용: 가족 구성원별 연습 요약. 가족이 없거나 오프라인이면 null */
export async function familyOverview(): Promise<FamilyMemberSummary[] | null> {
  const fid = configured() ? load(KEY_FAMILY) : null;
  if (!fid) return null;
  try {
    return await callFamily<FamilyMemberSummary[]>("overview", fid);
  } catch (e) {
    console.warn("가족 요약 불러오기 실패", e);
    return null;
  }
}

/** 별명을 정하거나 바꾸면 가족 목록 이름도 맞춤 (초대 링크로 먼저 들어와 이름이 비어 있던 경우 포함). 실패해도 무시 */
export async function syncFamilyNickname(nickname: string): Promise<void> {
  const fid = configured() ? load(KEY_FAMILY) : null;
  if (!fid || !nickname) return;
  try {
    await callFamily("syncNickname", fid, { nickname: nickname.slice(0, 20) });
  } catch {
    /* 다음에 별명을 바꿀 때 다시 시도 */
  }
}

export type JoinResult = "ok" | "invalid" | "offline";

/** 받는 쪽: 초대 토큰 확인. 가족 링크면 그 가족 구성원으로 등록되고, 이 기기의 가족으로 기억 */
export async function joinInvite(token: string, nickname = storedNickname()): Promise<JoinResult> {
  if (!configured()) return "offline";
  try {
    const res = await callFn<InviteJoinResponse>("joinInvite", { token, nickname });
    if (res.invite.family_id) save(KEY_FAMILY, res.invite.family_id);
    return "ok";
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "INVITE_INVALID" || code === "INVITE_EXPIRED" || code === "INVITE_FULL") return "invalid";
    console.warn("초대 확인 실패 → 오프라인으로 계속", e);
    return "offline";
  }
}
