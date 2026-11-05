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

// 동시에 여러 번 불려도(StrictMode 이중 effect, 여러 화면) 익명 계정은 하나만 만들도록 진행 중인 로그인을 공유
let signingIn: Promise<void> | null = null;
export function ensureAnon(): Promise<void> {
  signingIn ??= (async () => {
    const a = auth();
    await a.authStateReady();
    if (!a.currentUser) await signInAnonymously(a);
  })().catch((e) => {
    signingIn = null; // 실패하면 다음 호출에서 다시 시도
    throw e;
  });
  return signingIn;
}

// Cloud Function `backend` (functions/src/index.ts와 같은 리전)
const BACKEND_URL = `https://asia-northeast3-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/backend`;

// 백엔드 호출. 실패 시 Error.message = 서버의 error.code (예: "INVITE_EXPIRED")
export async function callFn<Res>(action: string, body: object = {}): Promise<Res> {
  await ensureAnon();
  const token = await auth().currentUser!.getIdToken();
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, action }),
  });
  const data = await res.json().catch(() => null);
  if (res.ok) return data as Res;
  throw new Error((data as ApiError | null)?.error?.code ?? "INTERNAL");
}
