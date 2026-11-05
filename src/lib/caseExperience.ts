/**
 * 사례의 실제 공개된 수법을 휴대전화 조작 중심의 짧은 경험으로 전달하기 위한 화면 문구.
 * 사건 진행 중에는 교육용 해설을 숨기고, 행동 후에만 결과와 근거를 보여준다.
 * 모든 결과는 가상 시뮬레이션이며 사건의 개별 피해자 행동이라고 주장하지 않는다.
 */
export type CaseExperience = {
  actions: readonly [
    { label: string; outcome: string },
    { label: string; outcome: string },
    { label: string; outcome: string },
  ];
  riskPath: readonly [string, string, string];
};

export const CASE_EXPERIENCES: Record<string, CaseExperience> = {
  invitation: {
    actions: [
      { label: "지인에게 직접 전화", outcome: "저장된 연락처로 전화를 걸었습니다. 낯선 앱은 설치하지 않았어요." },
      { label: "청첩장 앱 설치", outcome: "출처가 불확실한 앱에 기기 접근 권한을 줄 위험이 생겼어요." },
      { label: "가족에게 먼저 상의", outcome: "설치를 보류했습니다. 다음에는 지인에게 직접 확인할 수 있어요." },
    ],
    riskPath: ["지인 번호처럼 보이는 문자", "청첩장 앱 설치 유도", "주소록 유출·재전파 위험"],
  },
  team: {
    actions: [
      { label: "입금하지 않고 중단", outcome: "추가 입금을 멈췄습니다. 돈을 더 잃을 위험을 줄였어요." },
      { label: "팀 미션 비용 입금", outcome: "정산은 보장되지 않은 채 더 큰 입금 요구를 받을 수 있어요." },
      { label: "업체와 계약 확인", outcome: "입금을 보류하고 별도 경로로 업무의 실체를 확인합니다." },
    ],
    riskPath: ["소액 정산으로 신뢰 확보", "팀원 핑계로 선입금", "추가 송금 압박"],
  },
  card: {
    actions: [
      { label: "공식 번호를 직접 찾기", outcome: "문자에 나온 번호 대신 직접 찾은 공식 연락처로 확인합니다." },
      { label: "문자 속 번호로 전화", outcome: "가짜 상담센터로 연결될 수 있습니다. 설치 요구에 주의해야 해요." },
      { label: "카드 앱에서 직접 확인", outcome: "이미 설치한 카드 앱에서 발급·배송 내역을 확인합니다." },
    ],
    riskPath: ["신청하지 않은 카드 배송", "문자 속 반송번호 유도", "가짜 상담센터·앱 설치 위험"],
  },
  coupon: {
    actions: [
      { label: "설치 중단", outcome: "앱 설치와 접근 권한 허용을 멈췄습니다." },
      { label: "휴대전화 권한 허용", outcome: "앱이 문자와 기기 정보에 접근할 위험이 생겼어요." },
      { label: "QR코드를 지인에게 전달", outcome: "내가 설치하지 않아도 지인에게 위험이 퍼질 수 있어요." },
    ],
    riskPath: ["무료 쿠폰으로 관심 유도", "QR코드·앱 설치 요구", "정보 탈취·재유포 위험"],
  },
  account: {
    actions: [
      { label: "공식 앱 직접 열기", outcome: "문자 링크는 닫고 기존 앱에서 로그인 기록을 확인합니다." },
      { label: "문자 속 화면에 로그인", outcome: "가짜 로그인 화면에 계정 정보를 넘길 위험이 생겼어요." },
      { label: "인증번호만 전달", outcome: "인증번호만 알려줘도 계정 접근에 악용될 수 있어요." },
    ],
    riskPath: ["새 기기 로그인 경고", "긴급 확인 링크 클릭", "가짜 로그인에서 정보 탈취"],
  },
  institution: {
    actions: [
      { label: "공식 기관에 직접 연락", outcome: "문자와 별개로 직접 찾은 공식 기관 번호에 문의합니다." },
      { label: "문자 속 조회 화면 열기", outcome: "가짜 사건조회 화면으로 유도돼 개인정보가 노출될 수 있어요." },
      { label: "신분증 사진 먼저 전송", outcome: "신분증 정보가 추가 명의도용에 악용될 위험이 생겼어요." },
    ],
    riskPath: ["수사기관 명의로 접근", "사건 연루·긴급 확인 압박", "조회 링크·정보 탈취 유도"],
  },
};
