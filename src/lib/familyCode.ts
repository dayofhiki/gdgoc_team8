import { currentFirebaseUser, ensureAnon } from "./firebase";
import { familyCodeUrl } from "./share";
import type { FamilyCode } from "../server/familyCodeSeal";

export type { FamilyCode };
type SavedCode = { id: string; token: string };

async function request<Result>(body: object): Promise<Result> {
  const user = await currentFirebaseUser();
  if (!user) throw new Error("LOGIN_REQUIRED");
  const response = await fetch("/api/family-code", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + await user.getIdToken() },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "UNAVAILABLE");
  return data as Result;
}

export async function prepareFamilyCodeLink(origin: string, code: FamilyCode, invite: string | null): Promise<string> {
  await ensureAnon();
  const { token } = await request<{ token: string }>({ action: "share", code, invite });
  return familyCodeUrl(origin, token);
}

export async function readFamilyCode(token: string): Promise<FamilyCode> {
  return (await request<{ code: FamilyCode }>({ action: "read", token })).code;
}

function storageKey(uid: string) {
  return "mikki:saved-family-codes:v1:" + uid;
}

export function savedFamilyCodes(uid: string): SavedCode[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey(uid)) ?? "[]");
    if (Array.isArray(stored)) return stored.filter((item): item is SavedCode =>
      item && typeof item.id === "string" && typeof item.token === "string").slice(0, 10);
  } catch {
    // A disabled or corrupt storage starts with an empty list.
  }
  return [];
}

export async function storeFamilyCode(uid: string, token: string): Promise<string | null> {
  const { id, token: saved, invite } = await request<SavedCode & { invite: string | null }>({ action: "save", token });
  const updated = [{ id, token: saved }, ...savedFamilyCodes(uid).filter(item => item.id !== id)].slice(0, 10);
  localStorage.setItem(storageKey(uid), JSON.stringify(updated));
  return invite;
}
