// 종료 판단·리포트 근거·기본 피드백. 외부 호출 없는 순수 함수만 둔다 (Deno·Node·브라우저 공용).
// 원칙: AI의 intent는 추정이고, 실제 행동은 화면에서 기록된 ActionEvent만 인정한다.
import type {
  ActionEvent, EndedBy, EndReason, Feedback, HistoryItem, Intent, ScammerAction, Stage,
} from "./types.ts";

export const INTENTS: Intent[] = [
  "refuse", "verify_independent", "verified_in_chat", "comply", "claimed_action", "suspect", "continue", "stop", "unclear",
];
export const END_REASONS: EndReason[] = [
  "refused", "verify_intent", "verified_claimed", "complied", "claimed_action", "mock_action", "scammer_left", "user_stopped", "inconclusive",
];
export const SCAMMER_ACTIONS: ScammerAction[] = ["continue", "recheck", "leave"];

// 같은 답이 이 횟수만큼 이미 나왔으면(= 세 번째) 상대가 물러나며 종료
export const REPEAT_LIMIT = 2;

// 연습 자체를 그만두겠다는 명시적 표현. AI를 기다리지 않고 즉시 종료한다.
// "그만 연락해"처럼 상대에게 하는 말은 거절로 보고 여기서 잡지 않는다.
const STOP_RE = /(그만\s*(할래|할게|하자|둘래|둘게|하고\s*싶)|연습\s*(그만|중단|끝)|중단\s*(할래|할게|해\s*줘))/;
export const isExplicitStop = (text: string) => STOP_RE.test(text);

