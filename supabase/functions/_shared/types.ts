// FE·BE·AI 공통 타입. import 없이 유지 (Deno·Next 양쪽에서 로드).
// 규칙: 필드는 optional로만 추가, union 값 삭제 금지.

export type Stage = "approach" | "trust" | "pressure" | "demand";
export type Difficulty = "easy" | "normal" | "hard";
export type Mode = "chat" | "voice";
export type SessionStatus = "active" | "ended" | "abandoned";
export type Role = "scammer" | "senior";
export type Outcome = "safe" | "unsafe" | "incomplete";
export type ErrorCode =
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "SESSION_ENDED"
  | "INVITE_INVALID"
  | "INVITE_EXPIRED"
  | "INVITE_FULL"
  | "PII_BLOCKED"
  | "AI_TIMEOUT"
  | "TURN_CONFLICT"
  | "INTERNAL";

export type Mission = {
  id: string;
  title: string;
  scam_type: string;
  persona: string;
  fallback_lines: Record<Stage, string>;
  sort: number;
};

export type Invite = {
  id: string;
  token: string;
  created_by: string;
  senior_name: string;
  difficulty: Difficulty;
  max_participants: number;
  family_id: string | null;
  inviter_name: string;
  expires_at: string;
  created_at: string;
};

export type Participant = { id: string; invite_id: string; user_id: string; joined_at: string };

export type Session = {
  id: string;
  participant_id: string;
  user_id: string;
  mission_id: string;
  mode: Mode;
  stage: Stage; // 난이도는 invites.difficulty를 따름
  status: SessionStatus;
  turn_count: number;
  started_at: string;
  ended_at: string | null;
};

export type Message = {
  id: string;
  session_id: string;
  role: Role;
  text: string;
  stage: Stage;
  turn?: number | null; // 오프닝 0, 이후 1.. (002 이전 행은 null)
  created_at: string;
};

export type Result = {
  id: string;
  session_id: string;
  user_id: string;
  outcome: Outcome;
  red_flags: string[];
  feedback: string[];
  share_consent: boolean;
  created_at: string;
};

// 개인정보 종류 (pii.ts detectPii). number = 은행명 없는 10자리 이상 숫자열
export type PiiType = "rrn" | "phone" | "card" | "account" | "email" | "url" | "birth" | "number";

// types: PII_BLOCKED일 때 걸린 개인정보 종류 (경고 문구용)
export type ApiError = { error: { code: ErrorCode; message: string; types?: PiiType[] } };

// AI 경계: _shared/ai.ts 의 generateReply(input: AiInput): Promise<AiOutput>
export type AiInput = {
  mission: Mission;
  difficulty: Difficulty;
  stage: Stage;
  history: Pick<Message, "role" | "text" | "stage">[];
  user_text?: string;
};
export type AiOutput = {
  reply: string;
  next_stage: Stage;
  ended: boolean;
  red_flags?: string[];
  used_fallback: boolean;
};

// Edge Functions
export type InviteJoinRequest = { token: string; nickname?: string };
export type InviteJoinResponse = {
  participant_id: string;
  invite: Pick<Invite, "senior_name" | "difficulty" | "family_id" | "inviter_name">;
};
export type ChatTurnRequest = { session_id: string; text?: string };
export type ChatTurnResponse = { reply: Message; stage: Stage; ended: boolean; used_fallback: boolean };
export type SessionEndRequest = { session_id: string };
export type SessionEndResponse = { result: Result };
