"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertIcon, CheckIcon, ChevronRight, PersonIcon, ShieldIcon } from "@/components/Icons";
import { BottomCTA, BottomSheet, Header, Screen } from "@/components/ui";
import { actionChoice, type Action } from "@/lib/trainingActions";
import { useAppState } from "@/components/AppState";
import { copyText } from "@/lib/share";
import { familyShareUrl } from "@/lib/invite";
import { saveRecord } from "@/lib/records";
import type { BehaviorFeedback } from "@/lib/trainingFeedback";
import type { PhoneMethod } from "@/lib/realTraining";
import { topicDescriptor, type TrainingTopicId } from "@/lib/trainingCatalog";
import { shouldCuePhonePanel } from "@/lib/trainingPhoneCue";
import TrainingPhonePanel, { TrainingPhoneIcon, type PhoneTransferRequest } from "@/components/TrainingPhonePanel";

type OfferKind = "transfer" | "share" | "link" | "call" | "official_app" | "official_call";
type LinkPreview = { url: string; domain: string; title: string; description: string };
type Message = { actor: "them" | "me" | "system"; text: string; actions?: Action[] };
type Choice = "verify" | "family_contact" | "verify_sender" | "verify_chat" | "comply" | "share" | "stop" | "open_link";
type Phase = "chat" | "result";
type Ending = { choice: "verify" | "family_contact" | "stop" | "comply" | "share"; stage: "receipt" | "review" };
type Session = {
  token: string;
  topic?: TrainingTopicId;
  title?: string;
  messages: Message[];
  turns: number;
  maxTurns: number;
  verified: boolean;
  closed: boolean;
  endReason?: "natural" | "turn_limit" | "action" | "resolved" | null;
};
type Result = {
  identity: "legitimate" | "fraud";
  coverage?: "early" | "conversation_only" | "request_reached";
  behavior: BehaviorFeedback;
  truthLabel: string;
  purpose: string;
  checked: boolean;
  safety: string;
  judgment: string;
  dangerousAction: boolean;
  linkOpened: boolean;
  followedSenderNumber: boolean;
  verificationEvidence: string;
  feedback: string[];
  nextStep: string;
  note: string;
  highlights: {
    status: string;
    actionTitle: string;
    judgment: string;
    good: { keyword: string; text: string }[];
    improve: { keyword: string; text: string }[];
    tip: string;
  };
};
type Reply = Session & { result?: Result };

async function request(payload: object): Promise<Reply> {
  const response = await fetch("/api/real-training", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "연결에 실패했습니다. 다시 시도해 주세요.");
  return data as Reply;
}

function contactTitle(topic?: TrainingTopicId): string {
  return topic ? topicDescriptor(topic).contactLabel : "새 메시지";
}

// 결과 화면에서 가족 질문 화면으로 나갔다 돌아올 때 결과를 복원한다.
// 복원 표시(?review=1)는 그 방문 기록 항목에만 남으므로, 새 훈련에는 옛 결과가 뜨지 않는다.
const REVIEW_KEY = "mikki:training-review";
const INTRO_HIDE_KEY = "mikki:training-phone-intro-hidden-v1";

function saveReview(result: Result) {
  try {
    sessionStorage.setItem(REVIEW_KEY, JSON.stringify(result));
    window.history.replaceState(window.history.state, "", "/roleplay/chat?review=1");
  } catch { /* 저장소를 못 쓰면 복원 없이 진행 */ }
}

function takeSavedReview(): Result | null {
  try {
    const saved = sessionStorage.getItem(REVIEW_KEY);
    if (new URLSearchParams(location.search).get("review") !== "1") {
      sessionStorage.removeItem(REVIEW_KEY);
      return null;
    }
    const parsed = saved ? JSON.parse(saved) as Result : null;
    return parsed?.behavior ? parsed : null;
  } catch {
    return null;
  }
}

