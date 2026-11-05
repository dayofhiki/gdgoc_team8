export type OX = "O" | "X";
export type QuizCategory = "family" | "links" | "money" | "authority" | "response";
export const QUIZ_CATEGORIES: QuizCategory[] = ["family", "links", "authority", "family", "response", "links", "money", "response", "family", "response"];
type QuizRow = readonly [QuizCategory, string, OX, string, string];
const EXTRA_QUIZ: readonly QuizRow[] = [
  [
    "family",
    "자녀라고 말하는 사람이 내 이름을 정확히 알아도, 새 번호라면 별도로 확인하는 것이 좋다.",
    "O",
    "이름은 다른 경로로 알 수도 있어요.",
    "이름만으로 신원을 증명할 수 없습니다. 평소 알던 연락처로 확인하세요."
  ],
  [
    "family",
    "새 번호에서 가족이 급하다고 할 때는 먼저 송금하고 나중에 확인한다.",
    "X",
    "급할수록 무엇을 먼저 해야 할까요?",
    "급한 사정이 있어 보여도 기존 연락처로 확인한 뒤 결정하세요."
  ],
  [
    "family",
    "친척이 보낸 모바일 청첩장도 문자 속 링크라면 열기 전에 확인하는 편이 안전하다.",
    "O",
    "아는 번호가 도용됐을 가능성도 있어요.",
    "연락처가 저장되어 있어도 감염된 기기에서 링크가 발송될 수 있습니다."
  ],
  [
    "family",
    "가족 목소리로 들리면 추가 확인 없이 돈을 보내도 된다.",
    "X",
    "목소리 자체를 합성할 수 있습니다.",
    "목소리가 익숙해도 다른 연락 경로로 확인하세요."
  ],
  [
    "family",
    "가족끼리 미리 정한 확인 방법이 있으면 사칭 대응에 도움이 된다.",
    "O",
    "통화 속 상대만 믿어도 될까요?",
    "평소 약속한 확인 방법을 활용하되, 가능하면 기존 연락처로 별도 연락하세요."
  ],
  [
    "family",
    "지인 번호에서 온 부고 알림이면 첨부 링크도 반드시 안전하다.",
    "X",
    "지인의 휴대전화가 감염될 수도 있어요.",
    "저장된 번호는 안전을 보증하지 않습니다. 장례 정보는 다른 방법으로 확인하세요."
  ],
  [
    "family",
    "가족을 사칭한 사람이 인증번호를 물으면 알려주지 않는 것이 맞다.",
    "O",
    "인증번호는 누구의 계정을 지킬까요?",
    "인증번호는 상대가 가족이라 주장해도 보내지 마세요."
  ],
  [
    "family",
    "부고 문자에 링크가 있으면 예의를 지키기 위해 반드시 눌러봐야 한다.",
    "X",
    "예의와 보안은 별개예요.",
    "부고 확인은 기존 연락처로 문의하거나 신뢰할 수 있는 별도 경로를 이용하세요."
  ],
  [
    "links",
    "택배 문자의 주소 수정 링크 대신 평소 쓰던 택배 앱으로 배송을 확인할 수 있다.",
    "O",
    "어떤 경로를 내가 직접 선택했나요?",
    "문자 속 주소가 아닌 평소 설치한 공식 앱을 직접 열어 확인하세요."
  ],
  [
    "links",
    "문자 링크를 한 번 눌렀다면 개인정보를 입력하지 않아도 무조건 피해가 끝난 것이다.",
    "X",
    "링크가 무엇을 실행했는지도 중요해요.",
    "링크 접속만으로 바로 피해가 확정되는 것은 아니지만, 설치·권한 허용 여부 등을 점검해야 합니다."
  ],
  [
    "links",
    "앱 설치를 유도하는 청첩장 링크는 눌러서는 안 된다.",
    "O",
    "청첩장 열람과 새 앱 설치가 왜 연결될까요?",
    "청첩장을 핑계로 악성 앱을 설치하도록 유도하는 수법이 있습니다."
  ],
  [
    "links",
    "문자에 적힌 인터넷 주소가 기관 이름처럼 보이면 공식 사이트로 확정할 수 있다.",
    "X",
    "주소 모양은 흉내 낼 수 있어요.",
    "사이트의 외형과 주소 문자열만으로 진위를 단정하지 말고 직접 찾은 경로를 이용하세요."
  ],
  [
    "links",
    "쿠폰 수령을 위해 QR코드로 새 앱 설치를 요구하면 주의해야 한다.",
    "O",
    "QR코드도 외부 링크로 이어져요.",
    "무료 쿠폰을 가장한 QR코드·앱 설치 유도 사례가 실제로 보고됐습니다."
  ],
  [
    "links",
    "메시지에 잠금 표시 그림이 있으니 링크 안에서 신분증 사진을 보내도 된다.",
    "X",
    "그림은 누구나 붙일 수 있어요.",
    "이미지나 잠금 표시 그림은 발신자·서비스의 신뢰를 입증하지 않습니다."
  ],
  [
    "links",
    "문자 링크에서 앱을 설치하고 권한을 허용했다면 추가 조치가 필요할 수 있다.",
    "O",
    "이미 권한을 줬다면 어떻게 해야 할까요?",
    "설치된 앱과 권한을 점검하고 의심되면 전문가 도움과 공식 신고·상담을 받으세요."
  ],
  [
    "links",
    "문자 속 링크를 내가 직접 눌렀으니 연결된 페이지는 공식 홈페이지다.",
    "X",
    "누르는 행동이 진위를 보장하진 않아요.",
    "직접 눌렀다는 사실과 웹사이트의 신뢰성은 관련이 없습니다."
  ],
  [
    "money",
    "대출 심사를 먼저 진행하려면 보증료를 개인 계좌에 보내야 한다는 요구는 의심해야 한다.",
    "O",
    "돈을 빌리기 전에 개인 계좌로 돈을 보내나요?",
    "대출을 조건으로 한 선입금 요구는 대표적인 사기 위험 신호입니다."
  ],
  [
    "money",
    "소액 부업 정산을 한번 받았다면 이후 거액 입금 요구도 안전하다.",
    "X",
    "처음 정산은 신뢰를 얻기 위한 미끼일 수 있어요.",
    "소액 수익을 지급해 신뢰를 쌓고 큰돈을 요구하는 부업 사기가 있습니다."
  ],
  [
    "money",
    "상품 후기 알바가 물건값을 먼저 보내라고 하면 계약과 업체를 공식적으로 확인해야 한다.",
    "O",
    "업무를 위해 내 돈을 먼저 내라고 하나요?",
    "선입금 요구를 거절하고 정식 업체인지 독립적으로 확인하세요."
  ],
  [
    "money",
    "계좌 보호를 위해 안전계좌로 옮기라는 안내는 문자에 적힌 번호로 확인하면 충분하다.",
    "X",
    "그 번호 자체를 사기범이 적었을 수 있어요.",
    "문자 속 연락처가 아니라 공식적으로 찾은 금융기관에 직접 연락하세요."
  ],
  [
    "money",
    "상대가 투자금 손실을 만회해 주겠다며 추가 송금을 요구하면 중단해야 한다.",
    "O",
    "추가 송금으로 피해가 커질 수 있어요.",
    "손실 회복·환급을 구실로 돈을 더 요구하는 경우 송금을 중단하고 상담하세요."
  ],
  [
    "money",
    "팀원 전체의 환급이 걸려 있다면 내가 돈을 더 내야 하는 것이 맞다.",
    "X",
    "다른 사람의 손해를 내 책임이라고 말하나요?",
    "팀 미션의 연대 책임을 강조해 추가 입금을 압박하는 사기 수법이 있습니다."
  ],
  [
    "money",
    "피해가 의심되어 송금을 중단했더라도 이미 보낸 돈이 있다면 곧바로 은행에 연락해야 한다.",
    "O",
    "빠른 지급정지 요청이 중요해요.",
    "즉시 은행과 112 등에 문의해 지급정지 및 신고를 진행하세요."
  ],
  [
    "money",
    "상대가 실제 거래 금액을 정확히 말하면 계좌 이체 요구도 안전하다.",
    "X",
    "일부 정보가 유출됐을 수도 있어요.",
    "결제 금액을 알고 있다는 이유로 계좌 이체 요구가 정당해지지는 않습니다."
  ],
  [
    "authority",
    "공공기관 사칭자가 사건번호를 말하더라도 별도 공식 채널에서 확인해야 한다.",
    "O",
    "사건번호도 그럴듯하게 꾸밀 수 있어요.",
    "상대가 제공한 번호를 이용하지 말고 기관 공식 연락처를 직접 찾아 확인하세요."
  ],
  [
    "authority",
    "공문서 사진과 직인이 보이면 주민등록번호를 문자로 보내도 된다.",
    "X",
    "문서 이미지는 복제할 수 있어요.",
    "문서 사진만으로 기관의 진위를 판단할 수 없고 민감정보를 전송하면 안 됩니다."
  ],
  [
    "authority",
    "카드 배송을 신청하지 않았다면 문자에 적힌 반송 번호부터 전화해야 한다.",
    "X",
    "그 번호가 가짜 상담센터일 수 있어요.",
    "카드사는 카드 뒷면이나 공식 홈페이지 등 독립적으로 찾은 번호로 확인하세요."
  ],
  [
    "authority",
    "교통 과태료 문자가 와도 공식 조회 경로에서 직접 확인하는 것이 안전하다.",
    "O",
    "문자 속 고지서 링크는 어떻게 확인하나요?",
    "공식 기관의 앱이나 홈페이지를 직접 찾아 조회하세요."
  ],
  [
    "authority",
    "직원이 이름과 생년월일을 맞히면 금융기관 직원으로 확정할 수 있다.",
    "X",
    "유출된 정보로도 신뢰를 얻을 수 있어요.",
    "개인정보 일부를 알고 있어도 신분 증명은 되지 않습니다."
  ],
  [
    "authority",
    "금융기관을 사칭하며 원격제어 앱 설치를 요구하면 통화를 중단해야 한다.",
    "O",
    "내 휴대전화의 조작 권한을 넘기게 돼요.",
    "앱 설치 및 원격제어 요구를 따르지 말고 공식 채널에 확인하세요."
  ],
  [
    "authority",
    "경찰이라고 주장하며 전화를 못 끊게 해도 통화를 종료하고 공식 번호로 확인할 수 있다.",
    "O",
    "대화를 끝낼 권리는 사용자에게 있어요.",
    "압박이나 통화 유지 요구에 따를 필요가 없으며 공식 경로로 확인하세요."
  ],
  [
    "authority",
    "검진 결과를 미리 알고 있다는 문자라면 링크에서 주민등록번호를 입력해도 된다.",
    "X",
    "개인정보를 미리 알고 있는 사람이 있을 수 있어요.",
    "검진 관련 정보는 본인이 선택한 의료기관·공식 채널에서 확인하세요."
  ],
  [
    "response",
    "의심스러운 문자에 답장을 하지 않고 기존 연락처로 확인하는 방법이 있다.",
    "O",
    "문자 대화 밖에서 무엇을 할 수 있나요?",
    "발신자가 알려준 경로와 별개로 기존 연락처를 이용하세요."
  ],
  [
    "response",
    "피싱이 의심되더라도 상대방을 반드시 설득해야 훈련에서 성공이다.",
    "X",
    "상대를 설득하는 것이 목표일까요?",
    "상대를 설득할 필요는 없습니다. 위험한 요청을 거절하고 대화를 중단할 수 있습니다."
  ],
  [
    "response",
    "신분증 사진을 이미 보냈다면 추가 정보 제공을 멈추고 관련 기관에 상담해야 한다.",
    "O",
    "이미 행동했어도 다음 행동을 바꿀 수 있어요.",
    "추가 피해를 막기 위해 송신을 중단하고 금융기관·상담기관에 조치 방법을 문의하세요."
  ],
  [
    "response",
    "피해가 의심되면 창피하더라도 혼자 해결해야 한다.",
    "X",
    "시간이 중요해요.",
    "신뢰할 수 있는 가족과 금융기관, 112에 빠르게 도움을 요청하세요."
  ],
  [
    "response",
    "전화를 끊은 뒤에도 문자 속 번호로 다시 걸면 독립적으로 확인한 것이다.",
    "X",
    "연락처를 누가 제공했는지 살펴보세요.",
    "사기범이 알려 준 번호는 독립적인 검증 수단이 아닙니다."
  ],
  [
    "response",
    "문자 속 링크를 열었더라도 개인정보 입력과 앱 설치 전이라면 그 행동을 멈출 수 있다.",
    "O",
    "실수가 이어지는 것을 막을 수 있어요.",
    "이미 링크를 열었다면 추가 조작을 멈추고 설치·권한 변경 여부를 확인하세요."
  ],
  [
    "response",
    "피해를 이미 당했으면 지급정지 요청이나 신고는 소용없다.",
    "X",
    "신고는 빠를수록 좋습니다.",
    "즉시 금융기관 및 112에 연락하면 추가 피해를 줄이는 조치를 안내받을 수 있습니다."
  ],
  [
    "response",
    "계좌 이체를 요구한 상대가 급히 재촉하면 우선 대화를 끊고 신뢰할 경로에서 확인할 수 있다.",
    "O",
    "시간을 달라고 할 필요도 없어요.",
    "상대의 압박에 따르지 말고 독립적인 확인을 우선하세요."
  ]
] as const;

