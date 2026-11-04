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
  | "AI_NOT_CONFIGURED"
  | "AUDIO_INVALID"
  | "TRANSCRIBE_EMPTY"
  | "TRANSCRIBE_FAILED"
  | "INTERNAL";

// 학습자 발화 해석 (AI 추정). 실제 행동 이벤트(ActionEvent)와 별개.
export type Intent =
  | "refuse" // 요청을 하지 않겠다고 분명히 말함
  | "verify_independent" // 원래 알던 연락처 등으로 확인하겠다고 말함 (확인 완료 아님)
  | "verified_in_chat" // 가족에게 이미 확인했다고 말함 ("딸이 옆에 있는데?")
  | "comply" // 요청에 응하겠다는 의사 (실제 송금·클릭 아님)
  | "claimed_action" // 이미 행동했다고 말함 ("보냈어", "눌렀어") — 이벤트로 확인되기 전까지 사실로 보지 않음
  | "suspect" // 상대를 사기로 의심하거나 놀리는 말
  | "continue" // 질문·맞장구 등
  | "stop" // 연습을 그만하겠다는 말
  | "unclear";

// 종료 이유. ended_by(누가 끝냈나)와 학습자 평가는 리포트에서 따로 다룸.
export type EndReason =
  | "refused"
  | "verify_intent"
  | "verified_claimed"
  | "complied"
  | "claimed_action"
  | "mock_action" // 모의 링크 클릭 등 화면에서 실제로 기록된 행동
  | "scammer_left" // 상대가 의심받거나 반복되자 물러남 (연출)
  | "user_stopped"
  | "inconclusive"; // 모호함·반복·최대 턴

export type EndedBy = "learner" | "scammer" | "system";
export type ScammerAction = "continue" | "recheck" | "leave";
export type ActionEvent = { type: "link_clicked" | "transfer_sent"; at: string };

export type HistoryItem = Pick<Message, "role" | "text" | "stage"> & { intent?: Intent };

export type TurnAnalysis = {
  text: string; // 학습자가 실제로 한 말 (사실)
  intent: Intent;
  uncertain: boolean;
  note?: string; // AI의 해석 (추정)
};

export type Feedback = { summary: string; points: string[]; next_step: string };

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

export type ApiError = { error: { code: ErrorCode; message: string } };

// AI 경계: _shared/ai.ts 의 generateReply(input: AiInput): Promise<AiOutput>
export type AiInput = {
  mission: Mission;
  difficulty: Difficulty;
  stage: Stage;
  history: HistoryItem[];
  user_text?: string;
  link_offered?: boolean; // 앱이 이미 모의 링크를 보여줬는지
};
export type AiOutput = {
  reply: string;
  next_stage: Stage;
  ended: boolean;
  red_flags?: string[];
  used_fallback: boolean;
  end_reason?: EndReason;
  ended_by?: EndedBy;
  analysis?: TurnAnalysis;
  scammer_action?: ScammerAction;
  offer_link?: boolean; // 이 답장과 함께 모의 링크를 표시
};

// Edge Functions
export type InviteJoinRequest = { token: string };
export type InviteJoinResponse = {
  participant_id: string;
  invite: Pick<Invite, "senior_name" | "difficulty">;
};
export type ChatTurnRequest = { session_id: string; text?: string };
export type ChatTurnResponse = {
  reply: Message;
  stage: Stage;
  ended: boolean;
  used_fallback: boolean;
  end_reason?: EndReason;
  ended_by?: EndedBy;
};
export type SessionEndRequest = { session_id: string };
export type SessionEndResponse = { result: Result };

// practice-chat (혼자 연습, 저장 안 함). action 생략 = 대화 1턴.
export type PracticeTurnRequest = {
  action?: "turn";
  mission_id?: string;
  difficulty?: Difficulty;
  stage?: Stage;
  history?: HistoryItem[];
  text?: string;
  link_offered?: boolean;
};
export type PracticeTurnResponse = {
  reply: string; // 빈 문자열이면 표시하지 않음 (사용자 중단)
  stage: Stage;
  ended: boolean;
  used_fallback: boolean;
  ai_configured: boolean;
  end_reason?: EndReason;
  ended_by?: EndedBy;
  analysis?: TurnAnalysis;
  offer_link?: boolean; // 이 답장과 함께 모의 링크를 표시
  turn_count: number; // 학습자 발화 수
  max_turns: number;
};
export type PracticeReportRequest = {
  action: "report";
  mission_id?: string;
  end_reason: EndReason;
  history: HistoryItem[];
  events?: ActionEvent[];
  link_offered?: boolean;
};
export type PracticeReportResponse = {
  feedback: Feedback;
  feedback_source: "ai" | "fallback";
  observations: string[];
};
export type TranscribeRequest = { audio: string; mime_type: string }; // audio: base64
export type TranscribeResponse = { text: string };
