/**
 * 의미 있는 '행동 선택'이 등장하는 훈련용 대화 품질 규칙.
 * 실제 위험 행동·송금·개인정보 입력은 실행되지 않는다.
 * 사칭임을 사용자에게 드러내거나 정답 버튼을 추천하지 않는다.
 */
import type { Scenario, TrainingState } from "./realTraining.ts";
import type { Proposed } from "./trainingActions.ts";
import { BANK_CLAIMS, caseBranch } from "./trainingCaseFacts.ts";
import { replySimilarity, revealsSimulation } from "./trainingDialogue.ts";
import { groundedProposals } from "./trainingActionGuard.ts";
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
  card: "신청하지 않은 카드의 반송을 빌미로, 문자에 첨부한 가상의 반송 접수 번호로 전화해 달라고 요청한다. 공식 대표번호라고 소개하지 않는다.",
  team_mission: "다른 사람의 소액 정산을 주장한 뒤 팀 전체가 정산되려면 상품대금을 먼저 입금해 달라고 요청한다. 상대가 이미 정산받았다고 하지 않는다.",
  health: "검진 안내를 설명한 뒤 문자 속 가상 예약·결과 확인 링크를 사용해 달라는 요청. 검사 결과나 질병은 지어내지 않는다.",
};

export function raisesObjection(text: string): boolean {
  return /사기|피싱|수상|의심|믿기|본인\s*맞|누구세요|(?:너|정말|진짜).{0,10}(?:맞아|맞나요|맞으세요)|신청.{0,10}(?:안|없|않)|제가.{0,8}(?:한\s*(?:거래|결제|게).{0,5}아[니닌닙]|한\s*적\s*없)|(?:원래|기존|공식).{0,12}(?:번호|앱|연락)|왜.{0,12}(?:문자|전화|안내)/.test(text);
}

/** A response to a routine procedure advances the pretext instead of replaying the introduction. */
export function respondsToProcedure(state: TrainingState, scenario: Scenario, text: string): boolean {
  if (scenario.identity !== "fraud" || state.turns === 0 || /[?？]$/.test(text.trim())) return false;
  const last = state.messages.findLast(message => message.actor === "them")?.text ?? "";
  const procedure = /수령\s*거부|반송|취소|변경|재접수|접수|보류|중단/;
  const directive = /(?:거부|반송|취소|변경|보류|중단)(?:로|으로|해|하겠|할게|부탁)|(?:안\s*받|받지\s*않)/;
  const acknowledgement = /^(?:네|예|응|그렇게 해\s*(?:주세요|줘)|부탁드려요)[.!\s]*$/;
  if (directive.test(text)) return procedure.test(last) || /처리|표시|배송|예약|발급|신청|결제/.test(last);
  return procedure.test(last) &&
    (acknowledgement.test(text.trim()) &&
      /(?:할까요|해\s*드릴까요|원하시나요|하시겠어요)[?？]/.test(last));
}

export function riskDecisionDue(state: TrainingState, scenario: Scenario, userText: string): boolean {
  const episode = caseBranch(scenario, state.caseVariant ?? 0);
  // 한 번은 새로 나온 의심을 받아 준다. 계속 의심해도 요구 시점이 무한히 밀리지는 않는다.
  const respondFirst = state.turns === episode.requestAfterTurns && raisesObjection(userText);
  return scenario.identity === "fraud" && (respondsToProcedure(state, scenario, userText) ||
    (state.turns >= episode.requestAfterTurns && !respondFirst)) && !state.closed && !hasConcreteRequest(state.messages) && !clearlyDisengaged(userText);
}

export function isActionableReply(reply: string, actions: Proposed[]): boolean {
  return actions.some(action => action.origin === "sender") ||
    hasConcreteRequest([{ actor: "them", text: reply }]) ||
    /(?:이|아래|첨부한|적힌|안내한|보낸|저희)\s*번호로.{0,14}(?:전화|통화|연락)\s*(?:해|하|주)|(?:앱|프로그램).{0,10}설치\s*(?:해|하|가\s*필요)/.test(reply);
}

