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
  /(?:송금|이체|입금|결제|돈 ?보내|수리비).{0,25}(?:해|해줘|주세요|주실|부탁|가능|필요)|(?:링크|주소|사이트).{0,24}(?:눌러|열어|접속|입력|확인해|변경해)|(?:성함|이름|비밀번호|인증번호|개인정보|주소).{0,24}(?:보내|알려|입력|전송)|(?:전화|통화|연락).{0,15}(?:해줘|주세요|걸어|하실|부탁)/;

export function shouldCuePhonePanel(userText: string, reply?: VisibleReply): boolean {
  // 구조화 행동은 사용자에게 보인 새 대사의 행동 제안이므로 가장 확실한 단서다.
  const hasAction = !!reply?.actions?.some(a =>
    ["transfer", "phone", "link", "provide_data", "app"].includes(a.kind));
  if (hasAction) return true;
  const userIntent = userThinkingOfTools.test(userText);
  const incomingRequest = !!reply?.text && explicitRequest.test(reply.text);
  return userIntent || incomingRequest;
}
