import { getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import type { ApiError } from "@/server/types";

/** .env.local이 없으면 서버 없이(오프라인) 동작 */
export const configured = () => Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

// 지연 생성: 빌드 시 서버 프리렌더에서 env 없이 import돼도 깨지지 않게
function auth(): Auth {
  const app = getApps()[0] ?? initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  return getAuth(app);
}

export async function ensureAnon(): Promise<void> {
  const a = auth();
  await a.authStateReady();
  if (!a.currentUser) await signInAnonymously(a);
}

// /api/backend 호출. 실패 시 Error.message = 서버의 error.code (예: "INVITE_EXPIRED")
export async function callFn<Res>(action: string, body: object = {}): Promise<Res> {
  await ensureAnon();
  const token = await auth().currentUser!.getIdToken();
  const res = await fetch("/api/backend", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, action }),
  });
  const data = await res.json().catch(() => null);
  if (res.ok) return data as Res;
  throw new Error((data as ApiError | null)?.error?.code ?? "INTERNAL");
}
