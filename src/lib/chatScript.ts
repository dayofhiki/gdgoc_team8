/**
 * 채팅 연습(관찰형) 시나리오: 가족·지인 사칭.
 * 대화가 자동으로 진행되고, 사용자는 "잠깐 멈추기"로 속는 순간을 찾아요.
 * 추후 Gemini로 시나리오를 생성하면 이 구조(ChatEvent[])로 변환해 재생하면 됩니다.
 */
export type ChatEvent =
  | { kind: "them"; text: string; time: string; step: number; from?: string }
  | { kind: "me"; text: string; time: string; step: number; photo?: string; tag?: string; moment?: number }
  | { kind: "typing"; who: "me" | "them"; step: number }
  | { kind: "danger"; title: string; text: string; step: number }
  | { kind: "end"; step: number };

export const CHAT_MISSION = {
  chip: "문자 연습 · 가족·지인 사칭",
  title: "엄마! 나 핸드폰이 망가져서\n카드 좀 빌려줘..",
  situation: "타지에서 사는 자녀에게서 이런 문자가 왔어요.",
  from: "010-7342-58** · 모르는 번호",
};

export const CHAT_SCRIPT: ChatEvent[] = [
  { kind: "them", text: "엄마 저예요.\n핸드폰이 고장 나서 다른 번호로\n연락드려요. 지금 통화는 못 하고\n문자만 돼요.", time: "오후 2:00", step: 1, from: CHAT_MISSION.from },
  { kind: "typing", who: "me", step: 2 },
  { kind: "me", text: "어머 그래? 많이 망가졌어?", time: "오후 2:01", step: 2, moment: 0 },
  { kind: "typing", who: "them", step: 2 },
  { kind: "them", text: "액정이 깨져서 수리 맡겼어요.\n보험 처리하려면 엄마 신분증\n사진이 필요해요.", time: "오후 2:02", step: 2 },
  { kind: "typing", who: "me", step: 2 },
  { kind: "me", text: "그래, 지금 찍어서 보낼게.", time: "오후 2:03", step: 2, photo: "신분증 사진", tag: "위험 순간 1", moment: 1 },
  {
    kind: "danger",
    title: "여기서 이미 사기를 당했어요.",
    text: "신분증 사진이 넘어가면 내 이름으로 대출까지 받을 수 있어요. 보내기 전에 원래 번호로 확인했어야 해요.",
    step: 2,
  },
  { kind: "typing", who: "them", step: 3 },
  { kind: "them", text: "고마워요. 수리비도 급한데\n50만 원만 이 계좌로 먼저\n보내 줄 수 있어요?", time: "오후 2:04", step: 3 },
  { kind: "typing", who: "me", step: 3 },
  { kind: "me", text: "알겠어, 방금 보냈어.", time: "오후 2:05", step: 3, tag: "위험 순간 2 · 돈을 보냈어요", moment: 2 },
  { kind: "end", step: 3 },
];

export const CHAT_TOTAL_STEPS = 3;

export const REMEMBER_CHAT = "사기범이 서두를수록 잠깐 멈추고, 원래 알던 번호로 직접 확인하세요.";

/** 다음 이벤트까지 기다리는 시간(ms) */
export function delayFor(e: ChatEvent): number {
  if (e.kind === "typing") return 1300;
  if (e.kind === "them") return 2600;
  if (e.kind === "me") return 1600;
  return 900;
}
