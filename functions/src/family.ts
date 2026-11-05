/**
 * 가족 · 초대 · 연습 기록 백엔드 (Firestore). Cloud Function `backend`(index.ts)가 로그인 확인 후 runAction을 부름.
 * Firestore Rules는 전부 거부 → 권한 검사는 전부 여기서 함 (예전 Supabase RLS + SQL 함수 자리).
 *
 * families/{fid}                  { createdBy, createdAt }
 * families/{fid}/members/{uid}    { nickname, shareResults, joinedAt }
 * families/{fid}/questions/{qid}  { question, createdBy, createdAt }
 * invites/{token}                 { familyId, inviterName, seniorName, difficulty, maxParticipants, participants[], createdBy, createdAt, expiresAt }
 * users/{uid}                     { familyId }   ← 처음 속한 가족 (다른 기기에서 내 가족 찾기용)
 * users/{uid}/records/{rid}       { kind, title, safe, score, total, detail, createdAt }
 */
import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";

// 응답 형식. functions/는 따로 배포돼서 src/server/types.ts를 import할 수 없음 → 바꾸면 그쪽도 같이 맞출 것
type ErrorCode = "BAD_REQUEST" | "FORBIDDEN" | "INVITE_INVALID" | "INVITE_EXPIRED" | "INVITE_FULL";
type InviteJoinResponse = {
  participant_id: string;
  invite: { senior_name: string; difficulty: string; family_id: string | null; inviter_name: string };
};
type FamilyMemberSummary = {
  user_id: string;
  nickname: string;
  is_me: boolean;
  share_results: boolean;
  joined_at: string;
  record_count: number | null;
  safe_count: number | null;
  last_at: string | null;
  recent: { kind: string; title: string; safe: boolean | null; score: number | null; total: number | null; created_at: string }[] | null;
};

export class ApiFail extends Error {
  status: number;
  code: ErrorCode;
  constructor(status: number, code: ErrorCode) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PARTICIPANTS = 200;
const KINDS = ["quiz", "challenge", "training"] as const;
// 문서 id로 쓰이는 값은 경로 조작("a/b")을 막기 위해 형식부터 확인
const ID_RE = /^[A-Za-z0-9]{1,40}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

type Body = Record<string, unknown>;

const bad = () => new ApiFail(400, "BAD_REQUEST");
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const iso = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : null);
const optInt = (v: unknown, min: number) => {
  if (v === undefined || v === null) return null;
  if (!Number.isInteger(v) || (v as number) < min) throw bad();
  return v as number;
};

/** 가족 구성원이 아니면 FORBIDDEN. 내 구성원 문서 ref를 돌려줌 */
async function memberRef(db: Firestore, familyId: unknown, uid: string): Promise<DocumentReference> {
  if (typeof familyId !== "string" || !ID_RE.test(familyId)) throw new ApiFail(403, "FORBIDDEN");
  const ref = db.doc(`families/${familyId}/members/${uid}`);
  if (!(await ref.get()).exists) throw new ApiFail(403, "FORBIDDEN");
  return ref;
}