export function meaningfulRiskRequest(reply: string, proposals: Proposed[]): boolean {
  return groundedProposals(reply, proposals, undefined, "fraud").some(a =>
    a.origin === "sender" && ["transfer", "link", "provide_data", "phone"].includes(a.kind));
}

export function bankQuestionNeedsSpecifics(userText: string): boolean {
  // "제가 한 거래가 아닌데요"는 정보 질문이 아니라 부인이다.
  // 이를 상세 조회 질문으로 오인하면 가장 중요한 위험 요청 단계가 밀린다.
  return /(?:무슨|어떤|뭐|얼마|가맹점|금액|내역|언제|어디)/.test(userText) &&
    /(?:거래|결제|내역|상품|가맹점|금액|뭐|어디|언제|얼마)/.test(userText);
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
  if (revealsSimulation(reply)) return "연습이나 가상의 상황을 대사에 설명하지 말고 실제 문자 상대처럼 말하세요.";
  if (scenario.topic === "bank" && bankQuestionNeedsSpecifics(userText) &&
      (!bankAnswerIsConcrete(reply) || (state.caseVariant !== undefined && !bankClaimMatches(reply, state.caseVariant)))) {
    return "상대가 '어떤 거래/얼마'인지 물었습니다. 세션에 고정된 가상 거래 유형과 금액을 자연스럽게 설명하세요. 그냥 '본인 확인 부탁드립니다'를 반복하지 마세요.";
  }
  const due = riskDecisionDue(state, scenario, userText);
  if (scenario.identity === "fraud" && !due && !(scenario.topic === "bank" && bankQuestionNeedsSpecifics(userText))) {
    const actorMessages = state.messages.filter(message => message.actor === "them");
    const opening = actorMessages[0]?.text;
    if (state.turns > 0 && ((opening && replySimilarity(opening, reply) >= 0.60) ||
        actorMessages.slice(1).some(message => replySimilarity(message.text, reply) >= 0.82))) {
      return "첫 안내를 다시 하지 말고 이미 진행한 절차에 이어서 응답하세요.";
    }
    if (!hasConcreteRequest(state.messages) &&
        /(?:반송|수령\s*거부|취소|배송).{0,12}(?:완료됐|처리됐|완료해\s*드렸|처리해\s*드렸)/.test(reply)) {
      return "훈련에서 실행하지 않은 절차를 완료했다고 말하지 마세요.";
    }
  }
  if (scenario.identity === "fraud" && !due && isActionableReply(reply, actions)) {
    return "지금은 아직 새 행동을 요구하지 말고, 직전 반응에 답하면서 설정에 맞는 설명을 한 가지 더 전하세요.";
  }
  if (due) {
    const expected = caseBranch(scenario, state.caseVariant ?? 0);
    if (!meaningfulRiskRequest(reply, actions) ||
      !actions.some(action => action.kind === expected.kind && action.origin === "sender")) {
      return "이제 상대가 선택해야 할 구체적인 잘못된 요청을 한 가지 제시할 차례입니다. 이번 사건에 지정된 요청만 수행하세요: " +
        expected.request + ". 대사에 이를 명시하고 actions 배열에도 kind=" + expected.kind +
        ", origin=sender로 기록하세요. 공식 앱 확인 안내로 대체하거나 다른 사기 요구로 바꾸지 마세요.";
    }
  }
  return undefined;
}

function bankClaimMatches(reply: string, variant: number): boolean {
  const claim = BANK_CLAIMS[variant];
  const merchant = claim.split("에서")[0];
  const amount = claim.match(/\d+만/)?.[0];
  const digits = amount?.slice(0, -1);
  const normalized = reply.replace(/[\s,]/g, "");
  return reply.includes(merchant) && !!digits &&
    (normalized.includes(digits + "만원") || normalized.includes(digits + "0000원"));
}
