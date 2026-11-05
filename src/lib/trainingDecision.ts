/**
 * 의미 있는 '행동 선택'이 등장하는 훈련용 대화 품질 규칙.
 * 실제 위험 행동·송금·개인정보 입력은 실행되지 않는다.
 * 사칭임을 사용자에게 드러내거나 정답 버튼을 추천하지 않는다.
 */
import type { Scenario, TrainingState } from "./realTraining.ts";
import type { Proposed } from "./trainingActions.ts";
import { hasConcreteRequest, clearlyDisengaged } from "./trainingResolution.ts";

export const SCENARIO_DECISIONS: Record<Scenario["topic"], string> = {
  family: "수리 상황을 설명한 뒤 가상의 수리비를 보내 달라는 실제 선택이 필요한 부탁. 원래 연락처를 먼저 알려주지 않는다.",
  delivery: "배송 문제를 설명한 뒤 문자로 제공한 가상 주소 확인 링크를 열거나 그 화면에 수취 정보를 입력해 달라는 요청. 설치된 공식 앱을 열라는 안내로 끝내지 않는다.",
  bank: "보안·거래 관련 상담처럼 보이게 설명한 뒤 문자 답장으로 계좌 잔액·계좌번호 일부·인증번호 등의 정보를 보내거나 가상의 보호 조치 이체를 해 달라는 요구. 단순히 '본인 거래인지 공식 앱에서 확인하세요'로 끝내지 않는다. 실제 금융정보와 번호를 생성하지 않는다.",
  invitation: "대화를 나눈 뒤 가상의 모바일 초대장 링크를 열어 달라는 요청. 안전한 확인 방법을 먼저 알려주지 않는다.",
  obituary: "부고 소식을 전달한 뒤 가상의 부고 안내 링크로 세부사항을 보라는 요청. 실존 고인과 장소는 지어내지 않는다.",
  traffic: "고지 사유를 설명한 뒤 문자에 붙은 가상 고지서 링크를 열거나 개인 정보를 입력해 달라는 요구. 단순한 공식 기관 직접 조회 안내로 끝내지 않는다.",
  loan: "대출 조건에 관심을 보이면 심사비·보증료·기존 대출 정리라는 명목의 모의 선입금 요청. 실제 계좌를 제공하지 않는다.",
  job: "업무 내용을 설명한 뒤 가상 지원 링크 또는 문자로 개인 인증정보를 보내 달라는 요청. 실제 채용 정보는 지어내지 않는다.",
  health: "검진 안내를 설명한 뒤 문자 속 가상 예약·결과 확인 링크를 사용해 달라는 요청. 검사 결과나 질병은 지어내지 않는다.",
};

export function riskDecisionDue(state: TrainingState, scenario: Scenario, userText: string): boolean {
  // 사용자의 질문에 한 차례는 맥락을 설명할 여유를 주되, 두 번째 이상 답변에서
  // 아무 결정을 요구하지 않고 끝없는 설명만 하는 경우를 막는다.
  return scenario.identity === "fraud" &&
    state.turns >= 1 &&
    !state.closed &&
    !hasConcreteRequest(state.messages) &&
    !clearlyDisengaged(userText);
}

export function meaningfulRiskRequest(reply: string, proposals: Proposed[]): boolean {
  if (!hasConcreteRequest([{ actor: "them", text: reply }])) return false;
  return proposals.some(a => ["transfer", "link", "provide_data"].includes(a.kind) &&
    a.origin === "sender");
}

export function bankQuestionNeedsSpecifics(userText: string): boolean {
  return /(?:무슨|어떤|뭐|얼마|금액|거래|결제|내역|언제|어디)/.test(userText) &&
    /(?:거래|결제|내역|무슨|어떤|뭐|얼마|언제|어디)/.test(userText);
}

/** 이미 설정된 가상 거래 정황을 설명했는지 확인. 사건 금액·종류를 만들어내지 않는다. */
export function bankAnswerIsConcrete(reply: string): boolean {
  return /(?:상품권|정기결제|구독|간편결제|온라인|모바일|결제|승인)/.test(reply) &&
    /(?:\d{1,3}(?:만|천)?\s*원|\d{1,3},\d{3}\s*원)/.test(reply);
}

/**
 * 위험 요청이 빠진 대화나 질문에 답하지 않는 회피성 일반론을 재생성하도록 한다.
 * 사용자의 텍스트만으로 실제 위험 행동이 일어났다고 판단하지 않는다.
 */
export function replyQualityIssue(
  scenario: Scenario,
  state: TrainingState,
  userText: string,
  reply: string,
  actions: Proposed[],
): string | undefined {
  if (scenario.topic === "bank" && bankQuestionNeedsSpecifics(userText) &&
      !bankAnswerIsConcrete(reply)) {
    return "상대가 '어떤 거래/얼마'인지 물었습니다. 세션에 고정된 가상 거래 유형과 금액을 자연스럽게 설명하세요. 그냥 '본인 확인 부탁드립니다'를 반복하지 마세요.";
  }
  if (riskDecisionDue(state, scenario, userText) && !meaningfulRiskRequest(reply, actions)) {
    return "이제 상대가 선택해야 할 구체적인 잘못된 요청을 한 가지 제시할 차례입니다. 화자의 숨겨진 목적에 맞춰 위에 정해진 요청을 실제 문자 대사에 명시하고, 그 행동을 actions 배열에 kind/origin=sender로 기록하세요. 공식 앱에서 직접 확인하라는 무해한 안내로 대신하지 마세요.";
  }
  return undefined;
}