const norm = (s: string) => s.replace(/[\s.,!?~…·'"“”‘’()]/g, "").toLowerCase();

/** 이번 답과 같거나 거의 같은 이전 학습자 답의 수 */
export function repeatCount(history: HistoryItem[], text: string): number {
  const t = norm(text);
  if (!t) return 0;
  return history.filter((m) => {
    if (m.role !== "senior") return false;
    const p = norm(m.text);
    return p === t || (Math.min(p.length, t.length) >= 4 && (p.includes(t) || t.includes(p)));
  }).length;
}

const countIntent = (history: HistoryItem[], ...intents: Intent[]) =>
  history.filter((m) => m.role === "senior" && m.intent && intents.includes(m.intent)).length;

/** AI 호출 전에 계산하는 맥락: 프롬프트에 알려주고, 호출 결과 검증에도 쓴다 */
export function turnContext(history: HistoryItem[], text: string) {
  const repeats = repeatCount(history, text);
  return {
    repeats,
    forceLeave: repeats >= REPEAT_LIMIT,
    priorFlags: countIntent(history, "claimed_action", "suspect"),
    priorClaims: countIntent(history, "claimed_action"),
  };
}
export type TurnContext = ReturnType<typeof turnContext>;

export type Decision = { ended: boolean; end_reason?: EndReason; ended_by?: EndedBy; scammer_action: ScammerAction };

/**
 * AI가 제안한 intent·scammer_action을 앱 규칙으로 검증해 종료 여부를 정한다.
 * - uncertain이면 종료시키지 않는다 (중단은 예외).
 * - 행동했다는 말(claimed_action)은 처음엔 상대가 재확인, 반복되면 종료.
 * - 상대의 물러남(leave)은 명시적 의심이 있거나, 의심·행동 주장이 이미 있었거나, 같은 답이 반복될 때만 인정.
 */
export function decideTurn(p: {
  intent: Intent;
  uncertain: boolean;
  stage: Stage;
  linkOffered: boolean;
  ctx: TurnContext;
  scammerAction: ScammerAction;
}): Decision {
  const end = (end_reason: EndReason, ended_by: EndedBy): Decision => ({ ended: true, end_reason, ended_by, scammer_action: "leave" });
  if (p.intent === "stop") return end("user_stopped", "learner");

  if (!p.uncertain) {
    switch (p.intent) {
      case "refuse": return end("refused", "learner");
      case "verify_independent": return end("verify_intent", "learner");
      case "verified_in_chat": return end("verified_claimed", "learner");
      case "comply":
        if (p.stage === "demand" || p.linkOffered) return end("complied", "learner");
        break;
      case "claimed_action":
        if (p.ctx.priorClaims >= 1) return end("claimed_action", "learner");
        break;
      case "suspect":
        if (p.scammerAction === "leave") return end("scammer_left", "scammer");
        break;
    }
  }
  if (p.ctx.forceLeave) return end("scammer_left", "scammer");
  if (p.scammerAction === "leave" && p.ctx.priorFlags >= 1) return end("scammer_left", "scammer");

  const firstClaim = p.intent === "claimed_action" && !p.uncertain;
  const action: ScammerAction = p.scammerAction === "leave" || firstClaim ? "recheck" : p.scammerAction;
  return { ended: false, scammer_action: action };
}

// ───────────── 리포트 근거 ─────────────

const q = (s: string) => `“${s.length > 60 ? `${s.slice(0, 60)}…` : s}”`;

/** 기록된 사실만으로 만든 근거 문장. 발화(말)와 이벤트(실제 행동)를 구분해서 쓴다. */
export function observations(p: { history: HistoryItem[]; events: ActionEvent[]; endReason: EndReason; linkOffered: boolean }): string[] {
  const clicked = p.events.some((e) => e.type === "link_clicked");
  const sent = p.events.some((e) => e.type === "transfer_sent");
  const out: string[] = [];
  for (const m of p.history) {
    if (m.role !== "senior" || !m.intent) continue;
    const s = q(m.text);
    switch (m.intent) {
      case "refuse": out.push(`${s} — 요청을 거절했어요.`); break;
      case "verify_independent": out.push(`${s} — 평소 연락처로 직접 확인하겠다고 말했어요. 실제 확인 여부는 기록되지 않아요.`); break;
      case "verified_in_chat": out.push(`${s} — 가족에게 직접 확인했다고 말했어요.`); break;
      case "comply": out.push(`${s} — 요청에 응하겠다고 말했어요.${clicked || sent ? "" : " 실제 송금이나 링크 클릭은 기록되지 않았어요."}`); break;
      case "claimed_action":
        out.push(clicked || sent
          ? `${s} — 행동했다고 말했어요.`
          : `${s} — 행동했다고 말했지만, 훈련 화면에서 모의 링크 클릭이나 송금은 기록되지 않았어요.${p.linkOffered ? "" : " 이때까지 모의 링크는 표시되지 않았어요."}`);
        break;
      case "suspect": out.push(`${s} — 상대를 의심하는 말을 했어요.`); break;
      case "stop": out.push(`${s} — 연습을 그만하겠다고 말했어요.`); break;
    }
  }
  if (clicked) out.push("훈련 화면에서 모의 링크를 열었어요.");
  if (sent) out.push("훈련 화면에서 모의 송금이 기록됐어요.");
  if (p.endReason === "scammer_left") out.push("상대가 대화를 정리하고 물러났어요. 상대의 반응일 뿐, 평가 근거는 위의 대화예요.");
  if (p.endReason === "inconclusive") out.push("대화가 최대 횟수에 도달해 판단을 보류했어요.");
  if (p.endReason === "user_stopped" && !p.history.some((m) => m.intent === "stop")) out.push("연습을 중간에 그만뒀어요.");
  return [...new Set(out)];
}

const firstQuote = (history: HistoryItem[], ...intents: Intent[]) => {
  const m = [...history].reverse().find((h) => h.role === "senior" && h.intent && intents.includes(h.intent));
  return m ? q(m.text) : "";
};

/** AI 피드백이 실패하거나 검증을 통과하지 못했을 때 쓰는 기본 피드백 */
export function fallbackFeedback(p: { history: HistoryItem[]; events: ActionEvent[]; endReason: EndReason; linkOffered: boolean }): Feedback {
  const clicked = p.events.some((e) => e.type === "link_clicked");
  const sent = p.events.some((e) => e.type === "transfer_sent");
  const call = "평소 알고 있던 연락처로 가족에게 직접 확인해 보세요.";
  if (clicked) return { summary: "이번 훈련에서는 상대가 보낸 모의 링크를 열었어요.", points: [], next_step: `실제 상황에서는 링크를 열기 전 ${call}` };
  if (sent) return { summary: "이번 훈련에서는 모의 송금이 기록됐어요.", points: [], next_step: `돈을 보내기 전 ${call}` };
  switch (p.endReason) {
    case "verify_intent": {
      const s = firstQuote(p.history, "verify_independent");
      return { summary: `${s ? `${s}라고 말씀하셨어요. ` : ""}상대가 보내 준 정보와 별도로 평소 알고 있던 연락처로 확인하려는 대응이 좋았어요.`, points: [], next_step: "실제로도 상대가 알려 준 번호가 아닌, 원래 알던 번호로 전화해 확인하세요." };
    }
    case "verified_claimed":
      return { summary: "대화 중에 가족에게 직접 확인했다고 말씀하셨어요. 가족에게 바로 확인하는 것이 가장 확실한 방법이에요.", points: [], next_step: "실제 상황에서도 요구에 응하기 전에 가족과 직접 통화해 확인하세요." };
    case "refused":
      return { summary: "상대의 요청을 분명하게 거절하셨어요.", points: [], next_step: `거절한 뒤에도 걱정되면 ${call}` };
    case "complied":
      return { summary: "대화에서 상대의 요청에 응하겠다고 말씀하셨어요. 훈련 화면에서 실제 송금이나 링크 클릭은 기록되지 않았어요.", points: [], next_step: `급한 요청을 받으면 응하기 전에 잠시 멈추고 ${call}` };
    case "claimed_action":
      return { summary: "대화에서는 행동했다고 말씀하셨지만, 훈련 화면에서 모의 링크 클릭이나 송금은 기록되지 않았어요.", points: [], next_step: `의심스러운 링크나 송금 요청은 응하기 전 ${call}` };
    case "scammer_left":
      return { summary: "상대가 대화를 정리하고 물러났어요. 이 반응만으로 사기를 알아챘는지는 판단하지 않아요.", points: [], next_step: `의심될 때는 대화를 멈추고 ${call}` };
    case "user_stopped":
      return { summary: "연습을 중간에 그만두셨어요. 중단은 성공이나 실패로 판단하지 않아요.", points: [], next_step: "편할 때 다시 연습해 보세요. 의심되는 연락은 원래 알던 번호로 확인하는 것이 좋아요." };
    default:
      return { summary: "이번 대화만으로는 어떤 방법으로 확인하실지 판단하기 어려웠어요.", points: [], next_step: `급한 요청을 받으면 잠시 멈추고, ${call}` };
  }
}

// 이벤트 없이 "링크를 여셨어요/송금하셨어요"처럼 행동을 사실로 단정하는 문장을 거른다 ("~라고 말씀"은 허용)
const CLICK_FACT = /링크를?\s*(여셨|열었|열어\s*보셨|누르셨|눌렀|클릭하셨|클릭했)/;
const SEND_FACT = /(송금하셨|송금했|돈을\s*보내셨|돈을\s*보냈|이체하셨|이체했)/;
const MAX_LEN = 200;

/** AI 피드백 형식·근거 검증. 통과하지 못하면 null → fallbackFeedback 사용 */
export function checkFeedback(fb: unknown, events: ActionEvent[]): Feedback | null {
  if (!fb || typeof fb !== "object") return null;
  const f = fb as Record<string, unknown>;
  const str = (v: unknown) => typeof v === "string" && v.trim().length > 0 && v.length <= MAX_LEN;
  if (!str(f.summary) || !str(f.next_step) || !Array.isArray(f.points) || f.points.length > 3 || !f.points.every(str)) return null;
  const out: Feedback = { summary: (f.summary as string).trim(), points: (f.points as string[]).map((s) => s.trim()), next_step: (f.next_step as string).trim() };
  const clicked = events.some((e) => e.type === "link_clicked");
  const sent = events.some((e) => e.type === "transfer_sent");
  for (const s of [out.summary, out.next_step, ...out.points]) {
    if (/https?:\/\/|www\.|\d[\d-]{8,}\d/.test(s)) return null;
    for (const sentence of s.split(/(?<=[.!?요])\s+/)) {
      if (sentence.includes("말")) continue;
      if (!clicked && CLICK_FACT.test(sentence)) return null;
      if (!sent && SEND_FACT.test(sentence)) return null;
    }
  }
  return out;
}
