import { handle, HttpError } from "../_shared/http.ts";
import type { ErrorCode, InviteJoinRequest, InviteJoinResponse } from "../_shared/types.ts";

// join_invite RPC가 raise하는 코드 → HTTP 상태
const STATUS: Partial<Record<ErrorCode, number>> = { INVITE_INVALID: 404, INVITE_EXPIRED: 410, INVITE_FULL: 409 };
const MESSAGE: Partial<Record<ErrorCode, string>> = {
  INVITE_INVALID: "유효하지 않은 초대 링크입니다",
  INVITE_EXPIRED: "만료된 초대 링크입니다",
  INVITE_FULL: "참여 인원이 가득 찬 링크입니다",
};

Deno.serve(handle<InviteJoinRequest>(async ({ body, user, admin }): Promise<InviteJoinResponse> => {
  if (typeof body.token !== "string" || !body.token) throw new HttpError(400, "BAD_REQUEST", "token이 필요합니다");

  // 잠금·인원 확인·등록은 DB 함수 안에서 원자적으로 (같은 사용자 재입장은 기존 참여자 반환)
  const { data, error } = await admin.rpc("join_invite", { p_token: body.token, p_user: user.id }).single();
  if (error) {
    const code = error.message as ErrorCode;
    if (STATUS[code]) throw new HttpError(STATUS[code]!, code, MESSAGE[code]!);
    throw error;
  }
  const row = data as { participant_id: string; senior_name: string; difficulty: InviteJoinResponse["invite"]["difficulty"] };
  return { participant_id: row.participant_id, invite: { senior_name: row.senior_name, difficulty: row.difficulty } };
}));
