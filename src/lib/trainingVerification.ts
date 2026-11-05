import type { Choice, Event, PhoneMethod, Scenario } from "./realTraining.ts";
import { isPersonalTopic } from "./trainingCatalog.ts";

type Evidence = NonNullable<Event["evidence"]>;

export function verificationOutcome(
  scenario: Scenario, choice: Choice, method?: PhoneMethod,
): { evidence: Evidence; notice: string } | undefined {
  if (choice !== "verify" && !(choice === "family_contact" && isPersonalTopic(scenario.topic))) return;
  const legitimate = scenario.identity === "legitimate";
  const evidence = legitimate ? "confirmed" : "failed";

  if (method === "bank_app" && scenario.topic === "bank") {
    return legitimate
      ? { evidence, notice: "은행 앱에서 문자 내용과 일치하는 거래 관련 안내를 찾았어요." }
      : { evidence: "inconclusive", notice: "은행 앱에 일치하는 승인 내역이 없어요. 승인 시도 자체가 있었는지, 이 문자가 은행에서 온 것인지는 앱 내역만으로 확인하기 어려워요." };
  }
  if (method === "bank_app" && scenario.topic === "loan") {
    return { evidence: "inconclusive", notice: "은행 앱에는 이 문자와 연결된 대출 상담 내역이 없어요. 앱에 내역이 없다는 것만으로 연락의 출처를 확인할 수는 없어요." };
  }
  if (method === "card_app") {
    return { evidence: "inconclusive", notice: "카드 앱에 일치하는 배송 정보가 없어요. 이 화면만으로 신규 발급이나 반송 접수 여부를 확인하기는 어려워요." };
  }
  if (method === "official_directory" && !legitimate && ["job", "team_mission"].includes(scenario.topic)) {
    return { evidence: "inconclusive", notice: "상대가 회사나 모집처를 밝히지 않아 공식 연락처를 찾을 수 없었어요. 이 상태로도 답장을 멈추고 대화를 끝낼 수 있어요." };
  }

  const sourceNotice: Partial<Record<PhoneMethod, string>> = {
    delivery_app: legitimate ? "택배 앱에서 배송 건과 주소 확인 요청이 일치하는 것을 확인했어요." :
      "택배 앱에서 해당 주문을 확인했어요. 배송지 수정 요청은 없고 주소도 올바르게 등록돼 있어요.",
    traffic_app: legitimate ? "교통민원 앱에서 해당 교통 고지 내역을 확인했어요." :
      "교통민원 앱에서 해당 고지 건을 조회했어요. 문자에서 안내한 고지 내역은 없어요.",
    health_app: legitimate ? "건강보험 앱에서 문자와 일치하는 검진 안내를 확인했어요." :
      "건강보험 앱에서 검진 안내를 조회했어요. 문자에서 말한 검진 안내나 정보 제출 요청은 없어요.",
    official_directory: scenario.topic === "bank"
      ? legitimate ? "직접 찾은 은행 대표번호에서 문자 내용과 일치하는 안내를 확인했어요." :
        "직접 찾은 은행 대표번호로 전화했어요. 은행은 해당 승인 시도 안내 문자를 보낸 기록이 없다고 답했어요."
      : scenario.topic === "delivery"
        ? legitimate ? "직접 찾은 택배사 고객센터에서 배송 건과 주소 확인 요청을 확인했어요." :
          "직접 찾은 택배사 고객센터에서 해당 주소 수정 요청을 보낸 적이 없다는 답을 받았어요."
        : scenario.verification,
  };
  return { evidence, notice: (method && sourceNotice[method]) || scenario.verification };
}

export function isIndependentCheck(event: Event, scenario: Scenario): boolean {
  return (event.choice === "verify" || (event.choice === "family_contact" && isPersonalTopic(scenario.topic))) &&
    event.evidence !== "inconclusive";
}
