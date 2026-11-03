import { classify } from "../_shared/ai.ts";
import { handle, HttpError, must } from "../_shared/http.ts";
import type { Outcome, Result, SessionEndRequest, SessionEndResponse, Stage } from "../_shared/types.ts";

const STAGE_FLAGS: Record<Stage, string> = {
  approach: "낯선 번호·처음 보는 상대가 먼저 연락함",
  trust: "그럴듯한 사연이나 신분을 내세워 믿게 만듦",
  pressure: "급하다며 생각할 시간을 주지 않음",
  demand: "송금·개인정보·앱 설치를 요구함",
};
const FEEDBACK: Record<Outcome, string[]> = {
  safe: ["잘하셨어요! 요구에 응하지 않고 확인을 먼저 했습니다.", "앞으로도 평소 알던 번호로 직접 확인하세요."],
  unsafe: ["요구에 응하려는 답이 있었어요. 실제라면 피해로 이어질 수 있습니다.", "송금·정보 요구를 받으면 일단 멈추고 가족에게 직접 전화하세요."],
  incomplete: ["판단하기 전에 대화가 끝났어요.", "의심되면 대화를 끊고 평소 연락처로 확인하는 연습을 해 보세요."],
};

Deno.serve(handle<SessionEndRequest>(async ({ body, user, admin }): Promise<SessionEndResponse> => {
  if (typeof body.session_id !== "string") throw new HttpError(400, "BAD_REQUEST", "session_id가 필요합니다");

  const session = must(await admin.from("sessions").select("id, user_id, status").eq("id", body.session_id).maybeSingle());
  if (!session || session.user_id !== user.id) throw new HttpError(404, "NOT_FOUND", "세션을 찾을 수 없습니다");

  const existing = must(await admin.from("results").select().eq("session_id", session.id).maybeSingle()) as Result | null;
  if (existing) return { result: existing };

  const msgs = must(
    await admin.from("messages").select("role, text, stage").eq("session_id", session.id).order("created_at"),
  ) as { role: string; text: string; stage: Stage }[];
  const verdicts = msgs.filter((m) => m.role === "senior").map((m) => classify(m.text));
  const outcome: Outcome = verdicts.includes("unsafe") ? "unsafe" : verdicts.at(-1) === "safe" ? "safe" : "incomplete";
  const red_flags = [...new Set(msgs.filter((m) => m.role === "scammer").map((m) => STAGE_FLAGS[m.stage]))];

  // upsert: 동시 호출돼도 session_id unique로 1행 유지, share_consent는 payload에 없어 보존
  const result = must(
    await admin.from("results").upsert(
      { session_id: session.id, user_id: user.id, outcome, red_flags, feedback: FEEDBACK[outcome] },
      { onConflict: "session_id" },
    ).select().single(),
  ) as Result;
  if (session.status === "active") {
    must(await admin.from("sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", session.id));
  }
  return { result };
}));
