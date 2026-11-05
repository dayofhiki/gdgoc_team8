/**
 * 미끼주의보 행동 중심 훈련 피드백.
 * '정상/사칭 맞히기'가 아니라 실제로 선택한 대응 행동을 먼저 보여 준다.
 * 이 모듈은 서버의 봉인된 행동 이벤트만 이용하며 대사 속 약속을 실행으로 간주하지 않는다.
 */
import type { Scenario, TrainingState, Choice } from "./realTraining.ts";
import { hasConcreteRequest } from "./trainingResolution.ts";
import { isIndependentCheck } from "./trainingVerification.ts";
import { isPersonalTopic, TRAINING_APPS } from "./trainingCatalog.ts";

export type BehaviorTone = "good" | "caution" | "neutral";
export type FeedbackPoint = { keyword: string; text: string };
export type ActionReceipt = { label: string; detail: string; tone: BehaviorTone };
export type FamilyPromise = { id: string; title: string; detail: string; practiced: boolean };
export type BehaviorFeedback = {
  tone: BehaviorTone;
  headline: string;
  explanation: string;
  focus: string;
  good: FeedbackPoint[];
  improve: FeedbackPoint[];
  receipts: ActionReceipt[];
  promises: FamilyPromise[];
  familyScenario: boolean;
  hasConfirmedAction: boolean;
};

const distinct = (points: FeedbackPoint[]) =>
  points.filter((point, index) => points.findIndex(p => p.keyword === point.keyword) === index);

