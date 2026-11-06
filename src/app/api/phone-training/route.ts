import { NextRequest, NextResponse } from "next/server";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { complete, providers, type Msg } from "@/server/llm";
import { detectPii } from "@/server/pii";
import { evaluatePhoneCase, findPhoneCase, MAX_PHONE_TURNS, pickPhoneCase,
  type PhoneDecision, type PhoneLine, type PhoneState } from "@/lib/phoneTraining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AGE_MS = 20 * 60_000;
const RATE_WINDOW_MS = 10 * 60_000;
const hits = new Map<string, { since: number; count: number }>();
const decisions: PhoneDecision[] = ["hangup", "official", "family", "sender", "comply"];
const ok = (payload: object) => NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
const fail = (message: string, status = 400) => NextResponse.json(
  { error: message }, { status, headers: { "Cache-Control": "no-store" } },
);

function sessionKey(): Buffer {
  const raw = process.env.TRAINING_SESSION_SECRET || process.env.TRAINING_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!raw) throw new Error("PHONE_SESSION_KEY_MISSING");
  return createHash("sha256").update("mikki-voice-session-v1:").update(raw).digest();
}

function seal(state: PhoneState): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
function unseal(token: unknown): PhoneState {
  if (typeof token !== "string" || token.length < 40 || token.length > 12000) throw Error("INVALID_SESSION");
  const data = Buffer.from(token, "base64url");
  if (data.length < 29) throw Error("INVALID_SESSION");
  const dec = createDecipheriv("aes-256-gcm", sessionKey(), data.subarray(0, 12));
  dec.setAuthTag(data.subarray(12, 28));
  let state: PhoneState;
  try {
    state = JSON.parse(Buffer.concat([dec.update(data.subarray(28)), dec.final()]).toString("utf8")) as PhoneState;
  } catch { throw Error("INVALID_SESSION"); }
  const c = typeof state?.scenario === "string" ? findPhoneCase(state.scenario) : undefined;
  if (!c || state.version !== 1 || !Number.isSafeInteger(state.createdAt) ||
    state.createdAt > Date.now() + 60_000 || Date.now() - state.createdAt > MAX_AGE_MS ||
    !Number.isSafeInteger(state.turns) || state.turns < 0 || state.turns > MAX_PHONE_TURNS ||
    typeof state.riskPresented !== "boolean" || typeof state.closed !== "boolean" ||
    !Array.isArray(state.messages) || state.messages.length > MAX_PHONE_TURNS * 2 + 1 ||
    state.messages.some(m => !m || !["caller", "me"].includes(m.actor) || typeof m.text !== "string" || m.text.length > 300) ||
    (state.decision && !decisions.includes(state.decision))) throw Error("INVALID_SESSION");
  return state;
}
function limited(req: NextRequest): boolean {
  const key = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  if (hits.size > 700) for (const [ip, e] of hits) if (now - e.since > RATE_WINDOW_MS) hits.delete(ip);
  const h = hits.get(key);
  if (!h || now - h.since > RATE_WINDOW_MS) { hits.set(key, { since: now, count: 1 }); return false; }
  h.count++;
  return h.count > 80;
}

function sanitizeSpeech(text: string): string {
  const t = text.replace(/https?:\/\/\S+/gi, "가상 안내").replace(/(?:\+?82|0)1[016789][\s-]?\d{3,4}[\s-]?\d{4}/g, "가상 번호").trim();
  if (t.length < 4 || t.length > 215 || /(?:실제|가상|연습|AI)\s*(?:훈련|시나리오|상황|모델)|저는 인공지능/.test(t))
    return "";
  return t;
}

