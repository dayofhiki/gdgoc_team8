/**
 * 채팅 대사에 없는 모의 행동 버튼을 생성하지 않기 위한 마지막 서버 가드.
 * 1차 배우 모델의 행동 제안과 2차 검수의 해석이 일치할 때만 통과한다.
 * 검수 장애 시에는 1차 제안을 반드시 대사의 표면적 요청으로 다시 확인한다.
 *
 * 텍스트 패턴은 시나리오/사칭 여부를 분류하는 용도가 아니라,
 * 모델이 지어낸 위험 행동 버튼을 보수적으로 걸러내는 보조 근거다.
 */
import type { Identity } from "./realTraining.ts";
import type { Kind, Proposed } from "./trainingActions.ts";

function hasExplicitCue(text: string, kind: Kind): boolean {
  const t = text.replace(/\s+/g, " ");
  const money = /송금|이체|입금|돈|금액|수리비|비용|결제|대금|납부/;
  const request = /보내|부탁|해\s*주|해줄|해\s*주실|송금|이체|입금|옮겨|결제|지불|납부/;
  if (kind === "transfer") return money.test(t) && request.test(t);
  if (kind === "link") {
    const link = /링크|사이트|웹\s*(?:주소|페이지)|인터넷\s*주소|문자(?:로|에)\s*(?:보낸|있는)\s*주소|페이지/;
    const action = /열어|누르|눌러|들어가|접속|클릭|확인|입력|방문|통해|진행/;
    if (!link.test(t) || !action.test(t)) return false;
    if (/(?:링크|사이트|페이지|웹\s*주소).{0,15}(?:누르지|열지|접속하지|클릭하지)/.test(t) &&
        !/(?:링크|사이트|페이지|웹\s*주소).{0,30}(?:누르세요|눌러\s*주세요|열어\s*주세요|접속하세요|들어가세요)/.test(t)) return false;
    return true;
  }
  if (kind === "phone") return /전화|통화|연락|고객센터|대표번호/.test(t) &&
    /(?:전화|통화|연락)(?:해|하|를\s*걸|을\s*걸|\s*주|\s*부탁)|번호로\s*(?:걸|연락)|걸어\s*(?:주|보)/.test(t) &&
    !/(?:전화|통화|연락)(?:하지\s*마|할\s*필요\s*없)/.test(t);
  if (kind === "app") return /앱|어플|애플리케이션/.test(t) &&
    /(?:열어|켜|실행|들어가|조회|확인|접속|사용|보실|보세요)/.test(t) &&
    !/(?:앱|어플).{0,12}(?:열지\s*마|쓰지\s*마|사용하지\s*마)/.test(t);
  return /주소|개인정보|정보|성함|이름|전화번호|인증|비밀번호|신분증|주민|계좌/.test(t) &&
    /입력|알려|제출|작성|전송|회신|적어|보내|공유|남겨/.test(t) &&
    !/(?:정보|주소|번호|비밀번호).{0,12}(?:보내지|입력하지|알리지|제출하지)/.test(t);
}

export function groundedProposals(
  reply: string,
  primary: Proposed[],
  audit: Proposed[] | undefined,
  identity: Identity,
): Proposed[] {
  if (!reply.trim()) return [];
  // 정상 화자는 안내 경로/개인정보 전송을 직접 제안하지 않는다.
  const allowed = identity === "legitimate" ? new Set<Kind>(["transfer"]) :
    new Set<Kind>(["transfer", "link", "phone", "app", "provide_data"]);
  return primary.filter(p => {
    if (!allowed.has(p.kind) || !hasExplicitCue(reply, p.kind)) return false;
    // 두 번째 모델의 독립 검수가 실제 완료되면 같은 행동과 출처를 확인해야 한다.
    // 앱/전화의 출처 불일치는 학습자의 실제 위험도 평가를 바꾸므로 반드시 걸러낸다.
    return !audit || audit.some(a => a.kind === p.kind && a.origin === p.origin);
  });
}