export function buildBehaviorFeedback(state: TrainingState, scenario: Scenario): BehaviorFeedback {
  const events = state.events;
  const isFamily = isPersonalTopic(scenario.topic);
  const person = scenario.topic === "family" ? "가족" : "지인";
  const used = (choice: Choice) => events.some(e => e.choice === choice);
  const verified = events.some(event => isIndependentCheck(event, scenario));
  const triedCheck = events.some(event => event.evidence === "inconclusive");
  const consulted = used("family_contact");
  const stopped = used("stop");
  const sentMoney = used("comply");
  const sentData = used("share");
  const installed = used("install");
  const openedLink = used("open_link");
  const followedSender = used("verify_sender");
  const reliedOnChat = used("verify_chat");
  const moneyWithoutVerification = events.some(e => e.choice === "comply" && !e.verifiedBefore);
  const risk = sentData || installed || moneyWithoutVerification;
  const offeredRisk = hasConcreteRequest(state.messages);
  const askedToInstall = state.messages.some(message => message.actor === "them" &&
    message.actions?.some(action => action.linkPreview?.interaction === "install"));
  const remoteApp = scenario.topic === "card" && askedToInstall;
  const deliberatePause = offeredRisk && !sentMoney && !sentData && !installed && (stopped || verified || consulted);

  const good: FeedbackPoint[] = [];
  const improve: FeedbackPoint[] = [];

  if (verified) good.push({
    keyword: isFamily ? "저장된 연락처로 직접 확인했어요" : "공식 경로로 직접 확인했어요",
    text: isFamily
      ? `새로운 연락만 믿지 않고 원래 저장된 ${person} 연락처로 확인했어요.`
      : "상대가 제시한 연락처가 아닌 공식 경로로 직접 확인했어요.",
  });
  if (triedCheck && !verified) good.push({
    keyword: "문자와 별도로 확인해 봤어요",
    text: "다른 경로에서 확인을 시작했어요. 조회 결과만으로는 연락의 출처가 확인되지 않았어요.",
  });
  if (consulted && !isFamily) good.push({
    keyword: "가족에게 먼저 물어봤어요",
    text: "혼자서 판단하지 않고 가족에게 상황을 공유했어요.",
  });
  if (stopped && offeredRisk) good.push({
    keyword: "요청에 바로 응하지 않고 멈췄어요",
    text: "상대의 요구에 바로 응하지 않고 대화를 중단했어요.",
  });
  if (deliberatePause) good.push({
    keyword: "확인 전에는 돈과 정보를 보내지 않았어요",
    text: "확인 없이 돈이나 정보를 보내지 않고 다른 행동을 선택했어요.",
  });

  if (installed) improve.push({
    keyword: remoteApp ? "안내받은 원격 지원 앱을 설치하지 마세요" : "문자에서 요구한 앱을 설치하지 마세요",
    text: remoteApp ? "원격 지원 앱은 휴대전화 화면이나 조작 권한을 넘기는 데 악용될 수 있어요. 통화를 끝내고 카드사 공식 연락처에서 따로 확인해 주세요." :
      "익숙한 이름과 아이콘을 보여도 악성 앱일 수 있어요. 페이지를 닫고 문자와 별도로 확인해 주세요.",
  });
  if (sentData) improve.push({
    keyword: "개인정보를 보내기 전에 확인하세요",
    text: "요청받은 정보를 전송했어요. 실제 상황에서는 신원을 먼저 확인해 주세요.",
  });
  if (moneyWithoutVerification) improve.push({
    keyword: "돈을 보내기 전에 먼저 확인하세요",
    text: "확인하기 전에 송금했어요. 원래 연락처로 먼저 확인해 주세요.",
  });
  if (openedLink) improve.push({
    keyword: "문자 속 링크를 바로 누르지 마세요",
    text: "문자 속 링크를 열었어요. 다음에는 설치된 공식 앱에서 직접 조회해 보세요.",
  });
  if (followedSender) improve.push({
    keyword: "상대가 알려준 번호만 믿지 마세요",
    text: "상대가 알려준 번호는 독립적인 확인 경로가 아니에요.",
  });
  if (reliedOnChat) improve.push({
    keyword: "상대의 말만으로 신원을 믿지 마세요",
    text: "상대가 스스로 진짜라고 말해도 신원이 확인되지는 않아요.",
  });
  const noKnownCompany = scenario.topic === "job" || scenario.topic === "team_mission";
  if (!verified && !(noKnownCompany && stopped)) improve.push({
    keyword: isFamily ? "원래 저장된 번호로 직접 전화하세요" :
      noKnownCompany ? "확인할 수 없는 모집에는 돈을 보내지 마세요" :
      triedCheck ? "조회로 확인되지 않으면 공식 번호로 따로 문의하세요" : "공식 앱이나 대표번호로 직접 확인하세요",
    text: isFamily
      ? `원래 저장된 ${person} 번호로 직접 연락해 사실을 확인해 보세요.`
      : noKnownCompany ? "모집처를 확인할 수 없으면 답장을 멈추고 선입금이나 정보 제공을 보류해요."
      : "문자에 적힌 번호가 아니라 공식 앱이나 직접 찾은 대표번호로 확인해 보세요.",
  });
  if (stopped && !verified && !noKnownCompany && !triedCheck) improve.push({
    keyword: "대화를 끊은 뒤에도 확인하세요",
    text: "대화를 멈춘 뒤에도 필요한 연락이었는지 따로 확인할 수 있어요.",
  });

  const receipts: ActionReceipt[] = [];
  for (const e of events) {
    const receipt: ActionReceipt =
      e.choice === "verify" ? {
        label: e.evidence === "inconclusive" ? "확인 시도 · 결론 보류" :
          e.method === "official_directory" ? "공식 연락처에 직접 문의" :
          TRAINING_APPS.find(app => app.id === e.method)?.label ?? "공식 경로로 직접 확인",
        detail: e.notice ?? "메시지와 독립된 경로를 선택했어요.",
        tone: e.evidence === "inconclusive" ? "neutral" : "good",
      } : e.choice === "family_contact" ? {
        label: "저장된 번호로 가족에게 연락",
        detail: e.notice ?? (isFamily ? "기존 가족 연락처를 이용해 확인했어요." : "가족과 상의했어요. 기관 확인은 별도로 필요해요."),
        tone: "good",
      } : e.choice === "stop" ? {
        label: "대화 중단",
        detail: offeredRisk ? "요청에 즉시 응하지 않고 대화를 멈췄어요." : "상대에게 더 응하지 않고 대화를 끝냈어요.",
        tone: offeredRisk ? "good" : "neutral",
      } : e.choice === "comply" ? {
        label: "모의 송금",
        detail: e.verifiedBefore ? "독립 확인 후 송금을 선택했어요." : "별도 확인 전에 송금을 선택했어요.",
        tone: e.verifiedBefore ? "neutral" : "caution",
      } : e.choice === "share" ? {
        label: "모의 정보 전송",
        detail: "정보 제공을 선택했어요. 실제 정보는 전달되지 않았습니다.", tone: "caution",
      } : e.choice === "install" ? {
        label: remoteApp ? "모의 원격 지원 앱 설치" : "모의 앱 설치",
        detail: "문자 링크에서 앱 설치를 선택했어요. 실제 앱은 설치되지 않았어요.", tone: "caution",
      } : e.choice === "open_link" ? {
        label: "문자 링크 열람",
        detail: "실제 외부 사이트가 아닌 가상 페이지를 열어 봤어요.", tone: "caution",
      } : e.choice === "verify_sender" ? {
        label: "상대가 안내한 번호로 연락",
        detail: "발신자가 제시한 번호라 독립 확인이 아니에요.", tone: "caution",
      } : e.choice === "verify_chat" ? {
        label: "대화 상대에게 신원 질문",
        detail: "상대의 답변만으로 신원은 확인되지 않아요.", tone: "neutral",
      } : {
        label: "대응 행동 기록", detail: "선택한 행동을 다시 살펴보세요.", tone: "neutral",
      };
    receipts.push(receipt);
  }
  if (!receipts.length) receipts.push({
    label: "별도 확인 행동 없음",
    detail: "대화 중 말로 한 약속은 실행한 행동으로 기록하지 않아요.",
    tone: "neutral",
  });

  let tone: BehaviorTone = "neutral";
  let headline: string;
  let explanation: string;
  if (installed) {
    tone = "caution";
    headline = remoteApp ? "원격 지원 앱 설치 요구에서 멈춰요" : "문자 링크에서 앱 설치 요구가 나오면 멈춰요";
    explanation = remoteApp ? "배송 안내 번호에 전화한 뒤 도착한 링크에서 설치를 선택했어요. 직접 찾은 카드사 번호로 따로 확인해요." :
      "문자 링크에서 모의 앱 설치를 선택했어요. 페이지를 닫은 뒤, 저장된 연락처나 직접 찾은 공식 경로로 확인해요.";
  } else if (sentData) {
    tone = "caution";
    headline = "정보를 보내기 전에 확인이 필요해요";
    explanation = "이번에는 모의 정보 전송을 선택했어요. 실제 연락에서는 요청한 사람의 신원을 다른 경로로 확인해야 해요.";
  } else if (moneyWithoutVerification) {
    tone = "caution";
    headline = "송금 전에 한 번 더 확인해요";
    explanation = "이번에는 모의 송금을 먼저 선택했어요. 실제 가족이나 기관이어도 확인 절차를 생략하지 않는 연습이 중요해요.";
  } else if (verified) {
    tone = followedSender || openedLink ? "caution" : "good";
    headline = "상대의 말보다 직접 확인을 선택하셨어요";
    explanation = "문자와 별개의 경로에서 확인한 내용은 다음 대응을 결정하는 근거가 돼요.";
  } else if (stopped && !followedSender && !openedLink) {
    tone = offeredRisk ? "good" : "neutral";
    headline = offeredRisk ? "급한 요청 앞에서 멈추셨어요" : "이번 대화는 여기서 마쳤어요";
    explanation = !offeredRisk ? "구체적인 요청이 나오기 전에 대화를 끝냈어요. 다시 연습할 때는 어떤 용건인지 물어보고 대응을 선택해 보세요."
      : noKnownCompany ? "모집처를 확인하기 어렵더라도 선입금을 거절하고 대화를 끝낼 수 있어요."
      : "바로 응하지 않고 대화를 중단했어요. 확인이 필요하면 별도의 공식 경로에서 이어갈 수 있어요.";
  } else if (consulted) {
    tone = "good";
    headline = "혼자 판단하지 않고 도움을 요청하셨어요";
    explanation = "가족과 상의한 행동은 도움이 돼요. 은행이나 배송업체의 신원은 해당 기관의 공식 경로에서 따로 확인해 주세요.";
  } else if (followedSender || openedLink) {
    tone = "caution";
    headline = "확인 경로를 바꾸는 연습이 필요해요";
    explanation = "상대가 보내준 링크나 연락처를 이용했어요. 다음에는 직접 찾은 공식 경로를 사용해 보세요.";
  } else {
    headline = "이번에는 직접 확인까지 이어지지 않았어요";
    explanation = "상대가 사기범이었는지 맞히는 것보다, 실제로 확인 행동을 실행하는 것이 더 중요해요.";
  }

  const focus = verified
    ? "다음에도 낯선 연락이 오면 먼저 기존 번호·공식 앱으로 확인하세요."
    : scenario.safePractice;

  const promises: FamilyPromise[] = [
    {
      id: "verify",
      title: isFamily ? `원래 저장된 ${person} 번호로 직접 전화하기` :
        noKnownCompany ? "돈부터 요구하는 부업은 보류하기" : "내가 직접 찾은 공식 경로로 확인하기",
      detail: isFamily ? `새 번호에서 ${person}이라고 해도 원래 연락처를 먼저 사용해요.` :
        noKnownCompany ? "소액 정산을 받았다는 말이나 다른 팀원들의 재촉만으로 돈을 보내지 않아요." :
        "문자 속 번호나 링크 대신 공식 앱·대표번호를 사용해요.",
      practiced: noKnownCompany ? stopped : verified,
    },
    {
      id: "hold",
      title: remoteApp ? "문자나 전화에서 요구한 원격 지원 앱을 설치하지 않기" :
        askedToInstall ? "문자에서 받은 링크로 앱을 설치하지 않기" : "확인 전에는 돈과 개인정보를 보내지 않기",
      detail: remoteApp ? "반송이나 취소를 이유로 설치를 요청하면 통화를 끝내고 카드사 공식 연락처로 문의해요." :
        askedToInstall ? "안내 페이지를 닫고 발신자에게 별도로 확인해요." : "급하다는 말보다 확인 절차가 먼저예요.",
      practiced: askedToInstall ? askedToInstall && !installed && (stopped || verified) : deliberatePause,
    },
    {
      id: "family",
      title: scenario.topic === "family" ? "가족과 정해 둔 확인 질문을 직접 확인하기" : "혼자 판단하기 어렵다면 믿을 수 있는 사람에게 물어보기",
      detail: scenario.topic === "family" ? "답은 메시지에 적지 않고 직접 통화하거나 만나서 확인해요." :
        "가족의 조언과 기관의 공식 신원 확인은 별개예요.",
      practiced: !isFamily && consulted,
    },
  ];

  return {
    tone, headline, explanation, focus,
    good: distinct(good).slice(0, 3),
    improve: distinct(improve).slice(0, 3),
    receipts, promises: installed && scenario.topic === "card" ? [promises[1], promises[0], promises[2]] : promises, familyScenario: isFamily,
    hasConfirmedAction: events.length > 0,
  };
}
