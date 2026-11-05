import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type FamilyCode = { question: string; answer: string };
type SharedCode = { type: "share"; code: FamilyCode; invite: string | null; expiresAt: number };
type SavedCode = { type: "saved"; code: FamilyCode; owner: string };
type Envelope = SharedCode | SavedCode;

export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeFamilyCode(input: unknown): FamilyCode | null {
  if (!input || typeof input !== "object") return null;
  const { question, answer } = input as Partial<FamilyCode>;
  if (typeof question !== "string" || typeof answer !== "string") return null;
  const normalized = { question: question.trim(), answer: answer.trim() };
  if (!normalized.question || normalized.question.length > 60 || !normalized.answer || normalized.answer.length > 20) return null;
  return normalized;
}

const key = (secret: string) => createHash("sha256").update("mikki-family-code-v1:").update(secret).digest();

export function sealFamilyCode(envelope: Envelope, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(envelope), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function openFamilyCode(token: string, secret: string, uid: string, now = Date.now()): Envelope | null {
  if (!/^[a-zA-Z0-9_-]{40,1600}$/.test(token)) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString()) as Envelope;
    if (!normalizeFamilyCode(value.code)) return null;
    if (value.type === "saved") return value.owner === uid ? value : null;
    return value.type === "share" && value.expiresAt > now ? value : null;
  } catch {
    return null;
  }
}