async function generateCallerReply(state: PhoneState, userText: string): Promise<string> {
  const c = findPhoneCase(state.scenario)!;
  const due = state.turns === 1;
  const prompt = [
    "당신은 한국의 보이스피싱 예방 교육을 위한 '모의 통화' 속 통화 상대입니다. 실제 대상에게 전화를 걸지 않습니다.",
    "상대는 어르신일 수 있으므로 자연스러운 한국어 구어체로 한두 문장만 말합니다. 70자 안팎, 최대 125자.",
    "통화 상대 설정: " + c.context,
    "지금 통화 상대가 해야 할 일: " + (due ? "한 가지 핵심 요청을 짧게 전달하고 더 이상 내용을 늘리지 않는다." :
      state.turns >= 2 ? "사용자 질문에 짧게 답하거나 부탁을 한 번만 정리한다. 반복적으로 몰아붙이지 않는다." :
        "첫 질문에 답하고 배경을 한 가지만 설명한다. 요청은 아직 꺼내지 않는다."),
    "사용자의 질문이 구체적이면 먼저 답하되, 주어지지 않은 개인 사실, 계좌, 전화번호, 업체명, 실제 링크·인증번호는 지어내지 않습니다.",
    "상대에게 수사기관 접속 방법, 실제 피싱 준비 절차, 실제 금융 서비스의 운영법을 설명하지 않습니다.",
    "정답이나 안전 조언, 교육용 역할극 정체를 먼저 밝히지 마세요. 정체를 캐묻는다고 화내거나 위협하지 마세요.",
    "세부 사정은 오직 현재 사건만 따르세요. 긴 설명이나 똑같은 독촉을 반복하지 마세요.",
  ].join("\n");
  const history: Msg[] = state.messages.slice(-7).map(line => ({
    role: line.actor === "caller" ? "assistant" : "user", content: line.text,
  }));
  try {
    const available = providers();
    const geminiFirst = [...available.filter(p => p.name === "gemini"), ...available.filter(p => p.name !== "gemini")];
    const answer = await complete([
      { role: "system", content: prompt },
      ...history,
      { role: "user", content: userText },
    ], { maxTokens: 140, temperature: 0.75, budgetMs: 6800 }, { list: geminiFirst });
    const spoken = sanitizeSpeech(answer.value);
    if (due) {
      // 핵심 행동 요청은 검수된 문구로 고정한다. AI는 앞뒤 대화만 변화시킨다.
      // 한 통화에 여러 종류의 위험 행동이 섞이지 않도록 모델의 요구 문구는 사용하지 않는다.
      return c.request;
    }
    if (!spoken) return c.followup;
    if (c.risk !== "none" && state.turns === 0 &&
      /송금|이체|입금|인증번호|비밀번호|보호\s*계좌|그\s*번호로\s*(전화|연락)/.test(spoken))
      return c.followup;
    return spoken;
  } catch {
    return due ? c.request : c.followup;
  }
}
function result(state: PhoneState) {
  return {
    token: seal(state), closed: state.closed, turns: state.turns,
    riskPresented: state.riskPresented, messages: state.messages,
    feedback: state.decision ? evaluatePhoneCase(state) : undefined,
  };
}
function decide(state: PhoneState, decision: PhoneDecision) {
  const c = findPhoneCase(state.scenario)!;
  if (decision === "family" && !c.family) throw Error("INVALID_ACTION");
  return { ...state, decision, closed: true };
}

export async function POST(req: NextRequest) {
  if (limited(req)) return fail("연습 요청이 많아요. 잠시 후 다시 시도해 주세요.", 429);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error();
    body = parsed as Record<string, unknown>;
  } catch { return fail("요청 형식이 올바르지 않습니다."); }
  try {
    if (body.action === "start") {
      const c = pickPhoneCase(body.recentCases);
      const state: PhoneState = {
        version: 1, scenario: c.id, createdAt: Date.now(),
        turns: 0, riskPresented: false, closed: false,
        messages: [{ actor: "caller", text: c.opening }],
      };
      return ok({
        ...result(state),
        caller: c.caller,
        // 정체는 서버가 결과 단계까지 공개하지 않는다.
        canCallFamily: c.family,
        maxTurns: MAX_PHONE_TURNS,
        caseId: c.id, // 단순 반복 방지용이며 정답 정보가 아니다.
      });
    }
    const state = unseal(body.token);
    if (state.closed) return fail("이미 종료된 통화예요.", 409);
    if (body.action === "decide") {
      if (!decisions.includes(body.decision as PhoneDecision)) return fail("선택하지 않은 행동이에요.");
      return ok(result(decide(state, body.decision as PhoneDecision)));
    }
    if (body.action !== "turn") return fail("지원하지 않는 요청입니다.");
    if (typeof body.text !== "string" || body.text.trim().length < 1 || body.text.length > 240)
      return fail("말한 내용을 240자 이내로 입력해 주세요.");
    if (detectPii(body.text).length) return fail("실제 전화번호·계좌·주소·인증정보를 말하지 말아 주세요.");
    const utterance = body.text.trim();
    const next: PhoneState = {
      ...state, turns: state.turns + 1,
      messages: [...state.messages, { actor: "me", text: utterance } as PhoneLine],
    };
    if (/^(?:네|예|아니요|아니|그럼|저는|그냥|이제|오늘은)?\s*(?:전화를\s*)?(?:끊겠습니다|끊을게요|통화\s*(?:끝낼게요|끝내겠습니다))\.?$/.test(utterance)) {
      return ok(result(decide(next, "hangup")));
    }
    const reply = await generateCallerReply(state, utterance);
    next.messages.push({ actor: "caller", text: reply });
    if (state.turns >= 1) next.riskPresented = true;
    return ok({ ...result(next), maxTurns: MAX_PHONE_TURNS, remaining: MAX_PHONE_TURNS - next.turns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "PHONE_SESSION_KEY_MISSING") return fail("전화 연습 서버 설정이 필요해요.", 503);
    if (message === "INVALID_SESSION" || message === "INVALID_ACTION") return fail("통화 세션이 유효하지 않습니다.", 400);
    return fail("통화 중 문제가 발생했어요. 다시 시도해 주세요.", 500);
  }
}
