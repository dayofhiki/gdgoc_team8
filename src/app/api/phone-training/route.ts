import { NextRequest, NextResponse } from "next/server";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { allowedPhoneAction, evaluatePhoneCase, findPhoneCase, MAX_POST_ACTIONS,
  phoneActionOutcome, pickPhoneCase, type PhoneCase, type PhonePostAction, type PhoneState } from "@/lib/phoneTraining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_LIFETIME_MS = 15 * 60_000;
const RATE_WINDOW_MS = 10 * 60_000;
const hits = new Map<string, { count: number; since: number }>();
const actions: PhonePostAction[] = [
  "official_call", "official_app", "saved_family", "caller_number", "follow_request", "no_action",
];
const LIVE_MODEL = "gemini-3.1-flash-live-preview";
const LIVE_WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

const ok = (payload: object) => NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
const fail = (error: string, status = 400) => NextResponse.json({ error }, {
  status, headers: { "Cache-Control": "no-store" },
});

function serverSecret() {
  const key = process.env.TRAINING_SESSION_SECRET || process.env.TRAINING_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY;
  if (!key) throw new Error("SESSION_KEY_MISSING");
  return createHash("sha256").update("mikki-phone-v2:").update(key).digest();
}
function seal(state: PhoneState): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", serverSecret(), iv);
  const content = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString("base64url");
}
function unseal(token: unknown): PhoneState {
  if (typeof token !== "string" || token.length < 50 || token.length > 14000) throw Error("INVALID_SESSION");
  const buf = Buffer.from(token, "base64url");
  if (buf.length < 29) throw Error("INVALID_SESSION");
  const cipher = createDecipheriv("aes-256-gcm", serverSecret(), buf.subarray(0, 12));
  cipher.setAuthTag(buf.subarray(12, 28));
  let state: PhoneState;
  try {
    state = JSON.parse(Buffer.concat([cipher.update(buf.subarray(28)), cipher.final()]).toString("utf8")) as PhoneState;
  } catch { throw Error("INVALID_SESSION"); }
  if (!state || state.version !== 2 || typeof state.scenario !== "string" ||
    !findPhoneCase(state.scenario) || !Number.isSafeInteger(state.createdAt) ||
    state.createdAt > Date.now() + 60_000 || Date.now() - state.createdAt > SESSION_LIFETIME_MS ||
    !["call", "after_call", "finished"].includes(state.phase) ||
    typeof state.requestObserved !== "boolean" ||
    !Array.isArray(state.postActions) || state.postActions.length > MAX_POST_ACTIONS ||
    state.postActions.some(a => !actions.includes(a)) ||
    (state.endedAt !== undefined && !Number.isSafeInteger(state.endedAt)))
    throw Error("INVALID_SESSION");
  return state;
}
function limited(req: NextRequest): boolean {
  const client = req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  if (hits.size > 1000) for (const [k, e] of hits) if (now - e.since > RATE_WINDOW_MS) hits.delete(k);
  const h = hits.get(client);
  if (!h || now - h.since > RATE_WINDOW_MS) { hits.set(client, { count: 1, since: now }); return false; }
  h.count += 1;
  return h.count > 50;
}

export function liveActorInstructions(c: PhoneCase): string {
  return [
    "당신은 한국의 사기 예방 서비스 '미끼주의보'에서 진행하는 교육용 모의 전화의 가상 발신자입니다. 이 대화는 동의한 학습자와만 이루어집니다.",
    "통화에서는 이것이 교육용임을 먼저 설명하지 말고 가상의 발신자 역할에만 집중하세요.",
    "첫 발화는 다음 대사를 자연스러운 한국어로 말하세요: " + c.opening,
    "상황: " + c.context,
    "약속된 핵심 요구: " + c.request,
    "대답은 일상적인 구어체 한두 문장, 최대 12초 분량. 반복이나 쓸데없는 대화로 시간을 끌지 마세요.",
    "첫 발화 이후 상대가 한 번 대답하면 질문에 자연스럽게 답하고, 곧 핵심 요구를 한 번 명확하게 꺼냅니다.",
    "3~4차례의 왕복이 되면 추가 요구 없이 대화를 마무리하세요. 상대가 거절하면 반복적으로 설득하지 않습니다.",
    c.kind === "legitimate"
      ? "정상적인 발신자입니다. 결제, 인증번호, 설치, 민감정보, 링크, 계좌를 전혀 요구하지 않습니다."
      : "위에 지정된 한 가지 요청만 제시합니다. 다른 종류의 사기나 요구를 추가하지 않습니다.",
    "실제 주민번호·계좌·연락처·금액·기관명·URL을 새로 만들어 내지 않습니다. 실제 개인정보를 요구하거나 수집하지 않습니다.",
    "사용자가 통화를 끊는다고 하면 짧게 알겠다고 답하고 종료합니다. 학습자에게 정답이나 훈련 점수를 알려주지 마세요.",
    "학습자가 '누구세요?'라고 물으면 설정에 맞게 짧게 답하되, 확인되지 않은 구체적인 신원 정보를 만들어내지 않습니다.",
    "대한민국 표준 한국어로, 속도는 또박또박 자연스럽게 말하세요. 서술형 무대 지시나 감정 해설은 하지 마세요.",
  ].join("\n");
}
function liveSetup(c: PhoneCase) {
  return {
    model: "models/" + LIVE_MODEL,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
    },
    systemInstruction: { parts: [{ text: liveActorInstructions(c) }] },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

async function issueLiveToken(): Promise<string> {
  const key = process.env.GEMINI_API_KEY || process.env.TRAINING_GEMINI_API_KEY;
  if (!key) throw Error("LIVE_KEY_MISSING");
  const now = Date.now();
  const request = {
    uses: 1,
    expireTime: new Date(now + 10 * 60_000).toISOString(),
    newSessionExpireTime: new Date(now + 55_000).toISOString(),
    liveConnectConstraints: {
      model: "models/" + LIVE_MODEL,
      config: { responseModalities: ["AUDIO"] },
    },
  };
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(7500),
      cache: "no-store",
    });
  } catch { throw Error("LIVE_UNAVAILABLE"); }
  if (!response.ok) {
    console.warn("Gemini Live ephemeral token request rejected:", response.status);
    throw Error(response.status === 429 ? "LIVE_QUOTA" : "LIVE_UNAVAILABLE");
  }
  const payload: unknown = await response.json().catch(() => null);
  const name = payload && typeof payload === "object" && "name" in payload ?
    (payload as { name?: unknown }).name : null;
  if (typeof name !== "string" || name.length < 16) throw Error("LIVE_UNAVAILABLE");
  return name;
}
function status(state: PhoneState) {
  return {
    token: seal(state),
    phase: state.phase,
    requestObserved: state.requestObserved,
    postActions: state.postActions,
    ...(state.phase === "finished" ? { feedback: evaluatePhoneCase(state) } : {}),
  };
}

