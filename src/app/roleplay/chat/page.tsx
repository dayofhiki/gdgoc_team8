"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PersonIcon } from "@/components/Icons";
import { BottomCTA, BottomSheet, Header, Screen } from "@/components/ui";
import { actionChoice, type Action } from "@/lib/trainingActions";
import { useAppState } from "@/components/AppState";
import { copyText } from "@/lib/share";
import { familyShareUrl } from "@/lib/invite";
import { saveRecord } from "@/lib/records";
import type { BehaviorFeedback } from "@/lib/trainingFeedback";

type OfferKind = "transfer" | "share" | "link" | "call" | "official_app" | "official_call";
type LinkPreview = { url: string; domain: string; title: string; description: string };
type Message = { actor: "them" | "me" | "system"; text: string; actions?: Action[] };
type Choice = "verify" | "family_contact" | "verify_sender" | "verify_chat" | "comply" | "share" | "stop" | "open_link";
type Guess = "legitimate" | "fraud" | "uncertain";
type Phase = "chat" | "judge" | "result";
type Ending = { choice: "verify" | "family_contact" | "stop" | "comply" | "share" | "natural" | "turn_limit"; stage: "receipt" | "review" };
type Session = {
  token: string;
  title?: string;
  messages: Message[];
  turns: number;
  maxTurns: number;
  verified: boolean;
  closed: boolean;
  endReason?: "natural" | "turn_limit" | "action" | null;
};
type Result = {
  identity: "legitimate" | "fraud";
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

function contactTitle(title?: string): string {
  if (title?.includes("가족")) return "처음 보는 번호";
  if (title?.includes("택배")) return "배송 안내";
  if (title?.includes("은행")) return "거래 안내";
  return "새 메시지";
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
  const [tipVisible, setTipVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewActionId, setPreviewActionId] = useState<string | null>(null);
  const [openedLinks, setOpenedLinks] = useState<string[]>([]);
  const [guess, setGuess] = useState<Guess>("uncertain");
  const [result, setResult] = useState<Result | null>(null);
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
    setGuess("uncertain");
    setResult(null);
    setShareNotice("");
    setPendingMessage(null);
    setTypingVisible(false);
    setEnding(null);
    setOpenedLinks([]);
    setPreviewIndex(null);
    setPreviewActionId(null);
    setActionsOpen(false);
    setBusy(true);
    try {
      const initial = await request({ action: "start" });
      setSession(initial);
      try { setTipVisible(localStorage.getItem("mikki-menu-guide-v2") !== "seen"); }
      catch { setTipVisible(true); }
      setPhase("chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "훈련을 시작하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
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
    if (ending.choice === "natural" || ending.choice === "turn_limit") {
      // 마지막 문자와 종료 안내를 충분히 확인하고 판단 단계로 이동.
      // 동작 감소를 선호하는 기기에서는 자동 화면 이동을 생략한다.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const timeout = window.setTimeout(() => { setEnding(null); setPhase("judge"); }, 3400);
      return () => window.clearTimeout(timeout);
    }
    if (ending.stage === "receipt") {
      const timeout = window.setTimeout(() => setEnding({ choice: ending.choice, stage: "review" }), 500);
      return () => window.clearTimeout(timeout);
    }
    const timeout = window.setTimeout(() => {
      setEnding(null);
      setPhase("judge");
    }, 1250);
    return () => window.clearTimeout(timeout);
  }, [ending]);

  function dismissGuide() {
    setTipVisible(false);
    try { localStorage.setItem("mikki-menu-guide-v2", "seen"); } catch { /* storage disabled */ }
  }

  function openActions() {
    dismissGuide();
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
      setSession({ ...next, title: session.title });
      setPendingMessage(null);
      if (next.closed) {
        setTipVisible(false);
        if (next.endReason === "natural" || next.endReason === "turn_limit") {
          setEnding({ choice: next.endReason, stage: "review" });
        } else {
          setPhase("judge");
        }
      }
    } catch (err) {
      // 네트워크 실패 시 보낸 것처럼 남겨 두지 않고 입력창에 복구한다.
      setPendingMessage(null);
      setInput(text);
      setError(err instanceof Error ? err.message : "대화에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function perform(choice: Choice, sourceIndex?: number, actionId?: string) {
    if (!session || busy || ending) return;
    setBusy(true);
    setError("");
    try {
      const next = await request({ action: "choice", token: session.token, choice, ...(sourceIndex !== undefined ? { sourceIndex } : {}), ...(actionId ? { actionId } : {}) });
      setSession({ ...next, title: session.title });
      setActionsOpen(false);
      if (choice === "open_link" && sourceIndex !== undefined && actionId) {
        setOpenedLinks((prev) => prev.includes(actionId) ? prev : [...prev, actionId]);
        setPreviewIndex(sourceIndex);
        setPreviewActionId(actionId);
      } else {
        setPreviewIndex(null);
        setPreviewActionId(null);
        if (next.closed && (choice === "verify" || choice === "family_contact" || choice === "stop" || choice === "comply" || choice === "share")) {
          setEnding({ choice, stage: "receipt" });
        } else if (next.closed || next.turns >= next.maxTurns) {
          setPhase("judge");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "행동을 기록하지 못했습니다.");
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
      const answer = await request({ action: "finish", token: session.token, guess });
      if (!answer.result) throw new Error("훈련 결과를 불러오지 못했습니다.");
      setResult(answer.result);
      setPhase("result");
      const r = answer.result;
      void saveRecord({
        kind: "training",
        title: (session.title ?? "").slice(0, 60),
        safe: !r.dangerousAction,
        detail: { identity: r.identity, guess, checked: r.checked, linkOpened: r.linkOpened, followedSenderNumber: r.followedSenderNumber },
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

  if (phase === "result" && result) {
    const feedback = result.behavior;
    return (
      <Screen>
        <Header title="내 대응 돌아보기" back={() => router.push("/home")} />
        <section className="screen__body rt-feedback rt-feedback--behavior">
          <section className={"rt-feedback-behavior-hero rt-feedback-behavior-hero--" + feedback.tone} aria-label="이번 대응의 핵심 피드백">
            <span className="rt-feedback-behavior-eyebrow">오늘의 대응 피드백</span>
            <h2>{feedback.headline}</h2>
            <p>{feedback.explanation}</p>
            <span className="rt-feedback-evidence-note">정답이 아닌, 실제로 선택한 행동을 기준으로 살펴봤어요.</span>
          </section>

          <section className="rt-feedback-receipts" aria-labelledby="rt-actions-heading">
            <div className="rt-feedback-block-heading">
              <h3 id="rt-actions-heading">이번에 내가 한 행동</h3>
              <span>실제 선택 기록</span>
            </div>
            <ol className="rt-feedback-receipt-list">
              {feedback.receipts.map((receipt, i) => (
                <li key={i} className={"rt-feedback-receipt rt-feedback-receipt--" + receipt.tone}>
                  <span className="rt-feedback-receipt-mark" aria-hidden="true">{i + 1}</span>
                  <div><strong>{receipt.label}</strong><p>{receipt.detail}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <section className="rt-feedback-panel rt-feedback-panel--good" aria-label="잘한 점">
            <div className="rt-feedback-section-head">
              <span aria-hidden="true">✓</span>
              <h3>잘한 점</h3>
            </div>
            {feedback.good.length > 0 ? feedback.good.map((item, i) => (
              <div className="rt-feedback-point" key={i}>
                <strong>{item.keyword}</strong>
                <span>{item.text}</span>
              </div>
            )) : <p className="rt-feedback-empty">이번에는 확인된 안전 행동이 없었어요. 다음 연습에서는 직접 확인하는 행동부터 선택해 보세요.</p>}
          </section>

          <section className="rt-feedback-panel rt-feedback-panel--improve" aria-label="개선할 점">
            <div className="rt-feedback-section-head">
              <span aria-hidden="true">!</span>
              <h3>다음에는 이렇게 해봐요</h3>
            </div>
            {feedback.improve.length > 0 ? feedback.improve.map((item, i) => (
              <div className="rt-feedback-point" key={i}>
                <strong>{item.keyword}</strong>
                <span>{item.text}</span>
              </div>
            )) : <p className="rt-feedback-empty">이번에는 크게 고칠 행동이 없어요. 다음 상황에서도 같은 확인 습관을 이어가세요.</p>}
          </section>

          <section className="rt-feedback-promise" aria-labelledby="rt-promise-heading">
            <div className="rt-feedback-promise-intro">
              <span className="rt-feedback-promise-overline">연습을 일상 속 안전 습관으로</span>
              <h3 id="rt-promise-heading">우리 가족의 안전 약속</h3>
              <p>가족과 함께 정하고, 낯선 연락이 올 때마다 이 순서를 떠올려 보세요.</p>
            </div>
            <ol className="rt-feedback-promise-list">
              {feedback.promises.map((promise, index) => (
                <li className="rt-feedback-promise-item" key={promise.id}>
                  <span className="rt-feedback-promise-number" aria-hidden="true">{index + 1}</span>
                  <div>
                    <strong>{promise.title}</strong>
                    <p>{promise.detail}</p>
                    <span className={promise.practiced ? "rt-feedback-promise-practiced" : "rt-feedback-promise-reminder"}>
                      {promise.practiced ? "이번 훈련에서 실천" : "다음에 기억할 약속"}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            <div className="rt-feedback-family-question">
              <strong>가족 확인 질문</strong>
              {familyReady && familyQuestion.trim() ? (
                <>
                  <p>{familyQuestion}</p>
                  <small>이 기기에 저장된 질문이에요. 실제 답은 문자로 보내지 말고 가족과 직접 정하세요.</small>
                </>
              ) : (
                <p>아직 이 기기에 저장된 확인 질문이 없어요. 가족과 직접 만나 함께 정해 보세요.</p>
              )}
              <Link href={familyReady && familyQuestion.trim() ? "/family-code/question" : "/family-code/guide"}>
                {familyReady && familyQuestion.trim() ? "질문 변경하기" : "가족 확인 질문 정하기"} <span aria-hidden="true">›</span>
              </Link>
            </div>
            <div className="rt-feedback-promise-action">
              <button type="button" onClick={() => void shareFamilyPromises()}>가족에게 안전 약속 공유하기</button>
              <p>안전 약속만 공유하고, 가족 확인 질문과 답은 외부로 보내지 않아요.</p>
            </div>
            <p className="rt-feedback-promise-focus"><strong>다음 연습의 목표</strong>{feedback.focus}</p>
          </section>

          <details className="rt-feedback-truth" aria-label="이번 가상 연락의 설정 확인">
            <summary>
              <span>이번 가상 연락의 정체와 확인 결과</span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="rt-feedback-truth-content">
              <strong>{result.truthLabel}</strong>
              <p>{result.purpose}</p>
              <p>{result.verificationEvidence}</p>
              <p>이것은 훈련을 위해 정해진 가상 상황의 정체예요. 실제 연락에서는 말투나 정답 추측보다 독립 확인이 중요해요.</p>
            </div>
          </details>
          <p className="rt-feedback-disclaimer">{result.note}</p>
          {shareNotice && <p className="rt-feedback-share-notice" role="status">{shareNotice}</p>}
        </section>
        <BottomCTA row>
          <button className="btn btn--gray" onClick={() => router.push("/home")}>홈으로</button>
          <button className="btn btn--primary" onClick={() => void start()}>한 번 더 연습하기</button>
        </BottomCTA>
      </Screen>
    );
  }

  if (phase === "judge") {
    return (
      <Screen>
        <Header title="실전 대응 훈련" back={() => setPhase("chat")} />
        <section className="screen__body">
          <div className="stack" style={{ marginTop: 28, gap: 12 }}>
            <span className="chip">마지막 생각 정리</span>
            <h2 className="title">이번 연락을 어떻게 느끼셨나요?</h2>
            <p className="desc">정체를 몰라도 괜찮아요. 중요한 것은 대화 중 어떤 행동을 선택했는지예요.</p>
          </div>
          <div className="stack" style={{ marginTop: 34, gap: 12 }} role="radiogroup" aria-label="상대방 정체 판단">
            {([
              { value: "legitimate", label: "실제 가족·기관이라고 생각해요" },
              { value: "fraud", label: "사칭범이라고 생각해요" },
              { value: "uncertain", label: "아직 판단하기 어려워요" },
            ] as { value: Guess; label: string }[]).map((entry) => (
              <button type="button" key={entry.value} role="radio" aria-checked={guess === entry.value}
                className={guess === entry.value ? "option option--selected" : "option"}
                onClick={() => setGuess(entry.value)}>
                <span className="option__text"><span className="option__title">{entry.label}</span></span>
                <span aria-hidden="true">{guess === entry.value ? "✓" : "○"}</span>
              </button>
            ))}
          </div>
          {error && <p role="alert" style={{ color: "var(--red)", marginTop: 14 }}>{error}</p>}
        </section>
        <BottomCTA><button className="btn btn--primary" disabled={busy} onClick={() => void finish()}>{busy ? "대응 분석 중…" : "내 대응 살펴보기"}</button></BottomCTA>
      </Screen>
    );
  }

  const contact = contactTitle(session?.title);
  const activeLink = previewIndex !== null ? session?.messages[previewIndex]?.actions?.find(a => a.id === previewActionId)?.linkPreview : undefined;

  return (
    <main className="screen rt-screen">
      <header className="rt-header">
        <button type="button" className="rt-nav-back" onClick={() => router.push("/roleplay/mode")} aria-label="뒤로 가기">
          <span aria-hidden="true">‹</span>
        </button>
        <div className="rt-avatar" aria-hidden="true"><PersonIcon /></div>
        <div className="rt-contact">
          <strong>{contact}</strong>
          <span>문자 메시지</span>
        </div>
        <button type="button" className="rt-header-more" onClick={openActions} aria-label="다른 사람에게 연락하거나 대화 중단 메뉴 열기" aria-expanded={actionsOpen}>···</button>
      </header>
      {tipVisible && session && (
        <div className="rt-menu-guide" role="status">
          <span>위의 <b>···</b>에서 가족에게 연락하거나 대화를 중단할 수 있어요.</span>
          <button type="button" onClick={dismissGuide} aria-label="안내 닫기">×</button>
        </div>
      )}

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
                  {m.actor === "them" && (m.actions ?? []).map((action) =>
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
        {session?.closed && (session.endReason === "natural" || session.endReason === "turn_limit") ? (
          <div className="rt-conversation-ended" role="status" aria-live="polite">
            <span className="rt-conversation-ended__icon" aria-hidden="true">✓</span>
            <div>
              <strong>{session.endReason === "natural" ? "이번 문자 대화가 마무리되었어요" : "여기까지 연습해 볼게요"}</strong>
              <p>어떻게 대응하셨는지 함께 살펴볼까요?</p>
            </div>
            <button type="button" className="rt-conversation-ended__button"
              onClick={() => { setEnding(null); setPhase("judge"); }}>
              내 대응 결과 확인하기 <span aria-hidden="true">›</span>
            </button>
          </div>
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

      {actionsOpen && (
        <BottomSheet onClose={() => setActionsOpen(false)}>
          <div className="rt-sheet-title">
            <h2>다음에 어떻게 하시겠어요?</h2>
            <p>대화 밖에서 할 수 있는 행동을 선택해 보세요.</p>
          </div>
          <button type="button" className="rt-sheet-action" onClick={() => void perform("family_contact")} disabled={busy}>
            <span className="rt-sheet-icon">☎</span>
            <span><strong>저장된 번호로 가족에게 연락</strong><small>가족에게 직접 연락하고 대화 마무리</small></span><span aria-hidden="true">›</span>
          </button>
          <button type="button" className="rt-sheet-action" onClick={() => void perform("stop")} disabled={busy}>
            <span className="rt-sheet-icon">✕</span>
            <span><strong>대화 중단하기</strong><small>대화를 끝내고 판단 단계로 이동</small></span><span aria-hidden="true">›</span>
          </button>
          <button type="button" className="btn btn--gray" onClick={() => setActionsOpen(false)}>계속 대화하기</button>
        </BottomSheet>
      )}

      {ending && ending.choice !== "natural" && ending.choice !== "turn_limit" && (
        <div className={ending.stage === "review" ? "rt-transition rt-transition--visible" : "rt-action-receipt"} role="status" aria-live="polite">
          <div className="rt-transition__symbol" aria-hidden="true">{ending.choice === "verify" || ending.choice === "family_contact" ? "✓" : ending.choice === "stop" ? "✕" : "↗"}</div>
          <strong>{ending.choice === "verify" ? "공식 경로로 확인했어요" :
            ending.choice === "family_contact" ? "가족에게 연락했어요" :
            ending.choice === "stop" ? "대화가 종료됐어요" :
            ending.choice === "comply" ? "송금 완료" : "정보 전송 완료"}</strong>
          {ending.stage === "review" && (
            <>
              <p>지금까지의 선택을 돌아보고 상대의 정체를 확인해 볼까요?</p>
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