export async function runAction(db: Firestore, uid: string, action: string, b: Body): Promise<unknown> {
  switch (action) {
    // 내 가족 id. 없으면 새로 만들고 나를 첫 구성원으로
    case "myFamily": {
      const user = db.doc(`users/${uid}`);
      const cur = (await user.get()).get("familyId");
      if (typeof cur === "string" && (await db.doc(`families/${cur}/members/${uid}`).get()).exists) return { familyId: cur };
      const fam = db.collection("families").doc();
      const now = FieldValue.serverTimestamp();
      await db.batch()
        .set(fam, { createdBy: uid, createdAt: now })
        .set(fam.collection("members").doc(uid), { nickname: text(b.nickname, 20), shareResults: false, joinedAt: now })
        .set(user, { familyId: fam.id }, { merge: true })
        .commit();
      return { familyId: fam.id };
    }

    // 가족 초대 링크(7일) 발급. 구성원만
    case "createInvite": {
      await memberRef(db, b.familyId, uid);
      const max = Number.isInteger(b.maxParticipants) ? Math.min(Math.max(b.maxParticipants as number, 1), MAX_PARTICIPANTS) : MAX_PARTICIPANTS;
      const token = (randomUUID() + randomUUID()).replaceAll("-", "");
      const expiresAt = Timestamp.fromMillis(Date.now() + INVITE_TTL_MS);
      await db.doc(`invites/${token}`).set({
        familyId: b.familyId, inviterName: text(b.nickname, 20), seniorName: "", difficulty: "normal",
        maxParticipants: max, participants: [], createdBy: uid, createdAt: FieldValue.serverTimestamp(), expiresAt,
      });
      return { token, expires_at: iso(expiresAt), family_id: b.familyId };
    }

    // 초대 입장: 만료 → 정원 → 참여 등록 → 가족 구성원 등록을 한 트랜잭션으로 (같은 사람 재입장은 그대로 통과)
    case "joinInvite": {
      const token = typeof b.token === "string" ? b.token : "";
      if (!TOKEN_RE.test(token)) throw new ApiFail(404, "INVITE_INVALID");
      const nickname = text(b.nickname, 20);
      return db.runTransaction(async (tx): Promise<InviteJoinResponse> => {
        const ref = db.doc(`invites/${token}`);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new ApiFail(404, "INVITE_INVALID");
        const inv = snap.data()!;
        if ((inv.expiresAt as Timestamp).toMillis() < Date.now()) throw new ApiFail(410, "INVITE_EXPIRED");
        const fid = (inv.familyId as string | null) ?? null;
        // 트랜잭션은 읽기를 쓰기보다 먼저 끝내야 함
        const mem = fid ? db.doc(`families/${fid}/members/${uid}`) : null;
        const user = db.doc(`users/${uid}`);
        const [memSnap, userSnap] = mem ? await Promise.all([tx.get(mem), tx.get(user)]) : [null, null];

        const parts = (inv.participants as string[] | undefined) ?? [];
        if (!parts.includes(uid)) {
          if (parts.length >= (inv.maxParticipants as number)) throw new ApiFail(409, "INVITE_FULL");
          tx.update(ref, { participants: FieldValue.arrayUnion(uid) });
        }
        if (mem && !memSnap!.exists) tx.set(mem, { nickname, shareResults: false, joinedAt: FieldValue.serverTimestamp() });
        if (fid && !userSnap!.get("familyId")) tx.set(user, { familyId: fid }, { merge: true });
        return {
          participant_id: uid,
          invite: { senior_name: inv.seniorName ?? "", difficulty: inv.difficulty ?? "normal", family_id: fid, inviter_name: inv.inviterName ?? "" },
        };
      });
    }

    // 가족 암호 질문 저장 (같은 질문이 있으면 그대로). 답은 저장하지 않음
    case "saveQuestion": {
      await memberRef(db, b.familyId, uid);
      const question = text(b.question, 60);
      if (!question) throw bad();
      const col = db.collection(`families/${b.familyId}/questions`);
      if ((await col.where("question", "==", question).limit(1).get()).empty) {
        await col.add({ question, createdBy: uid, createdAt: FieldValue.serverTimestamp() });
      }
      return {};
    }

    case "questions": {
      await memberRef(db, b.familyId, uid);
      const snap = await db.collection(`families/${b.familyId}/questions`).orderBy("createdAt", "desc").get();
      return snap.docs.map((d) => ({ id: d.id, question: d.get("question") as string, created_at: iso(d.get("createdAt")) }));
    }

    case "familySize": {
      await memberRef(db, b.familyId, uid);
      return { count: (await db.collection(`families/${b.familyId}/members`).count().get()).data().count };
    }

    // 이 가족에게 내 연습 결과를 보여줄지 (가족별 동의, 기본 꺼짐)
    case "setShare": {
      if (typeof b.share !== "boolean") throw bad();
      const ref = await memberRef(db, b.familyId, uid);
      await ref.update({ shareResults: b.share });
      return { share_results: b.share };
    }

    case "syncNickname": {
      const nickname = text(b.nickname, 20);
      if (!nickname) throw bad();
      const ref = await memberRef(db, b.familyId, uid);
      await ref.update({ nickname });
      return {};
    }

    // 보호자 화면용 구성원별 요약. 공유를 끈 사람은 이름만 (기록 필드는 null)
    case "overview": {
      await memberRef(db, b.familyId, uid);
      const members = await db.collection(`families/${b.familyId}/members`).orderBy("joinedAt").get();
      return Promise.all(members.docs.map(async (m): Promise<FamilyMemberSummary> => {
        const share = m.get("shareResults") === true;
        const base = { user_id: m.id, nickname: (m.get("nickname") as string) ?? "", is_me: m.id === uid, share_results: share, joined_at: iso(m.get("joinedAt"))! };
        if (!share && m.id !== uid) return { ...base, record_count: null, safe_count: null, last_at: null, recent: null };
        const col = db.collection(`users/${m.id}/records`);
        const [all, safe, recent] = await Promise.all([
          col.count().get(),
          col.where("safe", "==", true).count().get(),
          col.orderBy("createdAt", "desc").limit(5).get(),
        ]);
        return {
          ...base,
          record_count: all.data().count,
          safe_count: safe.data().count,
          last_at: iso(recent.docs[0]?.get("createdAt")),
          recent: recent.docs.map((r) => ({
            kind: r.get("kind"), title: r.get("title"), safe: r.get("safe"), score: r.get("score"), total: r.get("total"), created_at: iso(r.get("createdAt"))!,
          })),
        };
      }));
    }

    // 연습 결과 요약 저장 (대화 원문은 저장하지 않음)
    case "saveRecord": {
      if (!KINDS.includes(b.kind as (typeof KINDS)[number])) throw bad();
      if (b.safe !== undefined && b.safe !== null && typeof b.safe !== "boolean") throw bad();
      const score = optInt(b.score, 0);
      const total = optInt(b.total, 1);
      if (score !== null && total !== null && score > total) throw bad();
      const detail = b.detail ?? {};
      if (typeof detail !== "object" || Array.isArray(detail) || JSON.stringify(detail).length > 2000) throw bad();
      await db.collection(`users/${uid}/records`).add({
        kind: b.kind, title: text(b.title, 60), safe: b.safe ?? null, score, total, detail, createdAt: FieldValue.serverTimestamp(),
      });
      return {};
    }

    default:
      throw bad();
  }
}
