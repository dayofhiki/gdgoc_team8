import type { TrainingTopicId } from "./trainingCatalog.ts";

type ChatLine = { actor: string; text: string; actions?: { kind: string; origin: string }[] };

// 예시는 훈련의 정답이 아니라, 직전 문자에 현실적으로 답할 수 있는 말이다.
// 출처와 진위는 알 수 없으므로 확인 완료·송금·동의처럼 행동을 가장하는 문구는 넣지 않는다.
const openingReplies: Record<TrainingTopicId, string[]> = {
  family: ["응, 무슨 일이야?", "지금 무슨 상황이야?", "괜찮아?"],
  delivery: ["어떤 택배인가요?", "배송에 무슨 문제가 있나요?", "어느 택배사인가요?"],
  bank: ["어떤 거래에 관한 안내인가요?", "언제 발생한 일인가요?", "무슨 문제가 생겼나요?"],
  invitation: ["누구 결혼식이에요?", "결혼식은 언제예요?", "식장은 어디인가요?"],
  obituary: ["누구의 부고인가요?", "빈소는 어디인가요?", "언제 돌아가셨나요?"],
  traffic: ["어떤 위반에 관한 안내인가요?", "언제 발생한 건인가요?", "무슨 고지인가요?"],
  loan: ["어떤 대출 상품인가요?", "금리와 조건이 어떻게 되나요?", "어떤 내용으로 연락하셨나요?"],
  job: ["어떤 일을 하는 건가요?", "근무 시간은 어떻게 되나요?", "급여 조건은 어떻게 되나요?"],
  health: ["어떤 검진에 관한 안내인가요?", "예약과 관련된 연락인가요?", "어느 기관에서 연락하셨나요?"],
  card: ["무슨 카드 배송인가요?", "어느 카드사에서 보냈나요?", "신청한 적이 없는데 무슨 일인가요?"],
  team_mission: ["어떤 일을 하는 건가요?", "급여는 어떻게 받나요?", "근무 조건은 어떻게 되나요?"],
};

