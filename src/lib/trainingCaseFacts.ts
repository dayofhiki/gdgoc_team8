/**
 * 세션 시작 시 한 번만 선택하는 교육용 사건 앵커.
 * 이는 발신자가 설명/주장하는 구체적인 정황이지 독립 확인된 증거가 아니다.
 * 정상/사칭 쌍에는 동일한 앵커를 전달하므로 디테일만으로 정답이 드러나지 않는다.
 * 실제 인명, 은행, 송장, 거래번호, 전화번호, 금액은 만들지 않는다.
 */
import type { Scenario } from "./realTraining.ts";

export const CASE_VARIANTS = [
  [
    "휴대전화 화면이 갑자기 켜지지 않아 임시 기기로 문자를 보낸 상황이다. 오늘 수리 접수를 알아보려 하지만 아직 접수한 것은 아니다.",
    "휴대전화 터치가 먹통이라 임시 기기로 문자를 보냈다. 고장 원인이나 수리비는 아직 모른다.",
    "휴대전화 액정이 계속 깜빡거려 평소 기기에서 연락하기 어렵다. 다른 기기를 잠깐 빌려 문자를 보냈다.",
  ],
  [
    "발신자는 배송지의 상세 주소 항목에 빠진 내용이 있어 확인 중이라고 안내한다. 주문 물품, 업체명, 송장번호는 아직 알려지지 않았다.",
    "발신자는 배송 전 수취 장소를 더 구체적으로 확인할 필요가 있다고 안내한다. 구체적인 업체명, 품목, 운송장 번호는 알 수 없다.",
    "발신자는 배송 주소가 등록된 내용과 일부 맞지 않아 확인이 필요하다고 안내한다. 실제 배송 여부는 별도 확인 전까지 미확정이다.",
  ],
  [
    "발신자는 온라인 거래 승인 시도가 평소와 달라 확인 메시지를 보냈다고 주장한다. 거래 금액, 상호, 은행명은 아직 미설정이다.",
    "발신자는 새로운 기기에서 거래 시도가 감지됐다는 취지로 연락했다고 주장한다. 금액, 정확한 시각, 거래처는 아직 모른다.",
    "발신자는 최근 거래 내역에 확인이 필요한 항목이 한 건 있다는 취지로 연락했다고 주장한다. 계좌·가맹점·거래번호는 설정되지 않았다.",
  ],
] as const;

export const CASE_VARIANT_COUNT = 3;

export function caseDetail(scenario: Pick<Scenario, "id">, variant: number): string {
  const category = Number(scenario.id.split("-")[0]);
  if (!Number.isInteger(category) || category < 0 || category >= CASE_VARIANTS.length ||
      !Number.isInteger(variant) || variant < 0 || variant >= CASE_VARIANT_COUNT) {
    throw new Error("INVALID_CASE_VARIANT");
  }
  return CASE_VARIANTS[category][variant];
}
