import { generateReply, nextStage } from "../_shared/ai.ts";
import { handle, HttpError, must } from "../_shared/http.ts";
import { detectPii, maskPii } from "../_shared/pii.ts";
import type { AiOutput, ChatTurnRequest, ChatTurnResponse, Message, Mission, Stage } from "../_shared/types.ts";
import { decideNext } from "./decide.ts";

const AI_TIMEOUT_MS = 8000;
const MAX_TEXT = 500;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), ms))]);
}

Deno.serve(handle<ChatTurnRequest>(async ({ body, user, admin }): Promise<ChatTurnResponse> => {
  if (typeof body.session_id !== "string") throw new HttpError(400, "BAD_REQUEST", "session_id가 필요합니다");
  if (body.text !== undefined && typeof body.text !== "string") throw new HttpError(400, "BAD_REQUEST", "text는 문자열입니다");
  const text = body.text?.trim().slice(0, MAX_TEXT) ?? "";

  const session = must(
    await admin.from("sessions").select("*, missions(*), participants(invites(difficulty))")
      .eq("id", body.session_id).maybeSingle(),
  );
  if (!session || session.user_id !== user.id) throw new HttpError(404, "NOT_FOUND", "세션을 찾을 수 없습니다");
  if (session.status !== "active") throw new HttpError(409, "SESSION_ENDED", "이미 끝난 훈련입니다");

  const mission = session.missions as Mission;
  const stage = session.stage as Stage;
  const history = must(
    await admin.from("messages").select("role, text, stage").eq("session_id", session.id).order("created_at"),
  ) as Pick<Message, "role" | "text" | "stage">[];

  // (session_id, turn, role) 유니크 → 같은 턴을 동시에 보낸 두 번째 요청은 여기서 409
  const save = async (role: Message["role"], text: string, stage: Stage, turn: number) => {
    const res = await admin.from("messages").insert({ session_id: session.id, role, text, stage, turn }).select().single();
    if (res.error?.code === "23505") throw new HttpError(409, "TURN_CONFLICT", "이전 답장을 처리하고 있어요");
    return must(res) as Message;
  };
  const last = async () =>
    must(
      await admin.from("messages").select().eq("session_id", session.id)
        .order("created_at", { ascending: false }).limit(1).single(),
    ) as Message;

  // 첫 호출(text 없음): 오프닝 대사(turn 0). 이미 있으면(새로고침·동시 호출) 마지막 메시지를 돌려줌.
  if (!text) {
    const reply = history.length ? await last() : await save("scammer", mission.fallback_lines[stage], stage, 0)
      .catch((e) => e instanceof HttpError && e.code === "TURN_CONFLICT" ? last() : Promise.reject(e));
    return { reply, stage, ended: false, used_fallback: false };
  }

  const pii = detectPii(text);
  if (pii.length) {
    throw new HttpError(422, "PII_BLOCKED", "전화번호·계좌번호 같은 실제 정보는 입력하지 마세요", {
      types: [...new Set(pii.map((p) => p.type))],
    });
  }

  const ai: AiOutput = await withTimeout(
    generateReply({
      mission,
      difficulty: session.participants.invites.difficulty,
      stage,
      history,
      user_text: text,
    }),
    AI_TIMEOUT_MS,
  ).catch((e) => {
    console.error("generateReply failed", e);
    const next = nextStage(stage);
    return { reply: mission.fallback_lines[next], next_stage: next, ended: false, used_fallback: true };
  });

  const d = decideNext(session.turn_count, ai);
  // 두 번 나눠 insert: 한 문장이면 created_at(now())이 같아 순서가 섞임
  await save("senior", text, stage, d.turn_count);
  const reply = await save("scammer", maskPii(ai.reply), d.stage, d.turn_count);
  must(
    await admin.from("sessions").update({
      stage: d.stage,
      turn_count: d.turn_count,
      ...(d.ended ? { status: "ended", ended_at: new Date().toISOString() } : {}),
    }).eq("id", session.id),
  );

  return { reply, stage: d.stage, ended: d.ended, used_fallback: ai.used_fallback };
}));
