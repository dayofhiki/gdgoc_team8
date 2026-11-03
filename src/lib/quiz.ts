export type OX = "O" | "X";
export type QuizItem = {
  id: string;
  question: string;
  answer: OX;
  hintTitle: string;
  hint: string;
  explanation: string;
};

/** OX 퀴즈 문제 은행 (교육용 예시 — 실제 사례 기반으로 팀에서 다듬어 주세요). */
export const QUIZ: QuizItem[] = [
  {
    id: "q1",
    question: "모르는 번호로 '엄마 나야'라는\n문자가 오면 일단 답장해서\n확인한다?",
    answer: "X",
    hintTitle: "어떤 번호로 확인해야 할까요?",
    hint: "상대가 알려준 번호가 아니라, 내가 원래 알던 번호를 떠올려 보세요.",
    explanation: "답장하지 말고 원래 알던 자녀 번호로 직접 전화해서 확인하세요.",
  },
  {
    id: "q2",
    question: "은행은 문자로 링크를 보내\n앱 설치를 요구할 수 있다?",
    answer: "X",
    hintTitle: "공식 앱은 어디서 받나요?",
    hint: "은행 앱은 보통 앱스토어에서 직접 내려받아요. 문자 링크는 어떨까요?",
    explanation: "금융회사는 문자 링크로 앱 설치를 요구하지 않아요. 링크를 누르지 말고 대표번호로 확인하세요.",
  },
  {
    id: "q3",
    question: "검찰·금감원이 전화로\n'안전계좌'로 돈을 옮기라고\n할 수 있다?",
    answer: "X",
    hintTitle: "기관이 하는 일을 떠올려 보세요.",
    hint: "검찰이나 금감원이 내 돈을 대신 맡아 주는 일이 있는지 생각해 보세요.",
    explanation: "검찰·금감원은 어떤 경우에도 전화로 돈을 옮기라고 하지 않아요. 이런 전화는 바로 끊으세요.",
  },
  {
    id: "q4",
    question: "AI로 가족 목소리를\n똑같이 흉내 낼 수 있다?",
    answer: "O",
    hintTitle: "요즘 AI 기술을 떠올려 보세요.",
    hint: "짧은 음성만 있어도 목소리를 따라 하는 기술이 있어요.",
    explanation: "몇 초 분량의 음성으로도 목소리를 복제할 수 있어요. 목소리만 믿지 말고 되물어 확인하세요.",
  },
  {
    id: "q5",
    question: "의심스러운 전화는 끊고,\n내가 알던 번호로 다시 걸어\n확인하는 게 안전하다?",
    answer: "O",
    hintTitle: "누가 통화를 주도하나요?",
    hint: "상대가 건 전화 안에서는 상대가 정한 대로 흘러가기 쉬워요.",
    explanation: "끊고 내가 아는 번호로 다시 거는 것이 가장 확실한 확인 방법이에요.",
  },
  {
    id: "q6",
    question: "택배 주소 확인 문자 속\n링크는 눌러도 괜찮다?",
    answer: "X",
    hintTitle: "링크를 누르면 무슨 일이 생길까요?",
    hint: "링크 하나로 악성 앱이 설치되거나 정보가 빠져나갈 수 있어요.",
    explanation: "출처를 모르는 링크는 누르지 마세요. 택배사 공식 앱이나 홈페이지에서 직접 확인하세요.",
  },
  {
    id: "q7",
    question: "저금리 대출을 위해 수수료나\n보증금을 먼저 보내라는 요구는\n정상이다?",
    answer: "X",
    hintTitle: "돈을 빌리는데 먼저 돈을 낸다?",
    hint: "정식 금융회사가 대출 전에 돈을 요구하는지 생각해 보세요.",
    explanation: "대출을 이유로 먼저 돈을 요구하면 사기예요. 바로 거절하고 공식 고객센터에 확인하세요.",
  },
  {
    id: "q8",
    question: "신분증 사진만 보내는 건\n돈을 보낸 게 아니니\n괜찮다?",
    answer: "X",
    hintTitle: "신분증으로 무엇을 할 수 있을까요?",
    hint: "신분증만 있으면 내 이름으로 할 수 있는 일이 많아요.",
    explanation: "신분증 사진으로 휴대폰 개통이나 대출까지 될 수 있어요. 문자로 절대 보내지 마세요.",
  },
  {
    id: "q9",
    question: "가족끼리만 아는 확인 질문을\n정해 두면 사칭을 알아채는 데\n도움이 된다?",
    answer: "O",
    hintTitle: "사기범이 모르는 건 무엇일까요?",
    hint: "목소리는 흉내 내도, 우리 가족만의 추억은 알 수 없어요.",
    explanation: "가족 암호 질문 하나로 진짜 가족인지 빠르게 확인할 수 있어요.",
  },
  {
    id: "q10",
    question: "이미 돈을 보냈다면 바로\n112나 은행에 연락해\n지급정지를 요청한다?",
    answer: "O",
    hintTitle: "시간이 중요해요.",
    hint: "빨리 신고할수록 돈을 되찾을 가능성이 높아져요.",
    explanation: "피해를 알았다면 즉시 112나 거래 은행에 연락해 지급정지를 요청하세요.",
  },
];

/** 가족 초대 링크로 들어온 사람이 푸는 3문제 도전 */
export const CHALLENGE_IDS = ["q3", "q1", "q8"];

export const DEFAULT_REMEMBER =
  "공공기관은 전화로 돈을 옮기라고 하지 않아요. 의심되면 끊고 대표번호로 직접 확인하세요.";

export function pickQuiz(ids?: string[]): QuizItem[] {
  if (!ids || ids.length === 0) return QUIZ;
  const picked = ids.map((id) => QUIZ.find((q) => q.id === id)).filter((q): q is QuizItem => Boolean(q));
  return picked.length ? picked : QUIZ;
}
