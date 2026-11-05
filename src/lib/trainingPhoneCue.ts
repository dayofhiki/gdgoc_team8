/**
 * 휴대전화 아이콘의 단발성 강조 시점을 정한다.
 * 판정 결과/시나리오의 숨겨진 정체를 입력받지 않는다.
 * 사용자가 필요한 행동을 스스로 고르는 UI이므로 구체적인 정답은 보여주지 않는다.
 */
type VisibleAction = { kind: string };
type VisibleReply = { text: string; actions?: VisibleAction[] };

const userThinkingOfTools =
  /(?:확인(?:해|할|해야|하고|해볼|해보|하겠|하려)|조회(?:해|할|하고)|알아보(?:겠|려|자|고)|전화(?:해|할|걸|하려)|통화(?:해|할|하겠)|연락(?:해|할|하겠)|앱(?:에서|으로|켜|열)|번호(?:를|로).{0,16}(?:확인|전화|걸)|(?:다른|기존|원래|저장된|대표) ?번호)/;

const explicitRequest =
  /(?:송금|이체|입금|결제|돈 ?보내|수리비).{0,25}(?:해|해줘|주세요|주실|부탁|가능|필요)|(?:링크|주소|사이트).{0,24}(?:눌러|열어|접속|입력|확인해|변경해)|(?:성함|이름|비밀번호|인증번호|개인정보|주소|계좌번호|잔액).{0,35}(?:보내|알려|입력|전송|답장)|(?:전화|통화|연락).{0,15}(?:해줘|주세요|걸어|하실|부탁)/;

// '직접 진행한 거래인지 확인 부탁드립니다'처럼 행동 판단을 요구하지만
// action 구조화가 없어도 휴대전화 기능을 발견할 수 있게 한다.
// 이 강조는 정상/사칭 판단이 아닌, 사용자가 선택할 시점에 대한 중립 안내다.
const confirmationRequest =
  /(?:본인|직접|고객님이).{0,26}(?:요청|진행|이용|결제).{0,18}(?:맞으|맞나|맞는지)|(?:본인|직접|거래|이용|내용).{0,34}(?:확인|조회).{0,24}(?:부탁드|부탁합|해\s*주세요|해\s*주시|바랍니다|가능할까요)|(?:확인|조회).{0,14}(?:부탁드|부탁합|해\s*주세요|해\s*주시|바랍니다)/;

export function shouldCuePhonePanel(userText: string, reply?: VisibleReply): boolean {
  // 구조화 행동은 사용자에게 보인 새 대사의 행동 제안이므로 가장 확실한 단서다.
  const hasAction = !!reply?.actions?.some(a =>
    ["transfer", "phone", "link", "provide_data", "app"].includes(a.kind));
  if (hasAction) return true;
  const userIntent = userThinkingOfTools.test(userText);
  const incomingRequest = !!reply?.text && (explicitRequest.test(reply.text) || confirmationRequest.test(reply.text));
  return userIntent || incomingRequest;
}
