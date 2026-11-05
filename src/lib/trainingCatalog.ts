/**
 * 사용자에게 공개해도 되는 훈련 주제만 모은 카탈로그.
 * 정답(정상/사칭), 개별 배역, 시나리오 비공개 목적은 이 파일에 없다.
 */
export const TRAINING_TOPICS = [
  { id: "family", title: "가족의 급한 연락", description: "새 번호로 연락해 온 가족의 사정", category: "가족·지인", contactLabel: "처음 보는 번호" },
  { id: "delivery", title: "택배 주소 확인", description: "배송 주소가 맞는지 묻는 연락", category: "생활 문자", contactLabel: "배송 안내" },
  { id: "bank", title: "은행 거래 알림", description: "평소와 다른 거래를 확인해 달라는 연락", category: "금융", contactLabel: "거래 안내" },
  { id: "invitation", title: "모바일 청첩장", description: "지인이 보낸 결혼식 초대 연락", category: "가족·지인", contactLabel: "지인 연락" },
  { id: "obituary", title: "부고 알림", description: "지인의 부고 소식을 전하는 문자", category: "가족·지인", contactLabel: "지인 연락" },
  { id: "traffic", title: "교통 과태료 안내", description: "교통위반 내용을 확인하라는 연락", category: "공공기관", contactLabel: "교통 안내" },
  { id: "loan", title: "저금리 대출 상담", description: "대출 상품이나 조건을 안내하는 연락", category: "금융", contactLabel: "대출 안내" },
  { id: "job", title: "단기 일자리 제안", description: "재택·단기 업무를 소개하는 연락", category: "생활 문자", contactLabel: "구인 안내" },
  { id: "health", title: "건강검진 안내", description: "검진 예약이나 안내사항을 확인하는 연락", category: "공공기관", contactLabel: "건강검진 안내" },
] as const;

export type TrainingTopicId = (typeof TRAINING_TOPICS)[number]["id"];
export const TRAINING_TOPIC_IDS: TrainingTopicId[] = TRAINING_TOPICS.map(x => x.id);
export const TRAINING_TOPIC_COUNT = TRAINING_TOPICS.length;

export function isTrainingTopicId(value: unknown): value is TrainingTopicId {
  return typeof value === "string" && TRAINING_TOPIC_IDS.some(id => id === value);
}

export function topicDescriptor(id: TrainingTopicId) {
  return TRAINING_TOPICS.find(t => t.id === id)!;
}

export function isPersonalTopic(id: TrainingTopicId): boolean {
  return id === "family" || id === "invitation" || id === "obituary";
}
