/**
 * 가족·초대·연습 기록 API. 브라우저는 { action, ...body } + Authorization: Bearer <Firebase ID 토큰>으로 POST.
 * 실패 응답은 { error: { code, message } } (예전 Edge Function과 같은 형식).
 */
import { NextResponse } from "next/server";
import { ApiFail, runAction } from "@/server/family";
import { adminAuth, adminDb } from "@/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, code: string, message = code) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return fail(401, "UNAUTHORIZED", "로그인이 필요합니다");
  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(token)).uid;
  } catch {
    return fail(401, "UNAUTHORIZED", "로그인이 필요합니다");
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || typeof body.action !== "string") return fail(400, "BAD_REQUEST", "action이 필요합니다");
  try {
    return NextResponse.json(await runAction(adminDb(), uid, body.action, body));
  } catch (e) {
    if (e instanceof ApiFail) return fail(e.status, e.code);
    console.error("backend", body.action, e);
    return fail(500, "INTERNAL", "서버 오류");
  }
}
