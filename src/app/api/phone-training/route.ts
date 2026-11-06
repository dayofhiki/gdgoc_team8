import { NextRequest, NextResponse } from "next/server";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { allowedPhoneAction, availablePhoneActions, evaluatePhoneCase, findPhoneCase, MAX_POST_ACTIONS, PHONE_REQUEST_ACTION,
  phoneActionOutcome, pickPhoneCase, type PhoneCase, type PhoneEndedBy, type PhonePostAction, type PhoneState } from "@/lib/phoneTraining";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_LIFETIME_MS = 15 * 60_000;
const RATE_WINDOW_MS = 10 * 60_000;
const hits = new Map<string, { count: number; since: number }>();
const actions: PhonePostAction[] = [
  "official_call", "official_app", "saved_family", "caller_number", "follow_request", "no_action",
];
const LIVE_MODEL = (process.env.GEMINI_LIVE_MODEL?.trim() || "gemini-3.1-flash-live-preview").replace(/^models\//, "");
const LIVE_WS_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.";
const LIVE_WS_METHOD = ".GenerativeService.BidiGenerateContentConstrained";

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
    (state.endedAt !== undefined && !Number.isSafeInteger(state.endedAt)) ||
    (state.endedBy !== undefined && !["user", "caller", "connection"].includes(state.endedBy)))
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