const informalTopics = new Set<TrainingTopicId>(["family"]);
const topicClues: Record<TrainingTopicId, RegExp> = {
  family: /엄마|아빠|아들|딸|폰|휴대|액정|수리/,
  delivery: /택배|배송|운송장|반송/,
  bank: /결제|거래|승인|계좌|금융|은행/,
  invitation: /결혼|청첩장|예식|식장/,
  obituary: /부고|별세|빈소|돌아가셨|장례/,
  traffic: /교통|위반|과태료|범칙금/,
  loan: /대출|금리|한도/,
  job: /일자리|업무|근무|채용|급여/,
  health: /검진|예약|병원|건강/,
  card: /카드|배송|반송/,
  team_mission: /후기|부업|정산|쇼핑/,
};
const requestedMoney = /송금|이체|입금|선입금|보증금|수수료|계좌로|돈을?\s*보내|금액을?\s*보내|수리비/;
const deposit = /보증금|재료비/;
const depositExplanation = /돌려\s*드|반환|환불|돌려\s*받|안전장치/;
const requestedLink = /링크|URL|사이트|주소를?\s*(?:눌러|클릭|접속|열어)|청첩장\s*(?:확인|보기)|부고장\s*(?:확인|보기)/i;
const requestedData = /인증번호|비밀번호|주민등록|계좌번호|카드번호|개인정보|생년월일|잔액|신분증|보안카드/;
const requestedInstall = /원격\s*(?:제어|지원)|앱\s*(?:설치|깔)|프로그램\s*설치|설치해/;
const requestedPhone = /전화\s*(?:걸어|주세|주세요|해\s*주세요)|통화\s*(?:해|부탁)|연락\s*(?:주세|주세요)/;
const isRequest = /(?:해\s*주세요|해주세요|주십시오|보내\s*주세요|보내주세요|부탁|하셔야|필요|해야|가능|확인해|눌러|열어|접속|입력|입금|송금|이체|설치|수리비)/;
const normalized = (value: string) => value.replace(/[\s.,!?~…·"'“”‘’()]/g, "").toLowerCase();

const mentionsAmount = (line: string) => /\d[\d,.\s]*(?:만\s*원|원)/.test(line);

export function refreshTrainingReplies(messages: ChatLine[], generated: string[], fallback: string[], previous: string[]): string[] {
  const sent = new Set(messages.filter(message => message.actor === "me").map(message => normalized(message.text)));
  const prior = new Set(previous.map(normalized));
  const amountKnown = messages.some(message => message.actor === "them" && mentionsAmount(message.text));
  const candidates = [...generated, ...fallback];
  const next: string[] = [];
  for (const text of [...candidates.filter(text => !prior.has(normalized(text))), ...candidates]) {
    if (amountKnown && /얼마(?:\s*(?:인가|예요|에요|입니까|나왔|였|죠|되나요)|[?？])|(?:금액|결제액)\s*(?:을|이|은)?\s*알려/.test(text)) continue;
    const key = normalized(text);
    if (!key || sent.has(key)) continue;
    sent.add(key);
    next.push(text);
    if (next.length === 2) break;
  }
  return next;
}

export function trainingReplyExamples(topic: TrainingTopicId, messages: ChatLine[], limit = 2): string[] {
  const last = messages.at(-1);
  // 전화/앱 사용 직후에는 직전 발신자 문장을 다시 기준으로 예시를 추천하지 않는다.
  if (!last || last.actor !== "them" || !last.text.trim()) return [];
  const line = last.text;
  const senderText = messages.filter(message => message.actor === "them").map(message => message.text).join(" ");
  const informal = informalTopics.has(topic);
  const sent = new Set(messages.filter(m => m.actor === "me").map(m => normalized(m.text)));
  const opening = !messages.some(message => message.actor === "me");
  const latestRequest = messages.findLastIndex(message => message.actor === "them" &&
    message.actions?.some(action => action.origin === "sender"));
  const kinds = new Set((latestRequest >= 0 ? messages[latestRequest].actions ?? [] : [])
    .filter(action => action.origin === "sender").map(action => action.kind));
  const earlierDepositRequest = messages.slice(0, -1).some(message =>
    message.actor === "them" && deposit.test(message.text) && isRequest.test(message.text));
  // 보증금을 돌려준다는 설명은 새 송금 요청으로 표시되지 않아도 앞선 요구에 대한 답이다.
  const explainingDeposit = deposit.test(line) && depositExplanation.test(line) &&
    (earlierDepositRequest || kinds.has("transfer"));
  const afterRequest = latestRequest >= 0 && latestRequest < messages.length - 1;
  const requested = isRequest.test(line);
  const candidates: { text: string; weight: number }[] = [];
  const add = (weight: number, ...texts: string[]) => {
    texts.forEach((text, i) => candidates.push({ text, weight: weight - i }));
  };

  // 위험 요청이 있는 마지막 문자에는 그 요청 자체를 묻는 답장을 우선한다.
  // '보냈어요/확인했어요'처럼 훈련 앱에서 실행하지 않은 행동은 추천하지 않는다.
  if (kinds.has("transfer") || requested && requestedMoney.test(line)) {
    if (informal) add(110, "갑자기 돈이 왜 필요해?", "잠깐 생각해 볼게.", "얼마가 필요한데?");
    else add(110, "왜 돈을 보내야 하나요?", "잠깐 생각해 볼게요.", "어떤 비용인지 설명해 주세요.");
  }
  if (kinds.has("provide_data") || requested && requestedData.test(line)) {
    add(108, "그 정보가 왜 필요한가요?", "어디에 사용하는 정보인가요?");
  }
  if (kinds.has("link") || requested && requestedLink.test(line)) {
    if (informal) add(105, "그 링크는 뭐야?", "거기서 뭘 확인하라는 거야?");
    else add(105, "링크에서 무엇을 확인하나요?", "문자로 내용을 설명해 주실 수 있나요?");
  }
  if (requested && requestedInstall.test(line)) {
    add(107, "왜 앱을 설치해야 하나요?", "설치하지 않으면 어떻게 되나요?");
  }
  if (kinds.has("phone") || requestedPhone.test(line)) {
    if (informal) add(102, "왜 전화해야 하는데?", "여기서 설명해 줄 수 있어?");
    else add(102, "전화로 무엇을 확인하나요?", "여기서 설명해 주실 수 있나요?");
  }

  // 현재 문자가 구체적인 질문을 던졌다면, 주제별 첫인사 문구보다 질문에 대한 반응을 택한다.
  if (opening && /지금.{0,14}(?:연락|통화|시간|괜찮|가능)|(?:연락|통화).{0,12}(?:가능|되|할\s*수)/.test(line)) {
    add(90, informal ? "응, 무슨 일이야?" : "네, 어떤 용건인가요?",
      informal ? "지금 무슨 일인데?" : "어떤 내용으로 연락하셨나요?");
  }
  if (/신청하셨|신청한\s*적|주문하셨|예약하셨|본인이.{0,15}(?:맞|하신)|맞으신가요/.test(line)) {
    add(88, informal ? "무슨 얘기야?" : "어떤 건에 대한 말씀인가요?",
      informal ? "무슨 일인지 설명해 줘." : "구체적으로 설명해 주시겠어요?");
  }
  if (/언제|며칠|날짜|몇\s*시|시간/.test(line) && /\?|까요|세요|니\??$/.test(line)) {
    add(70, informal ? "무슨 일 때문인데?" : "무슨 일정에 관한 내용인가요?");
  }

  // 후속 발화에서 나온 사실에 반응한다. 연락 종류의 고정 질문을 매 턴 반복하지 않는다.
  if (topic === "obituary") {
    if (/돌아가셨|별세|장례|빈소|부고/.test(line) && !requestedLink.test(line)) {
      add(80, "삼가 고인의 명복을 빕니다.", "빈소는 어디인가요?");
    }
  } else if (topic === "invitation" && /결혼|예식|식장/.test(line)) {
    add(65, "결혼식은 언제예요?", "어디에서 하나요?");
  } else if (topic === "family") {
    if (/응급|병원|다쳤|입원|진료/.test(line)) {
      add(78, "괜찮아? 어떻게 된 거야?", "어느 병원에 있는데?");
    } else if (/여행|지갑|가방|귀국|차비|교통편/.test(line)) {
      add(78, "무슨 일이야, 괜찮아?", "지금 어디에 있는데?");
    } else if (/메신저|로그아웃|계정|인증|복구/.test(line)) {
      add(78, "무슨 계정이 잠겼다는 거야?", "지금 어떤 문제가 생겼어?");
    } else if (/폰|휴대전화|액정|수리|기기/.test(line)) {
      add(72, "많이 고장 났어?", "지금 어디서 연락하는 거야?");
    } else {
      add(60, "무슨 일인지 좀 더 말해줘.", "지금 상황이 어때?");
    }
  } else if (topic === "bank" && /결제|거래|승인|보안|기기/.test(line)) {
    if (/본인|직접|미승인|낯선 기기/.test(line)) {
      add(85, "제가 한 결제는 아닌 것 같아요.", "결제가 이미 승인된 건가요?");
    } else if (/기기|접속/.test(line)) {
      add(80, "제가 쓰던 기기와 어떻게 다른가요?", "등록이 이미 끝난 건가요?");
    }
    if (!/결제\s*시도|상품권|가맹점/.test(senderText)) add(65, "어떤 결제인가요?");
    if (!mentionsAmount(senderText)) add(64, "금액이 얼마인가요?");
  } else if (topic === "delivery" && /배송|주소|반송/.test(line)) {
    add(65, "어느 택배사인가요?", "어떤 물건인가요?");
  } else if (topic === "card" && /카드|배송|반송/.test(line)) {
    add(65, "어느 카드사인가요?", "신청한 적이 없는데 무슨 일인가요?");
  } else if (topic === "team_mission" && /후기|정산|업무|부업/.test(line)) {
    add(65, "어떤 일을 해야 하나요?", "돈은 어떻게 정산되나요?");
  }

  // 실제 발신자가 언급하기 전에는 훈련 주제(결혼, 부고, 금융 등)를 드러내지 않는다.
  // 주제명은 UI 분류일 뿐, 상대가 이미 말한 사실이라는 뜻이 아니다.
  const topicMentioned = messages.some(message =>
    message.actor === "them" && topicClues[topic].test(message.text));
  if (!opening) {
    add(25, informal ? "방금 말한 부분을 조금 더 설명해 줘." : "방금 말씀하신 부분을 조금 더 설명해 주세요.",
      informal ? "다른 방법은 없어?" : "다른 방법은 없나요?");
  } else if (topicMentioned) {
    openingReplies[topic].forEach((text, i) => add(30 - i, text));
  } else if (informal) {
    add(25, "무슨 일이야?", "어떻게 된 건지 말해 줘.", "지금 무슨 상황인데?");
  } else if (/소식/.test(line)) {
    add(25, "무슨 소식인가요?", "어떤 일인가요?", "좀 더 설명해 주시겠어요?");
  } else {
    add(25, "어떤 내용으로 연락하셨나요?", "조금 더 자세히 설명해 주세요.", "무슨 일인지 알려주시겠어요?");
  }
  if (explainingDeposit) {
    const replies = informal
      ? ["보증금 없이 진행할 수는 없어?", "보증금은 보내지 않을게.", "보증금을 돌려주는 조건을 문자로 알려 줘."]
      : ["보증금 없이 진행할 수 있나요?", "보증금은 보내지 않겠습니다.", "보증금을 돌려받는 조건을 문자로 알려 주세요."];
    return replies.filter(text => !sent.has(normalized(text))).slice(0, limit);
  }
  const hold = informal ? "잠깐 생각해 볼게." : "잠깐 생각해 볼게요.";
  const decline = kinds.has("transfer") ? (informal ? "돈은 안 보낼게." : "송금은 하지 않겠습니다.") :
    kinds.has("provide_data") ? (informal ? "개인정보는 보내지 않을게." : "개인정보는 보내지 않겠습니다.") :
    kinds.has("link") ? (informal ? "링크는 열지 않을게." : "링크는 열지 않겠습니다.") :
    kinds.has("phone") ? "이 번호로 전화하지 않겠습니다." : hold;
  const neutralReply = topic === "obituary" && /돌아가셨|별세/.test(line) ? "삼가 고인의 명복을 빕니다." :
    topic === "invitation" && /결혼/.test(line) ? "결혼 축하해요." :
    topic === "card" && /카드|배송/.test(line) ? "카드를 신청한 기억이 없어요." :
    opening && /가능|괜찮|시간/.test(line) ? (informal ? "응, 듣고 있어." : "네, 말씀해 주세요.") :
    informal ? "무슨 일인지 조금 더 말해 줘." : "말씀하신 내용을 조금 더 알려 주세요.";
  const contextualStatement = topic === "bank" && /본인|직접|미승인/.test(line) && /결제|거래|승인/.test(line)
    ? "제가 한 결제는 아닌 것 같아요."
    : neutralReply;
  const direct = afterRequest ? [decline, hold] : kinds.size ? [hold, decline] : [contextualStatement];
  const unique = new Set<string>();
  const available = candidates.sort((a, b) => b.weight - a.weight)
    .map(candidate => candidate.text)
    .filter(text => {
      const key = normalized(text);
      if (sent.has(key) || unique.has(key)) return false;
      unique.add(key);
      return true;
    });
  const statement = direct.find(text => !sent.has(normalized(text)));
  const question = available.find(text => /[?？]$/.test(text));
  if (afterRequest && statement) return [statement, ...direct.filter(text =>
    text !== statement && !sent.has(normalized(text))), question, ...available.filter(text => text !== question)]
    .filter((text): text is string => Boolean(text)).slice(0, limit);
  return [question, statement, ...available.filter(text => text !== question && text !== statement)]
    .filter((text): text is string => Boolean(text)).slice(0, limit);
}
