import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeFamilyCode, openFamilyCode, sealFamilyCode, SHARE_TTL_MS } from "@/server/familyCodeSeal";

export const runtime = "nodejs";

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function firebaseUser(idToken: string, apiKey: string): Promise<string | null> {
  const endpoint = new URL("https://identitytoolkit.googleapis.com/v1/accounts:lookup");
  endpoint.searchParams.set("key", apiKey);
  const result = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (result.status >= 500 || result.status === 429) throw new Error("AUTH_UNAVAILABLE");
  if (!result.ok) return null;
  const { users } = await result.json() as { users?: { localId?: string; disabled?: boolean }[] };
  const user = users?.[0];
  return user?.localId && !user.disabled ? user.localId : null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const secret = process.env.FAMILY_CODE_SECRET || process.env.TRAINING_SESSION_SECRET ||
    process.env.TRAINING_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY;
  if (!apiKey || !secret) return json({ error: "UNAVAILABLE" }, 503);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "BAD_REQUEST" }, 415);
  }
  const idToken = req.headers.get("authorization")?.match(/^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/)?.[1];
  if (!idToken || idToken.length > 4096) return json({ error: "LOGIN_REQUIRED" }, 401);

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 5000) return json({ error: "BAD_REQUEST" }, 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "BAD_REQUEST" }, 400);
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }

  try {
    const uid = await firebaseUser(idToken, apiKey);
    if (!uid) return json({ error: "LOGIN_REQUIRED" }, 401);
    if (body.action === "share") {
      const code = normalizeFamilyCode(body.code);
      if (!code) return json({ error: "BAD_REQUEST" }, 400);
      const invite = typeof body.invite === "string" && /^[a-f0-9]{64}$/.test(body.invite) ? body.invite : null;
      return json({ token: sealFamilyCode({ type: "share", code, invite, expiresAt: Date.now() + SHARE_TTL_MS }, secret) });
    }

    if (typeof body.token !== "string") return json({ error: "BAD_REQUEST" }, 400);
    const value = openFamilyCode(body.token, secret, uid);
    if (!value) return json({ error: "LINK_INVALID" }, 404);
    if (body.action === "read") return json({ code: value.code });
    if (body.action === "save" && value.type === "share") {
      const token = sealFamilyCode({ type: "saved", code: value.code, owner: uid }, secret);
      const id = createHash("sha256").update(body.token).digest("base64url");
      return json({ id, token, invite: value.invite });
    }
    return json({ error: "BAD_REQUEST" }, 400);
  } catch {
    return json({ error: "UNAVAILABLE" }, 503);
  }
}