export default function RealTraining() {
  const router = useRouter();
  const { ready: familyReady, familyQuestion } = useAppState();
  const started = useRef(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("chat");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [input, setInput] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [phoneHint, setPhoneHint] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [skipIntroNextTime, setSkipIntroNextTime] = useState(false);
  const phoneHintShown = useRef(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewActionId, setPreviewActionId] = useState<string | null>(null);
  const [openedLinks, setOpenedLinks] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [reviewPage, setReviewPage] = useState<"feedback" | "truth">("feedback");
  const [shareNotice, setShareNotice] = useState("");
  // 결과가 나오면 미리 만들어 둠 (공유 시트는 클릭 직후 바로 열려야 해서). 준비 전이면 안내 화면 링크
  const [shareUrl, setShareUrl] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [typingVisible, setTypingVisible] = useState(false);
  const [ending, setEnding] = useState<Ending | null>(null);

  async function start() {
    setPhase("chat");
    setError("");
    setInput("");
    setSession(null);
    setResult(null);
    setReviewPage("feedback");
    setShareNotice("");
    setPendingMessage(null);
    setTypingVisible(false);
    setEnding(null);
    setOpenedLinks([]);
    setPreviewIndex(null);
    setPreviewActionId(null);
    setActionsOpen(false);
    setPhoneHint(false);
    setIntroOpen(false);
    setSkipIntroNextTime(false);
    phoneHintShown.current = false;
    setBusy(true);
    try {
      const topic = new URLSearchParams(window.location.search).get("topic");
      // 서버가 주제 허용 목록을 검사하며 정상/사칭 배역은 매번 내부에서 결정한다.
      const initial = await request({ action: "start", ...(topic ? { topic } : {}) });
      setSession(initial);
      // 새로운 훈련 시작 시에만 확인한다. 결과 화면으로 돌아올 때는 띄우지 않는다.
      try {
        setIntroOpen(localStorage.getItem(INTRO_HIDE_KEY) !== "1");
      } catch {
        setIntroOpen(true);
      }
      setPhase("chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "훈련을 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 결과의 다음 페이지는 항상 맨 위부터 읽도록 한다.
  useEffect(() => {
    if (phase === "result") window.scrollTo(0, 0);
  }, [phase, reviewPage]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const saved = takeSavedReview();
    if (saved) {
      setResult(saved);
      setReviewPage("truth");
      setPhase("result");
      return;
    }
    void start();
  }, []);

  useEffect(() => {
    if (phase === "chat" && historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [phase, session?.messages.length, pendingMessage, typingVisible, busy]);

  useEffect(() => {
    if (pendingMessage === null) {
      setTypingVisible(false);
      return;
    }
    const timeout = window.setTimeout(() => setTypingVisible(true), 320);
    return () => window.clearTimeout(timeout);
  }, [pendingMessage]);

  useEffect(() => {
    if (!ending) return;
    if (ending.stage === "receipt") {
      const timeout = window.setTimeout(() => setEnding({ choice: ending.choice, stage: "review" }), 500);
      return () => window.clearTimeout(timeout);
    }
    const timeout = window.setTimeout(() => {
      setEnding(null);
    }, 1250);
    return () => window.clearTimeout(timeout);
  }, [ending]);

  useEffect(() => {
    if (!phoneHint) return;
    const timeout = window.setTimeout(() => setPhoneHint(false), 1900);
    return () => window.clearTimeout(timeout);
  }, [phoneHint]);

  function closeIntro() {
    if (skipIntroNextTime) {
      try { localStorage.setItem(INTRO_HIDE_KEY, "1"); } catch { /* 현재 훈련에서만 적용 */ }
    }
    setIntroOpen(false);
    // 첫 안내 직후 불필요한 두 번째 안내를 띄우지 않는다.
    // 필요해지는 순간(행동 요청 등장 또는 사용자의 확인 의사)에만 기존 단발성 강조가 나온다.
  }

  function openActions() {
    if (introOpen) return;
    setPhoneHint(false);
    phoneHintShown.current = true;
    setActionsOpen(true);
  }

  async function send() {
    const text = input.trim();
    if (!session || !text || busy || session.closed || ending || session.turns >= session.maxTurns) return;
    // 사용자 말풍선은 서버가 답하기 전에 즉시 표시한다.
    setPendingMessage(text);
    setInput("");
    setBusy(true);
    setError("");
    const sentAt = Date.now();
    try {
      const replyPromise = request({ action: "message", token: session.token, text });
      const next = await replyPromise;
      // 빠른 응답도 잠깐 입력 중을 보여 준다. 지연된 답은 추가로 늦추지 않는다.
      const remaining = Math.max(0, 840 - (Date.now() - sentAt));
      if (remaining) await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
      setSession({ ...next, title: session.title, topic: session.topic });
      setPendingMessage(null);
      // 정체/위험도를 추측하지 않고, 방금 등장한 구체적 행동 요청이나 사용자의
      // 외부 확인 의사만 참고한다. 단순히 두 턴 지났다는 이유로 정답 힌트를 주지 않는다.
      const latestActorReply = [...next.messages].reverse().find(m => m.actor === "them");
      if (!phoneHintShown.current && !next.closed && !introOpen && !actionsOpen &&
          shouldCuePhonePanel(text, latestActorReply)) {
        phoneHintShown.current = true;
        setPhoneHint(true);
      }
      // 종료된 대화는 채팅을 읽고 바로 행동 피드백으로 이동한다. 신원 맞히기 단계는 두지 않는다.
    } catch (err) {
      // 네트워크 실패 시 보낸 것처럼 남겨 두지 않고 입력창에 복구한다.
      setPendingMessage(null);
      setInput(text);
      setError(err instanceof Error ? err.message : "대화에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function perform(choice: Choice, sourceIndex?: number, actionId?: string, method?: PhoneMethod, fromPhonePanel = false): Promise<string | undefined> {
    if (!session || busy || ending) return;
    setBusy(true);
    setError("");
    try {
      const next = await request({
        action: "choice", token: session.token, choice,
        ...(sourceIndex !== undefined ? { sourceIndex } : {}),
        ...(actionId ? { actionId } : {}),
        ...(method ? { method } : {}),
      });
      setSession({ ...next, title: session.title, topic: session.topic });
      if (!method && !fromPhonePanel || next.closed) setActionsOpen(false);
      if (choice === "open_link" && sourceIndex !== undefined && actionId) {
        setOpenedLinks((prev) => prev.includes(actionId) ? prev : [...prev, actionId]);
        setPreviewIndex(sourceIndex);
        setPreviewActionId(actionId);
      } else {
        setPreviewIndex(null);
        setPreviewActionId(null);
        if (next.closed && next.endReason === "resolved") {
          // 확인 결과를 문자에서 읽고 사용자가 직접 피드백으로 이동하도록 둔다.
        } else if (next.closed && (choice === "verify" || choice === "family_contact" || choice === "stop" || choice === "comply" || choice === "share")) {
          setEnding({ choice, stage: "receipt" });
        } // 종료된 경우 행동을 읽은 뒤 아래 피드백 버튼으로 이동한다.
      }
      if (method || fromPhonePanel) {
        return [...next.messages].reverse().find(m => m.actor === "system")?.text ??
          "선택한 행동이 기록되었습니다.";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "행동을 기록하지 못했습니다.");
      if (method || fromPhonePanel) throw err;
    } finally {
      setBusy(false);
    }
  }

  function activateAction(action: Action, index: number) {
    if (busy) return;
    if (action.kind === "link" && openedLinks.includes(action.id)) {
      setPreviewIndex(index);
      setPreviewActionId(action.id);
      return;
    }
    void perform(actionChoice(action), index, action.id);
  }

  async function finish() {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      // 구형 API는 guess 필드를 요구하지만, UI에서는 신원 맞히기를 평가 단계로 강요하지 않는다.
      const answer = await request({ action: "finish", token: session.token, guess: "uncertain" });
      if (!answer.result) throw new Error("훈련 결과를 불러오지 못했습니다.");
      setResult(answer.result);
      setReviewPage("feedback");
      setPhase("result");
      const r = answer.result;
      void saveRecord({
        kind: "training",
        title: (session.title ?? "").slice(0, 60),
        safe: !r.dangerousAction,
        detail: { identity: r.identity, guess: "uncertain", checked: r.checked, linkOpened: r.linkOpened, followedSenderNumber: r.followedSenderNumber, coverage: r.coverage },
      });
      void familyShareUrl(location.origin).then(setShareUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "결과를 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function shareFamilyPromises() {
    if (!result) return;
    const lines = result.behavior.promises.map((p, i) => (i + 1) + ". " + p.title);
    // 가족 확인 질문 자체도 상대가 악용할 수 있으므로 외부 공유 내용에서는 제외한다.
    const message = "우리 가족 안전 약속\n" + lines.join("\n") +
      "\n\n가족 확인 질문과 답은 공개하지 않고 직접 통화하거나 만나서 정해요." +
      "\n\n미끼주의보에서 함께 연습해요.";
    const url = shareUrl || location.origin + "/family-code/guide";
    setShareNotice("");
    if (navigator.share) {
      try {
        await navigator.share({ title: "우리 가족의 안전 약속", text: message, url });
        setShareNotice("공유할 내용을 준비했어요.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    const copied = await copyText(message + "\n" + url);
    setShareNotice(copied ? "우리 가족 안전 약속을 복사했어요." : "공유하지 못했어요. 다시 시도해 주세요.");
  }

  if (phase === "result" && result && reviewPage === "truth") {
    const feedback = result.behavior;
    const hasFamilyQuestion = familyReady && familyQuestion.trim();
    const nextPromise = feedback.promises.find(p => !p.practiced) ?? feedback.promises[0];
    return (
      <Screen>
        <Header title="안전 약속" back={() => setReviewPage("feedback")} />
        <section className="screen__body">
          <div className="fb-summary-flow">
            <section className="fb-priority" aria-labelledby="fb-next-goal">
              <span className="fb-eyebrow">다음 연락에서도 기억할 행동</span>
              <h2 id="fb-next-goal">{nextPromise?.title ?? "필요한 정보를 직접 확인하기"}</h2>
              <p>누구에게서 연락이 오더라도, 행동하기 전에 스스로 확인하는 습관을 연습해요.</p>
            </section>

            <section className="fb-compact-section" aria-labelledby="fb-promise">
              <h3 id="fb-promise" className="fb-compact-heading"><ShieldIcon /> 기억할 안전 행동 세 가지</h3>
              <div className="fb-promise-grid">
                {feedback.promises.map((promise, index) => (
                  <div className="fb-promise-tile" key={promise.id}>
                    <span className="fb-promise-number">0{index + 1}</span>
                    <strong>{promise.title}</strong>
                    <span className={promise.practiced ? "fb-promise-status fb-promise-status--done" : "fb-promise-status"}>
                      {promise.practiced ? "✓ 이번에 실천" : "다음에 기억"}
                    </span>
                  </div>
                ))}
              </div>
              <details className="fb-inline-disclosure">
                <summary>이 행동이 중요한 이유</summary>
                <ol className="fb-list">
                  {feedback.promises.map(promise => (
                    <li className="fb-item" key={promise.id}>
                      <div><strong className="fb-item__title">{promise.title}</strong><p className="fb-item__text">{promise.detail}</p></div>
                    </li>
                  ))}
                </ol>
              </details>
              <details className="fb-inline-disclosure">
                <summary>가족 확인 질문 {hasFamilyQuestion ? "보기" : "정하기"}</summary>
                <div className="fb-subcard">
                  {hasFamilyQuestion
                    ? <p className="fb-item__text">{familyQuestion}</p>
                    : <p className="fb-item__text">아직 정한 질문이 없어요. 가족과 직접 정해 보세요.</p>}
                  <p className="fb-note">질문의 답은 문자로 보내지 않아요.</p>
                  <Link className="fb-link" href={hasFamilyQuestion ? "/family-code/question" : "/family-code/guide"}
                    onClick={() => saveReview(result)}>
                    {hasFamilyQuestion ? "질문 변경하기" : "질문 만들기"} <ChevronRight size={18} />
                  </Link>
                </div>
              </details>
              <button type="button" className="btn btn--secondary" onClick={() => void shareFamilyPromises()}>
                가족에게 안전 약속 공유하기
              </button>
              <p className="fb-note">안전 약속만 공유돼요. 가족 확인 질문과 답은 제외됩니다.</p>
            </section>

            <section className="fb-compact-section" aria-label="가상 연락의 설정">
              <details className="fb-inline-disclosure">
                <summary>이번 가상 연락의 설정 살펴보기</summary>
                <div className="fb-scenario-detail">
                  <strong>{result.identity === "fraud" ? "사칭 연락" : "실제 연락"}</strong>
                  <p>{result.purpose}</p>
                  <p>{result.verificationEvidence}</p>
                  <p className="fb-note">이는 가상 시나리오의 설정이에요. 이번 훈련에서 실제로 선택한 행동은 앞쪽 피드백에서 확인할 수 있어요.</p>
                </div>
              </details>
            </section>
          </div>
        </section>
        {shareNotice && <div className="toast" role="status">{shareNotice}</div>}
        <BottomCTA row>
          <button className="btn btn--gray" onClick={() => router.replace("/home")}>홈으로</button>
          <button className="btn btn--primary" onClick={() => router.replace("/roleplay/mode")}>다른 훈련하기</button>
        </BottomCTA>
      </Screen>
    );
  }

  if (phase === "result" && result) {
    const feedback = result.behavior;
    return (
      <Screen>
        <Header title="내 대응 돌아보기" back={() => router.replace("/home")} />
        <section className="screen__body">
          <div className="fb-summary-flow">
            <section className={"fb-impact-hero fb-impact-hero--" + feedback.tone} aria-labelledby="fb-headline">
              <span className="fb-eyebrow">이번 훈련 · 행동 피드백</span>
              <h2 id="fb-headline">{feedback.headline}</h2>
              {result.coverage === "early"
                ? <p className="fb-coverage-note">초반 종료 · 이후 요청 대응은 아직 평가하지 않았어요.</p>
                : result.coverage === "conversation_only"
                  ? <p className="fb-coverage-note">요청 전 대화 종료 · 위험 요청 대응은 아직 평가하지 않았어요.</p>
                  : <p className="fb-coverage-note">대화에서 실제로 선택한 행동을 기준으로 살펴봤어요.</p>}
            </section>

            <section className="fb-compact-section" aria-labelledby="fb-good">
              <h3 id="fb-good" className="fb-compact-heading"><CheckIcon /> 잘한 행동</h3>
              <div className="fb-keyword-grid">
                {feedback.good.length ? feedback.good.map(point => (
                  <div key={point.keyword} className="fb-keyword fb-keyword--good">
                    <strong>{point.keyword}</strong>
                  </div>
                )) : <p className="fb-keyword-empty">아직 확인된 안전 행동이 없어요.</p>}
              </div>
            </section>

            <section className="fb-compact-section" aria-labelledby="fb-improve">
              <h3 id="fb-improve" className="fb-compact-heading fb-compact-heading--amber"><AlertIcon /> 다음에 기억할 행동</h3>
              <div className="fb-keyword-grid">
                {feedback.improve.length ? feedback.improve.map(point => (
                  <div key={point.keyword} className="fb-keyword fb-keyword--improve">
                    <strong>{point.keyword}</strong>
                  </div>
                )) : <p className="fb-keyword-empty">잘한 행동을 계속 이어가세요.</p>}
              </div>
            </section>

            <details className="fb-detail-panel">
              <summary>내가 한 행동과 이유 자세히 보기</summary>
              <div className="fb-detail-content">
                <p className="fb-item__text">{feedback.explanation}</p>
                <h4>실제 선택 기록</h4>
                <ol className="fb-list">
                  {feedback.receipts.map((receipt, i) => (
                    <li key={i} className="fb-item">
                      <span className={receipt.tone === "good" ? "fb-mark" : "fb-mark fb-mark--" + receipt.tone}>{i + 1}</span>
                      <div><strong className="fb-item__title">{receipt.label}</strong><p className="fb-item__text">{receipt.detail}</p></div>
                    </li>
                  ))}
                </ol>
                {feedback.good.length > 0 && <h4>잘한 점의 근거</h4>}
                {feedback.good.map(point => <p className="fb-item__text" key={point.keyword}><strong>{point.keyword}</strong> · {point.text}</p>)}
                {feedback.improve.length > 0 && <h4>개선할 행동의 이유</h4>}
                {feedback.improve.map(point => <p className="fb-item__text" key={point.keyword}><strong>{point.keyword}</strong> · {point.text}</p>)}
              </div>
            </details>
          </div>
        </section>
        <BottomCTA>
          <button className="btn btn--primary" onClick={() => setReviewPage("truth")}>안전 약속 확인하기</button>
        </BottomCTA>
      </Screen>
    );
  }

  const contact = contactTitle(session?.topic);
  const phoneTopic: TrainingTopicId = session?.topic ?? "family";
  // 메시지의 서버 봉인 actionId를 그대로 사용한다. 패널에서 임의의 송금/번호를 만들지 않는다.
  const panelActions = (session?.messages ?? []).flatMap((message, sourceIndex) =>
    message.actor === "them"
      ? (message.actions ?? []).map(action => ({ sourceIndex, action }))
      : [],
  );
  const transferRequests: PhoneTransferRequest[] = panelActions.filter(({ action }) => action.kind === "transfer");
  const senderPhoneRequests: PhoneTransferRequest[] = panelActions.filter(({ action }) =>
    action.kind === "phone" && action.origin === "sender");
  const activeLink = previewIndex !== null ? session?.messages[previewIndex]?.actions?.find(a => a.id === previewActionId)?.linkPreview : undefined;

  return (
    <main className="screen rt-screen">
      <header className="rt-header">
        <button type="button" className="rt-nav-back" onClick={() => router.replace("/roleplay/select")} aria-label="뒤로 가기">
          <span aria-hidden="true">‹</span>
        </button>
        <div className="rt-avatar" aria-hidden="true"><PersonIcon /></div>
        <div className="rt-contact">
          <strong>{contact}</strong>
          <span>문자 메시지</span>
        </div>
        <button type="button"
          className={phoneHint ? "rt-header-more rt-header-more--hint" : "rt-header-more"}
          onClick={openActions}
          disabled={!session || session.closed || busy}
          aria-label="내 휴대전화 기능 열기" aria-expanded={actionsOpen}
          title="내 휴대전화">
          <TrainingPhoneIcon />
        </button>
      </header>
      <div className="rt-history" ref={historyRef} role="log" aria-live="polite" aria-relevant="additions text">
        <div className="rt-day">오늘 · 새로운 대화</div>
        {!session && !error && <div className="rt-loading-message" role="status">새 메시지를 불러오는 중…</div>}
        {!session && error && (
          <div className="rt-loading-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void start()}>다시 불러오기</button>
          </div>
        )}
        {(session?.messages ?? []).map((m, i) =>
          m.actor === "system" ? (
            <div key={i} className="rt-system"><span>{m.text}</span></div>
          ) : (
            <div key={i} className={m.actor === "me" ? "rt-message rt-message--mine" : "rt-message"}>
              {m.actor === "them" && <span className="rt-msg-avatar" aria-hidden="true"><PersonIcon /></span>}
              <div className="rt-msg-body">
                <div className="rt-bubble">
                  <p>{m.text}</p>
                  {m.actor === "them" && (m.actions ?? []).filter(action =>
                    !["transfer", "phone", "app"].includes(action.kind)
                  ).map((action) =>
                    action.kind === "link" && action.linkPreview ? (
                      <div className="rt-link-attachment" key={action.id}>
                        <button type="button" className="rt-link-url" onClick={() => activateAction(action, i)} disabled={busy}
                          aria-label={action.linkPreview.domain + " 링크 열기 (모의 문자)"}>
                          {action.linkPreview.url}
                        </button>
                        <button type="button" className="rt-link-preview" onClick={() => activateAction(action, i)} disabled={busy}
                          aria-label={action.linkPreview.title + " 링크 미리보기 열기 (모의 문자)"}>
                          <span className="rt-link-preview-image" aria-hidden="true"><span>▤</span></span>
                          <span className="rt-link-preview-copy">
                            <strong>{action.linkPreview.title}</strong>
                            <small>{action.linkPreview.description}</small>
                            <small className="rt-link-preview-domain">{action.linkPreview.domain}</small>
                          </span>
                        </button>
                      </div>
                    ) : (
                      <button className="rt-message-request" type="button" key={action.id} disabled={busy}
                        onClick={() => activateAction(action, i)} aria-label={action.label + " (가상 행동)"}>
                        <span className="rt-offer-icon" aria-hidden="true">
                          {action.kind === "app" ? "▣" : action.kind === "phone" ? "☎" : action.kind === "transfer" ? "₩" : "↗"}
                        </span>
                        {action.label}
                        <span aria-hidden="true">›</span>
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>
          ),
        )}
        {pendingMessage !== null && (
          <div className="rt-message rt-message--mine rt-pending" aria-label="방금 보낸 메시지">
            <div className="rt-msg-body"><div className="rt-bubble"><p>{pendingMessage}</p></div></div>
          </div>
        )}
        {typingVisible && pendingMessage !== null && (
          <div className="rt-typing" aria-label="상대방이 입력 중입니다" role="status">
            <span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
            <span className="sr-only">상대방이 입력 중입니다</span>
          </div>
        )}
      </div>

      <div className="rt-compose-zone">
        {error && <p className="rt-error" role="alert">{error}</p>}
        {session?.closed && !ending ? (
          <button type="button" className="btn btn--primary" disabled={busy}
            onClick={() => void finish()}>
            {busy ? "대응 분석 중…" : "내 행동 피드백 보기"}
          </button>
        ) : (
          <form className="rt-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <input type="text" className="rt-input" aria-label="상대에게 메시지 보내기" placeholder="메시지 입력"
              maxLength={300} value={input} disabled={busy || !session || session.closed || session.turns >= session.maxTurns}
              onChange={(event) => setInput(event.target.value)} />
            <button type="submit" className="rt-send" aria-label="메시지 전송"
              disabled={busy || !session || !input.trim() || session.closed}>
              <span aria-hidden="true">↑</span>
            </button>
          </form>
        )}
        <div className="rt-training-note">모의 훈련 · 실제 송금·통화·정보 전송 없음</div>
      </div>

      {introOpen && session && (
        <BottomSheet onClose={closeIntro}>
          <div className="rt-intro" aria-labelledby="rt-intro-title">
            <div className="rt-intro-icon"><TrainingPhoneIcon /></div>
            <h2 id="rt-intro-title">문자 외의 기능도 사용해 보세요</h2>
            <p className="rt-intro-lead">
              오른쪽 위 <strong>휴대전화 아이콘</strong>을 누르면
              연락처·전화·앱·송금을 사용할 수 있어요.
            </p>
            <div className="rt-intro-steps">
              <div><strong>① 대화하기</strong><span>상대방의 말에 자유롭게 답해요.</span></div>
              <div><strong>② 휴대전화 사용</strong><span>필요하다고 느낄 때, 대화 중간에도 직접 기능을 선택해 보세요.</span></div>
              <div><strong>③ 상황에 맞게 대응하기</strong><span>확인 후 문자로 돌아올 수 있어요. 송금이나 종료처럼 훈련을 마치는 행동도 있어요.</span></div>
            </div>
            <p className="rt-intro-note">어떤 연락에도 필요한 행동을 직접 선택해 보세요. 실제 통화나 송금은 일어나지 않아요.</p>
            <label className="rt-intro-check">
              <input type="checkbox" checked={skipIntroNextTime}
                onChange={e => setSkipIntroNextTime(e.target.checked)} />
              <span>다음부터 이 안내 보지 않기</span>
            </label>
            <button type="button" className="btn btn--primary" onClick={closeIntro}>
              알겠어요, 훈련 시작하기
            </button>
          </div>
        </BottomSheet>
      )}
      {actionsOpen && session && (
        <TrainingPhonePanel
          topic={phoneTopic}
          busy={busy}
          onClose={() => setActionsOpen(false)}
          onAction={(choice, method) => perform(choice, undefined, undefined, method)}
          transferRequests={transferRequests}
          onTransfer={({ sourceIndex, action }) => perform("comply", sourceIndex, action.id, undefined, true)}
          senderPhoneRequests={senderPhoneRequests}
          onSenderCall={({ sourceIndex, action }) => perform("verify_sender", sourceIndex, action.id, undefined, true)}
          onStop={() => void perform("stop")}
        />
      )}

      {ending && (
        <div className={ending.stage === "review" ? "rt-transition rt-transition--visible" : "rt-action-receipt"} role="status" aria-live="polite">
          <div className="rt-transition__symbol" aria-hidden="true">{ending.choice === "verify" || ending.choice === "family_contact" ? "✓" : ending.choice === "stop" ? "✕" : "↗"}</div>
          <strong>{ending.choice === "verify" ? "공식 경로로 확인했어요" :
            ending.choice === "family_contact" ? "가족에게 연락했어요" :
            ending.choice === "stop" ? "대화가 종료됐어요" :
            ending.choice === "comply" ? "송금 완료" : "정보 전송 완료"}</strong>
          {ending.stage === "review" && (
            <>
              <p>이번 대화에서 선택한 행동을 함께 돌아볼게요.</p>
              <span className="rt-transition__loading" aria-hidden="true" />
            </>
          )}
        </div>
      )}
      {previewIndex !== null && activeLink && (
        <BottomSheet onClose={() => setPreviewIndex(null)}>
          <div className="rt-browser">
            <div className="rt-browser-bar"><span aria-hidden="true">◀</span><strong>메시지에서 열린 페이지</strong><span aria-hidden="true">···</span></div>
            <div className="rt-browser-content">
              <span className="rt-browser-symbol" aria-hidden="true">▣</span>
              <h2>{activeLink.title}</h2>
              <p>정보 확인을 위해 아래 항목을 작성하시겠어요?</p>
              <div className="rt-browser-field">{activeLink.description}</div>
              <button className="btn btn--primary" disabled={busy} onClick={() => void perform("share", previewIndex, previewActionId ?? undefined)}>
                정보 입력 후 전송
              </button>
              <button className="btn btn--gray" disabled={busy} onClick={() => { setPreviewIndex(null); setPreviewActionId(null); }}>페이지 닫기</button>
            </div>
            <p className="rt-browser-foot">가상 페이지이며 실제 웹사이트로 이동하거나 개인정보를 입력하지 않습니다.</p>
          </div>
        </BottomSheet>
      )}
    </main>
  );
}
