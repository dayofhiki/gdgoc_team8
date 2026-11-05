/**
 * SY/AI_System judge.ts의 "발화 추정 vs 실제 UI 이벤트" 및 반복·물러남 규칙에서
 * 필요한 대화 힌트만 분리했다. 여기의 텍스트 해석은 채점·송금·검증의 근거가 될 수 없다.
 *
 * 서버의 봉인된 state.events만 실제 행동으로 인정한다.
 */
import type { Message, Identity } from "./realTraining.ts";

export type LearnerContext = {
  repeats: number;
  priorClaims: number;
  priorSuspicions: number;
  claimsAction: boolean;
  suspectsSender: boolean;
  verificationClaim: boolean;
};

const normalized = (value: string) =>
  value.toLowerCase().replace(/[\s.,!?~…·'"“”‘’()]/g, "");

function claimsAction(text: string): boolean {
  const positiveMoney = /(보냈어|보냈어요|보냈습니다|입금했어|입금했어요|입금했습니다|송금했어|송금했어요|이체했어|이체했어요)/.test(text) &&
    !/(안|못|아직|않았|절대)\s*(?:돈을?\s*)?(보냈|입금했|송금했|이체했)/.test(text);
  const positiveLink = /(링크\s*(?:눌렀|열었|클릭했)|(?:눌렀|클릭했|접속했)(?:어|어요|습니다|다))/.test(text) &&
    !/(안|못|아직|않았|절대)\s*(?:링크\s*)?(눌렀|열었|클릭했|접속했)/.test(text);
  return positiveMoney || positiveLink;
}

const isSuspicion = (text: string) =>
  /사기꾼|보이스피싱|스미싱|피싱|사칭|사기(?:야|지|죠|네|같|아니|맞)/.test(text);

const claimsVerification = (text: string) =>
  /(?:딸|아들|자녀|가족|엄마|아빠|은행|택배사).{0,20}(?:옆에|물어봤|확인했|통화했|전화했)/.test(text) &&
  !/(?:안|못|아직)\s*(?:확인|전화|통화)/.test(text);

/** '그만 연락해'라는 사칭범에 대한 거절은 훈련 중단으로 취급하지 않는다. */
export function isExplicitTrainingStop(text: string): boolean {
  return /(?:연습|훈련|상황극)(?:을|은)?\s*(?:그만|중단|종료|끝내|끝낼|멈춰|멈출|마칠|마치)/.test(text) ||
    /(?:그만|중단|종료|끝내|끝낼|멈춰|멈출)\s*(?:할래|할게|해줘|하고싶어)?\s*(?:이\s*연습|이\s*훈련|이\s*상황극)/.test(text);
}

export function learnerContext(messages: Message[], input: string): LearnerContext {
  const earlier = messages.filter(m => m.actor === "me").map(m => m.text);
  const norm = normalized(input);
  const repeats = norm.length >= 4 ? earlier.filter(s => {
    const prev = normalized(s);
    return prev.length >= 4 && (prev === norm || (Math.min(prev.length, norm.length) >= 8 && (prev.includes(norm) || norm.includes(prev))));
  }).length : 0;
  return {
    repeats,
    priorClaims: earlier.filter(claimsAction).length,
    priorSuspicions: earlier.filter(isSuspicion).length,
    claimsAction: claimsAction(input),
    suspectsSender: isSuspicion(input),
    verificationClaim: claimsVerification(input),
  };
}

/** 프롬프트 가이드일 뿐 채점 결과가 아니다. 행동 완료 여부는 서버 이벤트에서만 판단한다. */
export function learnerTurnGuidance(
  context: LearnerContext,
  identity: Identity,
  recordedActionCount: number,
): string {
  const notes = [
    "학습자의 발화 의미는 추정일 뿐이다. 실제 링크 클릭·송금·신원 확인은 서버가 기록한 행동 이벤트로만 인정한다.",
    "대화 맥락은 직전 말뿐 아니라 앞선 질문·의심·반복까지 본다. 새로운 핑계나 송금 요구를 기계적으로 반복하지 않는다.",
  ];
  if (context.claimsAction) {
    notes.push(
      recordedActionCount
        ? "사용자가 행동했다고 말한다. 서버 이벤트의 구체적 종류가 입력으로 제공되지 않았으므로 실제 행동 종류를 추정하거나 확인됐다고 말하지 않는다."
        : "사용자가 송금·링크 클릭 등을 이미 했다고 주장했다. 하지만 앱에 기록된 행동 이벤트가 없으므로 실제로 했다고 가정하면 안 된다. 거짓말이라고 단정하지 않는다.",
    );
    if (identity === "fraud") {
      notes.push(context.priorClaims > 0 || context.repeats > 0
        ? "같은 행동 주장이 반복되면 더 이상 '아직 안 왔다'고 기계적으로 되묻지 말고 불확실성을 인정하거나 자연스럽게 물러난다."
        : "행동했다고 처음 주장했다면 실제 확인한 척하지 말고 문맥상 필요할 때만 짧게 되물을 수 있다.");
    }
  }
  if (context.verificationClaim) {
    notes.push("사용자가 가족·기관에 이미 확인했다고 말해도 서버의 확인 행동 이벤트 없이 실제 확인이 성립한 것으로 단정하지 않는다. 발화 자체에는 자연스럽게 반응한다.");
  }
  if (context.suspectsSender) {
    notes.push(identity === "fraud"
      ? (context.priorSuspicions > 0 ? "사칭 의심이 반복된다. 끝없이 설득하는 대신 한 번 자연스럽게 물러나는 것을 고려한다." : "처음 의심받았다. 불필요하게 새 증거나 비밀을 만들어내지 않고 상황에 맞게 짧게 반응한다.")
      : "상대가 사기라고 의심한다. 정상인으로서 불쾌하거나 당황할 수 있지만 정답인 확인 경로를 먼저 떠먹이지 않고 대답한다.");
  }
  if (context.repeats >= 2) notes.push("학습자가 같은 말을 세 번 이상 했다. 같은 주장이나 안내를 계속 반복하지 말고 자연스럽게 대화를 정리할 수 있다.");
  return notes.join("\n");
}
