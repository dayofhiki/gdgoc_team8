/**
 * Cloud Function `backend`: 예전 Supabase(DB 함수 + Edge Function) 자리.
 * 브라우저는 { action, ...body } + Authorization: Bearer <Firebase ID 토큰>으로 POST.
 * 실패 응답은 { error: { code, message } }. Firebase 안에서 돌아서 서비스 계정 키가 필요 없음.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { ApiFail, runAction } from "./family.ts";

initializeApp();

// cors: 로그인은 쿠키가 아니라 Bearer 토큰이라 출처를 열어도 토큰 없이는 아무것도 못 함
export const backend = onRequest({ region: "asia-northeast3", cors: true }, async (req, res) => {
  const fail = (status: number, code: string, message = code) => void res.status(status).json({ error: { code, message } });
  if (req.method !== "POST") return fail(405, "BAD_REQUEST", "POST only");
  const token = req.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return fail(401, "UNAUTHORIZED", "로그인이 필요합니다");
  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(token)).uid;
  } catch {
    return fail(401, "UNAUTHORIZED", "로그인이 필요합니다");
  }
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object" || typeof body.action !== "string") return fail(400, "BAD_REQUEST", "action이 필요합니다");
  try {
    res.json(await runAction(getFirestore(), uid, body.action, body));
  } catch (e) {
    if (e instanceof ApiFail) return fail(e.status, e.code);
    console.error("backend", body.action, e);
    fail(500, "INTERNAL", "서버 오류");
  }
});
