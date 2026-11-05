import type { TrainingTopicId } from "./trainingCatalog.ts";

const questions: Record<TrainingTopicId, [string, string]> = {
  family: ["무슨 일이야?", "왜 다른 번호로 문자했어?"],
  delivery: ["어떤 택배인가요?", "배송에 무슨 문제가 있나요?"],
  bank: ["어떤 결제인가요?", "가맹점과 금액을 알려주세요."],
  invitation: ["무슨 소식이에요?", "결혼식은 언제예요?"],
  obituary: ["어떤 소식인가요?", "누가 전해 달라고 했나요?"],
  traffic: ["어떤 고지인가요?", "언제 어디에서 위반했다고 나오나요?"],
  loan: ["어떤 대출인가요?", "대출 조건을 알려주세요."],
  job: ["어떤 일인가요?", "근무 조건은 어떻게 되나요?"],
  health: ["어떤 검진 안내인가요?", "예약 관련 연락인가요?"],
  card: ["카드를 신청한 적이 없어요.", "어떤 카드인가요?"],
  team_mission: ["어떤 일인가요?", "정산은 어떻게 하나요?"],
};

const topicClues: Record<TrainingTopicId, RegExp> = {
  family: /엄마|아빠|폰|휴대|다른 번호/,
  delivery: /택배|배송/,
  bank: /결제|거래|승인/,
  invitation: /결혼|청첩장/,
  obituary: /부고|별세|빈소/,
  traffic: /교통|위반|과태료|범칙금/,
  loan: /대출|금리/,
  job: /일자리|업무|근무|채용/,
  health: /검진|예약/,
  card: /카드/,
  team_mission: /후기|부업/,
};

type ChatLine = { actor: string; text: string; actions?: { kind: string; origin: string }[] };

export function trainingReplyExamples(topic: TrainingTopicId, messages: ChatLine[]): string[] {
  const sent = new Set(messages.filter(message => message.actor === "me").map(message => message.text.trim()));
  const incoming = messages.filter(message => message.actor === "them");
  const topicMentioned = incoming.some(message => topicClues[topic].test(message.text));
  const hasRequest = incoming.some(message => message.actions?.some(
    action => action.origin === "sender" && ["transfer", "link", "phone", "provide_data"].includes(action.kind),
  ));
  const choices = hasRequest
    ? topic === "family"
      ? ["왜 지금 해야 해?", "잠깐 생각해 볼게.", "다른 방법은 없어?"]
      : ["왜 이 절차가 필요한가요?", "잠깐 생각해 볼게요.", "다른 방법도 있나요?"]
    : [...(topicMentioned ? questions[topic] : []), ...(topic === "family"
      ? ["지금 나한테 필요한 게 뭐야?", "어떻게 된 건지 더 말해 줘."]
      : ["제게 어떤 용건으로 연락하셨나요?", "제가 해야 할 일이 있나요?"])];
  return choices.filter(text => !sent.has(text)).slice(0, 2);
}
