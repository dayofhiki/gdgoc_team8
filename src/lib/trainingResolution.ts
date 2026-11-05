/**
 * 훈련 대화의 '목적 달성' 종료 조건.
 *
 * 숨겨진 정체를 읽어 결론을 추측하거나 단순 턴 수로 종결하지 않는다.
 * (1) 실제 서버 행동 이벤트로 독립 확인한 결과 + 이미 등장한 구체적 요청,
 * (2) 사용자의 명시적 대화 거절/종료, (3) 대응할 요청이 끝난 뒤 반복
 * 처럼 관찰 가능한 진행 상태만 이용한다.
 *
 * 실제 확인 행위 자체는 조기에 훈련을 건너뛰는 수단이 되어서는 안 된다.
 */
import type { Message, Scenario, TrainingState, Choice } from "./realTraining.ts";

const requestKinds = new Set(["transfer", "link", "provide_data"]);
const legacyRequests = new Set(["transfer", "share", "link"]);

function actualRequestInText(input: string): boolean {
  const t = input.replace(/\s+/g, "").replace(/[“”"']/g, "");
  // AI가 구조화 행동을 빼먹어도 "80만 원 보내줄 수 있어?"를 놓치지 않는다.
  // 과거 회상/경고 문구는 요청으로 취급하지 않는다.
  const moneyRequest =
    /(?:돈|수리비|송금|이체|입금|\d{1,4}(?:만|천)?원).{0,50}(?:보내줄|보내줘|보내주세요|보내주실|보낼수|부탁해|입금해줘|이체해줘|송금해줘|빌려줄|해줄수)/.test(t) ||
    /(?:송금해|입금해|이체해|보내줘|보내줄).{0,30}(?:돈|수리비|\d{1,4}(?:만|천)?원)/.test(t);
  const linkRequest =
    /(?:링크|사이트|웹주소|페이지).{0,30}(?:눌러|클릭|접속|열어|들어가|입력해|확인해|변경해)/.test(t);
  const infoRequest =
    /(?:인증번호|비밀번호|개인정보|주민번호|계좌번호|주소|성함).{0,30}(?:알려|보내|입력|전송|제출|작성해)/.test(t);
  const negated = /(?:보내지마|보내지마세요|누르지마|누르지마세요|입력하지마|입력하지마세요|송금하지마|하지마세요|안보내도돼)/.test(t);
  return !negated && (moneyRequest || linkRequest || infoRequest);
}

/** 단순 연락·설명은 제외. 배우가 실제로 제시한 선택/요구만 진행의 증거로 삼는다. */
export function hasConcreteRequest(messages: Message[]): boolean {
  return messages.some(m => m.actor === "them" && (
    (m.actions ?? []).some(a => requestKinds.has(a.kind) ||
      (a.kind === "phone" && a.origin === "sender")) ||
    (m.offers ?? (m.offer ? [m.offer] : [])).some(v => legacyRequests.has(v)) ||
    actualRequestInText(m.text)
  ));
}

/** 사칭 의심 질문은 대화 중단이 아니다. 사용자 스스로 분명히 거절했는지만 판단한다. */
export function clearlyDisengaged(text: string): boolean {
  const s = text.replace(/\s+/g, "").replace(/[.!~…]+$/g, "");
  if (/[?？]$/.test(s)) return false;
  return /(?:그만|다시|더이상|더는)(?:문자|연락|말|대화)(?:하지마|하지마세요|하지말|그만|끊|해|하세요)/.test(s) ||
    /(?:연락|문자|대화)(?:하지마|그만해|그만하세요|끊을게|끝낼게|끝냅니다|안할게)/.test(s) ||
    /(?:차단할게|차단합니다|신고할게|신고합니다|신고할거야|신고하겠습니다)/.test(s) ||
    /(?:돈|수리비|송금|입금|이체)(?:은|는|을|를)?(?:절대)?(?:안보내|못보내|안할|안해|거절|못줘|안줘)/.test(s);
}

/** 독립 확인이 명백히 반박한 요청에 다시 대응하게 만들지 않는다. */
export function shouldResolveAfterIndependentCheck(
  state: TrainingState,
  scenario: Scenario,
  choice: Choice,
  verification: TrainingState["verification"],
): boolean {
  const independent = choice === "verify" ||
    (choice === "family_contact" && scenario.id.startsWith("0-"));
  return independent && verification === "failed" && hasConcreteRequest(state.messages);
}

/**
 * 확인 수단을 너무 일찍 사용했다면 계속 진행.
 * 구체적 요청을 거절하거나 검증된 모순을 반박했다면 배우의 추가 설득을 호출하지 않는다.
 */
export function shouldResolveOnLearnerReply(state: TrainingState, text: string): boolean {
  const asked = hasConcreteRequest(state.messages);
  const dismissed = clearlyDisengaged(text);
  if (asked && dismissed) return true;
  if (state.verification !== "failed") return false;
  if (asked) return true; // 확인 결과가 이미 있는데 추가 변명을 들을 필요가 없다.
  return dismissed || /(?:사기|피싱|사칭|가짜|거짓말|구라|너아니|니가아니)/.test(text.replace(/\s+/g, ""));
}

/** 조기 확인 이후 배우가 뒤늦게 구체적 요청을 제시한 경우에도 종료. */
export function shouldResolveAfterActorReply(state: TrainingState): boolean {
  return state.verification === "failed" && hasConcreteRequest(state.messages);
}