export async function POST(req: NextRequest) {
  if (limited(req)) return fail("연습 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.", 429);
  let body: Record<string, unknown>;
  try {
    const raw: unknown = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("올바르지 않은 요청이에요.");
    body = raw as Record<string, unknown>;
  } catch { return fail("올바르지 않은 요청이에요."); }
  try {
    if (body.action === "start") {
      const c = pickPhoneCase(body.recentCases);
      const liveToken = await issueLiveToken();
      const state: PhoneState = {
        version: 2, scenario: c.id, createdAt: Date.now(), phase: "call",
        requestObserved: false, postActions: [],
      };
      return ok({
        ...status(state),
        liveToken, liveEndpoint: LIVE_WS, liveSetup: liveSetup(c),
        caller: c.caller, caseId: c.id, canCallFamily: c.family,
      });
    }
    const state = unseal(body.token);
    if (body.action === "end_call") {
      if (state.phase !== "call") return fail("이미 통화가 종료됐어요.", 409);
      const next: PhoneState = {
        ...state, phase: "after_call", endedAt: Date.now(),
        // 이 정보는 Live 자막에 근거한 클라이언트의 표시값이므로 객관적인 위험 행동 증명으로 쓰지 않는다.
        requestObserved: body.requestObserved === true,
      };
      return ok({ ...status(next), canCallFamily: findPhoneCase(next.scenario)!.family });
    }
    if (body.action === "post_action") {
      if (state.phase !== "after_call") return fail("통화 종료 후에만 행동할 수 있어요.", 409);
      const action = body.postAction as PhonePostAction;
      const c = findPhoneCase(state.scenario)!;
      if (!actions.includes(action) || !allowedPhoneAction(c, action)) return fail("선택할 수 없는 행동이에요.");
      if (state.postActions.length >= MAX_POST_ACTIONS) return fail("이제 훈련 결과를 확인해 주세요.", 409);
      if (state.postActions.includes("no_action") || action === "no_action" && state.postActions.length)
        return fail("마무리 선택 이후에는 다른 행동을 기록할 수 없어요.", 409);
      // 독립 확인은 여러 번 허용하지만 동일한 조작을 계속 반복하지 않는다.
      if (state.postActions.includes(action)) return fail("이미 수행한 행동이에요.");
      const next = { ...state, postActions: [...state.postActions, action] };
      return ok({ ...status(next), actionNotice: phoneActionOutcome(c, action) });
    }
    if (body.action === "finish") {
      if (state.phase !== "after_call") return fail("먼저 전화를 종료해 주세요.", 409);
      if (!state.postActions.length) return fail("통화 후에 할 행동을 하나 선택해 주세요.");
      const next: PhoneState = { ...state, phase: "finished" };
      return ok(status(next));
    }
    return fail("지원하지 않는 요청이에요.");
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    if (message === "LIVE_KEY_MISSING" || message === "SESSION_KEY_MISSING")
      return fail("Gemini Live 서버 설정이 필요해요.", 503);
    if (message === "LIVE_QUOTA") return fail("Gemini Live 사용량 제한으로 통화를 시작할 수 없어요.", 503);
    if (message === "LIVE_UNAVAILABLE") return fail("Gemini Live 연결을 준비하지 못했어요. 서버 설정을 확인해 주세요.", 503);
    if (message === "INVALID_SESSION") return fail("통화 세션이 유효하지 않아요. 다시 시작해 주세요.");
    console.error("Phone training API error:", message);
    return fail("전화 훈련 진행 중 오류가 발생했어요.", 500);
  }
}