export type QuizItem = {
  id: string;
  category?: QuizCategory;
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
  ...EXTRA_QUIZ.map(([category, question, answer, hint, explanation], index): QuizItem => ({
    id: `q${index + 11}`, category, question, answer, hintTitle: "생각해 볼 점", hint, explanation,
  })),
];

/** 가족 초대 링크로 들어온 사람이 푸는 3문제 도전 */
export const CHALLENGE_IDS = ["q3", "q1", "q8"];

export const DEFAULT_REMEMBER =
  "공공기관은 전화로 돈을 옮기라고 하지 않아요. 의심되면 끊고 대표번호로 직접 확인하세요.";

export function quizCategory(item: QuizItem): QuizCategory {
  if (item.category) return item.category;
  const index = Number(item.id.slice(1)) - 1;
  return QUIZ_CATEGORIES[index] ?? "response";
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export type QuizProgress = { wrongIds: string[]; recentIds: string[] };
const PROGRESS_KEY = "mikki:quiz-progress-v1";
export function loadQuizProgress(): QuizProgress {
  try {
    const data = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null") as Partial<QuizProgress> | null;
    if (!data) return { wrongIds: [], recentIds: [] };
    const valid = (xs: unknown): string[] => Array.isArray(xs) ? xs.filter((x): x is string =>
      typeof x === "string" && QUIZ.some(q => q.id === x)).slice(0, 50) : [];
    return { wrongIds: valid(data.wrongIds), recentIds: valid(data.recentIds) };
  } catch { return { wrongIds: [], recentIds: [] }; }
}
export function saveQuizProgress(answers: { id: string; correct: boolean }[], items: QuizItem[]): void {
  try {
    const prior = loadQuizProgress();
    const wrong = new Set(prior.wrongIds);
    for (const a of answers) a.correct ? wrong.delete(a.id) : wrong.add(a.id);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      wrongIds: [...wrong].slice(-30),
      recentIds: items.map(x => x.id),
    } satisfies QuizProgress));
  } catch { /* 저장이 불가능해도 퀴즈는 이어진다. */ }
}

/** 일반 퀴즈는 분야별 2문제씩, 최근 문제는 가능한 피하고 틀렸던 개념을 먼저 복습한다. */
export function pickQuiz(
  ids?: string[], seed?: number, wrongIds: string[] = [], recentIds: string[] = [],
): QuizItem[] {
  if (ids?.length) {
    const found = ids.map(id => QUIZ.find(q => q.id === id)).filter((q): q is QuizItem => !!q);
    if (found.length) return found;
  }
  const random = seed === undefined ? Math.random : seededRandom(seed);
  const selected: QuizItem[] = [];
  for (const category of ["family", "links", "money", "authority", "response"] as QuizCategory[]) {
    const pool = shuffle(QUIZ.filter(q => quizCategory(q) === category), random).sort((a, b) => {
      const priority = (q: QuizItem) => (wrongIds.includes(q.id) ? -2 : 0) + (recentIds.includes(q.id) ? 1 : 0);
      return priority(a) - priority(b);
    });
    const first = pool[0];
    if (!first) continue;
    const complementary = pool.find(q => q.id !== first.id && q.answer !== first.answer);
    selected.push(first, complementary ?? pool[1]);
  }
  return shuffle(selected, random);
}