function liveActorInstructions(c: PhoneCase): string {
  return [
    "당신은 한국 보이스피싱 예방 훈련에 등장하는 가상의 전화 발신자입니다. 학습자가 동의한 가상 통화에만 참여합니다.",
    "훈련임을 먼저 밝히거나 교훈을 가르치지 않습니다. 실제 범죄의 현실적인 대화 패턴을 재현하되 개인정보·계좌·실제 URL을 만들거나 수집하지 않습니다.",
    "당신의 배역: " + c.context,
    "첫 발화는 자연스럽게 다음 내용으로 시작합니다: " + c.opening,
    "이번 통화에서 얻고 싶은 단 하나의 요구: " + c.request,
    "의심하거나 머뭇거리는 사용자에게 한 번 제시할 수 있는 상황별 설명: " + c.followup,
    c.kind === "fraud"
      ? "당신은 친절한 고객센터 직원이나 안전 교육 교사가 아닙니다. 사용자에게 목적을 숨기고 이득을 얻으려는 사칭자입니다. 상황에 따라 초조함, 조급함, 불쾌함, 권위를 내세움, 아쉬운 척하기 등을 자연스럽게 표현하세요. 무조건 공감하고 동의하지 마세요."
      : "이번 배역은 실제 정상적인 연락입니다. 무리하게 사기 요구를 만들지 말고 배송 또는 예약 용건만 처리합니다.",
    "상대가 '꺼져 그냥', '사기꾼이네', '안 해요'라고 말했을 때 자동으로 '알겠습니다, 종료하겠습니다'라고 응대하지 마세요.",
    c.kind === "fraud"
      ? "거절이나 짜증을 처음 받으면 상황에 맞는 짧은 반박 또는 한 번의 설득으로 반응하세요. 예: 카드 배송 사칭이면 '저한테 화내셔도 신청된 카드 처리까지 취소되는 건 아닌데요.'처럼 자기 주장을 유지합니다. 다만 사용자가 반복 거절하거나 확실하게 통화 종료를 요구하면, 말싸움을 지속하지 말고 당신이 먼저 끊을 수 있습니다."
      : "상대방이 무례하게 말하면 당황한 듯 짧게 용건을 마무리하세요. 불필요한 설득은 하지 않습니다.",
    "답변은 구어체 1~2문장, 대략 5~12초 이내로 하세요. 상담원처럼 의례적인 사과나 '걱정되시는 건 이해합니다'를 반복하지 않습니다. 대사·상황을 늘려놓지 않습니다.",
    "첫 답변 또는 늦어도 두 번째 답변에 핵심 요구를 짧게 제시합니다. 상대가 요구에 대한 질문을 하면 먼저 맥락에 맞게 답합니다.",
    "정상 고객센터처럼 '공식 번호로 확인해 보세요', '가족에게 문의하세요' 등의 올바른 대응을 선제 제안하지 않습니다. 다만 사용자의 독립 확인을 강압적으로 막을 필요는 없습니다.",
    "정해진 요청 이외 다른 사기 수법을 추가하지 않습니다. 실존 기관명, 전화번호, URL, 계좌번호, 인증번호 등 구체적 개인정보를 지어내지 않습니다.",
    "사용자가 실제 통화 종료를 명확하게 요구하거나, 당신이 더는 설득할 수 없다고 판단하거나, 용건이 자연스럽게 끝나면 당신이 먼저 통화를 끊을 수 있습니다.",
    "중요: 말로 '끊겠습니다'라고만 선언하고 기다리지 마세요. 발신자 입장에서 통화를 실제로 끝내기로 결정했다면, 필요한 마지막 한 문장을 먼저 음성으로 말하고 반드시 end_training_call 도구를 호출하세요.",
    "도구 end_training_call은 상대방에게 훈련 정답을 알려주는 기능이 아니라 가상 전화 연결을 실제 종료하는 기능입니다. 대화 중 아무 때나 반복해서 부르지 마세요.",
    "사용자가 단순히 욕하거나 한 번 거절했다는 이유만으로 즉시 도구를 호출하지 않습니다. 짧게 역할에 맞는 반응을 한 뒤, 명확한 종료 의사나 상황 종료가 확인되면 호출합니다.",
    "자극적인 욕설, 위협, 개인에 대한 모욕, 과도한 압박은 하지 않습니다. 그럼에도 누군가를 속이려는 발신자의 불편하고 진짜 같은 태도를 유지합니다.",
    "한국어로 자연스럽게 말하고 괄호 속 연출 지시나 무대 해설을 읽지 않습니다.",
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
    tools: [{
      functionDeclarations: [{
        name: "end_training_call",
        description: "가상 발신자가 먼저 실제 전화를 끊기로 최종 결정했을 때 호출합니다. 필요한 마지막 음성 발화를 먼저 완료하세요. 단순 불만이나 일회성 거절에는 호출하지 마세요.",
      }],
    }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

type LiveApiVersion = "v1alpha" | "v1beta";
type IssuedToken = { name: string; version: LiveApiVersion };
type ProviderTokenError = { status: number; reason: string; message: string };

function tokenErrorDetails(value: unknown): { reason: string; message: string } {
  if (!value || typeof value !== "object") return { reason: "UNKNOWN", message: "" };
  const err = "error" in value ? value.error : null;
  if (!err || typeof err !== "object") return { reason: "UNKNOWN", message: "" };
  const e = err as { status?: unknown; message?: unknown };
  const reason = typeof e.status === "string" ? e.status.slice(0, 48) : "UNKNOWN";
  const message = typeof e.message === "string"
    ? e.message.slice(0, 250).replace(/AIza[A-Za-z0-9_-]+/g, "[redacted-key]")
    : "";
  return { reason, message };
}
async function issueLiveToken(): Promise<IssuedToken> {
  // API 키는 항상 서버에서만 사용한다. 브라우저에는 1회용 임시 토큰만 넘긴다.
  const key = process.env.GEMINI_API_KEY || process.env.TRAINING_GEMINI_API_KEY;
  if (!key) throw Error("LIVE_KEY_MISSING");
  const now = Date.now();
  const request = {
    uses: 1,
    expireTime: new Date(now + 15 * 60_000).toISOString(),
    newSessionExpireTime: new Date(now + 60_000).toISOString(),
    // The SDK's liveConnectConstraints is converted to this shape on the wire.
    bidiGenerateContentSetup: {
      model: "models/" + LIVE_MODEL,
      generationConfig: { responseModalities: ["AUDIO"] },
    },
    fieldMask: "model,generationConfig.responseModalities",
  };
  let last: ProviderTokenError | null = null;
  // Prefer the SDK endpoint; only fall back if the endpoint is unavailable.
  for (const version of ["v1alpha", "v1beta"] as const) {
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/${version}/auth_tokens`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(9000),
        cache: "no-store",
      });
    } catch (err) {
      console.error("Live token request transport error", {
        version, error: err instanceof Error ? err.name : "UNKNOWN",
      });
      throw Error("LIVE_NETWORK");
    }
    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const name = body && typeof body === "object" && "name" in body ?
        (body as { name?: unknown }).name : null;
      if (typeof name !== "string" || !name.startsWith("auth_tokens/")) {
        console.error("Live token response missing expected token identifier", { version });
        throw Error("LIVE_TOKEN_FORMAT");
      }
      return { name, version };
    }
    const error = tokenErrorDetails(body);
    last = { status: response.status, ...error };
    // Never log credentials or the raw provider response body.
    console.error("Live token request rejected", { version, httpStatus: response.status, ...error });
    if (response.status !== 404 && response.status !== 405) break;
  }
  if (!last) throw Error("LIVE_UNAVAILABLE");
  if (last.status === 401) throw Error("LIVE_AUTH");
  if (last.status === 403) throw Error("LIVE_PERMISSION");
  if (last.status === 429 || last.reason === "RESOURCE_EXHAUSTED") throw Error("LIVE_QUOTA");
  if (last.status === 404) throw Error("LIVE_MODEL");
  if (last.status === 400) throw Error("LIVE_REQUEST");
  throw Error("LIVE_UNAVAILABLE");
}
function status(state: PhoneState) {
  return {
    token: seal(state),
    phase: state.phase,
    requestObserved: state.requestObserved,
    postActions: state.postActions,
    endedBy: state.endedBy,
    ...(state.phase === "after_call" ? {
      availableActions: availablePhoneActions(findPhoneCase(state.scenario)!, state.requestObserved),
      requestActionLabel: state.requestObserved ? PHONE_REQUEST_ACTION[findPhoneCase(state.scenario)!.risk] : undefined,
    } : {}),
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
      const live = await issueLiveToken();
      const state: PhoneState = {
        version: 2, scenario: c.id, createdAt: Date.now(), phase: "call",
        requestObserved: false, postActions: [],
      };
      return ok({
        ...status(state),
        liveToken: live.name,
        liveEndpoint: LIVE_WS_BASE + live.version + LIVE_WS_METHOD,
        liveSetup: liveSetup(c),
        caller: c.caller, caseId: c.id,
      });
    }
    const state = unseal(body.token);
    if (body.action === "end_call") {
      if (state.phase !== "call") return fail("이미 통화가 종료됐어요.", 409);
      const requestedBy = body.endedBy;
      if (requestedBy !== undefined && !["user", "caller", "connection"].includes(String(requestedBy)))
        return fail("통화 종료 사유가 올바르지 않아요.");
      const endedBy: PhoneEndedBy =
        requestedBy === "caller" || requestedBy === "connection" ? requestedBy : "user";
      const next: PhoneState = {
        ...state, phase: "after_call", endedAt: Date.now(), endedBy,
        // 이 정보는 Live 자막에 근거한 클라이언트의 표시값이므로 객관적인 위험 행동 증명으로 쓰지 않는다.
        requestObserved: body.requestObserved === true,
      };
      return ok(status(next));
    }
    if (body.action === "post_action") {
      if (state.phase !== "after_call") return fail("통화 종료 후에만 행동할 수 있어요.", 409);
      const action = body.postAction as PhonePostAction;
      const c = findPhoneCase(state.scenario)!;
      if (!actions.includes(action) || !allowedPhoneAction(c, action, state.requestObserved)) return fail("선택할 수 없는 행동이에요.");
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
      return fail("AI 피싱범 전화 훈련에 필요한 서버 API 키가 설정되지 않았어요. 관리자에게 문의해 주세요. (PHONE_KEY)", 503);
    if (message === "LIVE_AUTH")
      return fail("전화 훈련 API 키 인증에 실패했어요. 배포 서버의 API 키를 확인해 주세요. (PHONE_AUTH)", 503);
    if (message === "LIVE_PERMISSION")
      return fail("음성 모델을 사용할 권한이 없거나 API 키 제한에 걸렸어요. (PHONE_PERMISSION)", 503);
    if (message === "LIVE_QUOTA")
      return fail("AI 음성 통화 사용량 한도에 도달했어요. 잠시 후 다시 이용해 주세요. (PHONE_QUOTA)", 503);
    if (message === "LIVE_MODEL")
      return fail("현재 설정된 음성 모델을 찾을 수 없어요. 서버 모델 설정을 확인해 주세요. (PHONE_MODEL)", 503);
    if (message === "LIVE_REQUEST")
      return fail("AI 음성 연결 요청 형식이 거절됐어요. 서버에서 오류 내용을 확인해 주세요. (PHONE_REQUEST)", 503);
    if (message === "LIVE_TOKEN_FORMAT")
      return fail("AI 음성 서버가 올바른 임시 토큰을 반환하지 않았어요. (PHONE_TOKEN)", 503);
    if (message === "LIVE_NETWORK")
      return fail("음성 연결 서버에 접속할 수 없어요. 네트워크 상태를 확인해 주세요. (PHONE_NETWORK)", 503);
    if (message === "LIVE_UNAVAILABLE")
      return fail("AI 음성 서비스가 일시적으로 응답하지 않아요. (PHONE_UNAVAILABLE)", 503);
    if (message === "INVALID_SESSION") return fail("통화 세션이 유효하지 않아요. 다시 시작해 주세요.");
    console.error("Phone training API error:", message);
    return fail("전화 훈련 진행 중 오류가 발생했어요.", 500);
  }
}
