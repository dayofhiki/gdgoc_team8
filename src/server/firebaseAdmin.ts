// 서버 전용 Firebase Admin. 브라우저 번들에 들어가면 안 됨 (서비스 계정 키).
// - 운영: FIREBASE_SERVICE_ACCOUNT = 서비스 계정 JSON 한 줄
// - 로컬 emulator: FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST가 있으면 키 없이 projectId만으로 동작
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  return sa
    ? initializeApp({ credential: cert(JSON.parse(sa)) })
    : initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
}

export const adminDb = () => getFirestore(app());
export const adminAuth = () => getAuth(app());
