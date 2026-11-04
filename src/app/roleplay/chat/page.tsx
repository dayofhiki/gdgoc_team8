"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PersonIcon } from "@/components/Icons";
import { BottomCTA, BottomSheet, Header, Screen } from "@/components/ui";

type OfferKind = "transfer" | "share" | "link" | "call";
type Message = { actor: "them" | "me" | "system"; text: string; offer?: OfferKind };
type Choice = "verify" | "verify_sender" | "verify_chat" | "comply" | "share" | "stop" | "open_link";
type Guess = "legitimate" | "fraud" | "uncertain";
type Phase = "loading" | "chat" | "judge" | "result";
type Ending = { choice: "verify" | "stop" | "comply" | "share"; stage: "receipt" | "review" };
type Session = {
  token: string;
  title?: string;
  messages: Message[];
  turns: number;
  maxTurns: number;
  verified: boolean;
  closed: boolean;
};
type Result = {
  identity: "legitimate" | "fraud";
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

const offerLabels: Record<OfferKind, string> = {
  transfer: "송금하기",
  share: "정보 전송하기",
  link: "안내 링크 열기",
  call: "안내 번호로 전화",
};

const offerIcons: Record<OfferKind, string> = {
  transfer: "₩",
  share: "↗",
  link: "↗",
  call: "☎",
};

function offerText(kind: OfferKind, title?: string): string {
  if (kind === "transfer" && title?.includes("가족")) return "수리비 보내기";
  if (kind === "transfer") return "요청 금액 이체하기";
  if (kind === "share" && title?.includes("택배")) return "배송 정보 전송";
  if (kind === "link" && title?.includes("택배")) return "배송 정보 확인 링크";
  if (kind === "link" && title?.includes("은행")) return "거래 내역 확인 링크";
  return offerLabels[kind];
}

function contactTitle(title?: string): string {
  if (title?.includes("가족")) return "처음 보는 번호";
  if (title?.includes("택배")) return "배송 안내";
  if (title?.includes("은행")) return "거래 안내";
  return "새 메시지";
}

export default function RealTraining() {
  const router = useRouter();
  const started = useRef(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [input, setInput] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [tipVisible, setTipVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [openedLinks, setOpenedLinks] = useState<number[]>([]);
  const [guess, setGuess] = useState<Guess>("uncertain");
  const [result, setResult] = useState<Result | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [typingVisible, setTypingVisible] = useState(false);
  const [ending, setEnding] = useState<Ending | null>(null);

  async function start() {
    setPhase("loading");
    setError("");
    setInput("");
    setSession(null);
    setGuess("uncertain");
    setResult(null);
    setPendingMessage(null);
    setTypingVisible(false);
    setEnding(null);
    setOpenedLinks([]);
    setPreviewIndex(null);
    setActionsOpen(false);
    setBusy(true);
    try {
      const initial = await request({ action: "start" });
      setSession(initial);
      try { setTipVisible(localStorage.getItem("mikki-action-guide-v1") !== "seen"); }
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
    try { localStorage.setItem("mikki-action-guide-v1", "seen"); } catch { /* storage disabled */ }
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
      if (next.closed) setPhase("judge");
    } catch (err) {
      // 네트워크 실패 시 보낸 것처럼 남겨 두지 않고 입력창에 복구한다.
      setPendingMessage(null);
      setInput(text);
      setError(err instanceof Error ? err.message : "대화에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function perform(choice: Choice, sourceIndex?: number) {
    if (!session || busy || ending) return;
    setBusy(true);
    setError("");
    try {
      const next = await request({ action: "choice", token: session.token, choice, ...(sourceIndex !== undefined ? { sourceIndex } : {}) });
      setSession({ ...next, title: session.title });
      setActionsOpen(false);
      if (choice === "open_link" && sourceIndex !== undefined) {
        setOpenedLinks((prev) => prev.includes(sourceIndex) ? prev : [...prev, sourceIndex]);
        setPreviewIndex(sourceIndex);
      } else {
        setPreviewIndex(null);
        if (next.closed && (choice === "verify" || choice === "stop" || choice === "comply" || choice === "share")) {
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

  function activateOffer(offer: OfferKind, index: number) {
    if (busy) return;
    if (offer === "link" && openedLinks.includes(index)) {
      setPreviewIndex(index);
      return;
    }
    const choice: Choice =
      offer === "transfer" ? "comply" :
      offer === "share" ? "share" :
      offer === "call" ? "verify_sender" : "open_link";
    void perform(choice, index);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "결과를 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return (
      <Screen>
        <Header title="실전 대응 훈련" back={() => router.push("/home")} />
        <section className="screen__body">
          <div className="stack" style={{ marginTop: 60, gap: 14 }}>
            <h2 className="title">상대가 누구인지 모르는 상황부터 연습해요</h2>
            <p className="desc">실제 연락과 사칭 시도가 섞여 있어요. 사기인지 맞히는 것보다 안전하게 확인하는 행동이 중요해요.</p>
            {busy ? <p className="desc" role="status">훈련을 준비하고 있어요…</p> : null}
            {error ? <p role="alert" style={{ color: "var(--red)" }}>{error}</p> : null}
          </div>
        </section>
        {!busy && <BottomCTA><button className="btn btn--primary" onClick={() => void start()}>다시 시도하기</button></BottomCTA>}
      </Screen>
    );
  }

  if (phase === "result" && result) {
    return (
      <Screen>
        <Header title="실전 훈련 결과" back={() => router.push("/home")} />
        <section className="screen__body" style={{ gap: 16 }}>
          <div className="stack" style={{ marginTop: 18, gap: 10 }}>
            <span className="chip">실제 정체 공개</span>
            <h2 className="title">{result.truthLabel === "실제 연락" ? "이번에는 진짜 연락이었어요" : "이번에는 사칭 시도였어요"}</h2>
            <p className="desc">{result.purpose}</p>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <p className="card__title">이번 훈련의 행동 평가</p>
            <div className="kv"><span className="kv__k">안전 행동</span><span className="kv__v" style={{ whiteSpace: "normal" }}>{result.safety}</span></div>
            <div className="kv"><span className="kv__k">정체 판단</span><span className="kv__v">{result.judgment}</span></div>
            <div className="kv"><span className="kv__k">독립 확인</span><span className="kv__v">{result.checked ? "직접 실행함" : "실행하지 않음"}</span></div>
            {result.linkOpened && <div className="kv"><span className="kv__k">메시지 링크</span><span className="kv__v">열어 봄</span></div>}
            {result.followedSenderNumber && <div className="kv"><span className="kv__k">안내받은 번호</span><span className="kv__v">연락함</span></div>}
          </div>
          <div className="card card--blue">
            <p className="card__title">이번 행동에서 배울 점</p>
            {result.feedback.map((line, index) => <p className="card__text" key={index}>{index + 1}. {line}</p>)}
          </div>
          <div className="card">
            <p className="card__title">공식 경로로 확인하면 알 수 있었던 사실</p>
            <p className="card__text">{result.verificationEvidence}</p>
          </div>
          <div className="card card--blue">
            <p className="card__title">가족과 실천할 약속</p>
            <p className="card__text">{result.nextStep}</p>
            <Link href="/family-code/guide" className="btn btn--secondary" style={{ marginTop: 8 }}>가족 확인 질문 만들기</Link>
          </div>
          <p className="desc" style={{ fontSize: 12, lineHeight: "18px" }}>{result.note}</p>
        </section>
        <BottomCTA row>
          <button className="btn btn--gray" onClick={() => router.push("/home")}>홈으로</button>
          <button className="btn btn--primary" onClick={() => void start()}>다른 상황 연습</button>
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
            <span className="chip">마지막 판단</span>
            <h2 className="title">지금까지의 대화 상대는 누구였을까요?</h2>
            <p className="desc">확신할 수 없다면 판단을 보류해도 괜찮아요. 실제로 어떤 행동을 했는지도 함께 분석합니다.</p>
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
        <BottomCTA><button className="btn btn--primary" disabled={busy} onClick={() => void finish()}>{busy ? "결과 분석 중…" : "결과 확인하기"}</button></BottomCTA>
      </Screen>
    );
  }

  const contact = contactTitle(session?.title);

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
        <button type="button" className="rt-header-more" onClick={openActions} aria-label="대응 행동 메뉴 열기" aria-expanded={actionsOpen}>···</button>
      </header>

      <div className="rt-history" ref={historyRef} role="log" aria-live="polite" aria-relevant="additions text">
        <div className="rt-day">오늘 · 새로운 대화</div>
        {(session?.messages ?? []).map((m, i) =>
          m.actor === "system" ? (
            <div key={i} className="rt-system"><span>{m.text}</span></div>
          ) : (
            <div key={i} className={m.actor === "me" ? "rt-message rt-message--mine" : "rt-message"}>
              {m.actor === "them" && <span className="rt-msg-avatar" aria-hidden="true"><PersonIcon /></span>}
              <div className="rt-msg-body">
                <div className="rt-bubble">
                  <p>{m.text}</p>
                  {m.actor === "them" && m.offer && (
                    <button
                      className={m.offer === "link" || m.offer === "call" ? "rt-message-link" : "rt-message-request"}
                      type="button"
                      disabled={busy}
                      onClick={() => activateOffer(m.offer!, i)}
                      aria-label={offerText(m.offer, session?.title) + " (가상 행동)"}
                    >
                      <span className="rt-offer-icon" aria-hidden="true">{offerIcons[m.offer]}</span>
                      {offerText(m.offer, session?.title)}
                      <span aria-hidden="true">›</span>
                    </button>
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
        {tipVisible && (
          <div className="rt-guide" role="status">
            <div><strong>다른 방법으로 확인하고 싶으신가요?</strong><p>왼쪽 <b>＋</b> 버튼에서 기존 번호로 확인하거나 대화를 끝낼 수 있어요.</p></div>
            <button type="button" className="rt-guide-close" aria-label="안내 닫기" onClick={dismissGuide}>×</button>
          </div>
        )}
        {error && <p className="rt-error" role="alert">{error}</p>}
        <form className="rt-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <button className="rt-plus" type="button" aria-label="확인 및 대화 중단 메뉴" aria-expanded={actionsOpen} onClick={openActions} disabled={busy || Boolean(ending)}>
            <span aria-hidden="true">＋</span>
          </button>
          <input type="text" className="rt-input" aria-label="상대에게 메시지 보내기" placeholder="메시지 입력"
            maxLength={300} value={input} disabled={busy || session?.closed || (session?.turns ?? 0) >= (session?.maxTurns ?? 8)}
            onChange={(event) => setInput(event.target.value)} />
          <button type="submit" className="rt-send" aria-label="메시지 전송"
            disabled={busy || !input.trim() || session?.closed}>
            <span aria-hidden="true">↑</span>
          </button>
        </form>
        <div className="rt-training-note">모의 훈련 · 실제 송금·통화·정보 전송 없음</div>
      </div>

      {actionsOpen && (
        <BottomSheet onClose={() => setActionsOpen(false)}>
          <div className="rt-sheet-title">
            <h2>다음에 어떻게 하시겠어요?</h2>
            <p>대화 밖에서 할 수 있는 행동을 선택해 보세요.</p>
          </div>
          <button type="button" className="rt-sheet-action" onClick={() => void perform("verify")} disabled={busy}>
            <span className="rt-sheet-icon">☎</span>
            <span><strong>기존 번호·공식 앱으로 확인</strong><small>직접 확인한 후 훈련 마무리</small></span><span aria-hidden="true">›</span>
          </button>
          <button type="button" className="rt-sheet-action" onClick={() => void perform("stop")} disabled={busy}>
            <span className="rt-sheet-icon">✕</span>
            <span><strong>대화 중단하기</strong><small>대화를 끝내고 판단 단계로 이동</small></span><span aria-hidden="true">›</span>
          </button>
          <button type="button" className="btn btn--gray" onClick={() => setActionsOpen(false)}>계속 대화하기</button>
        </BottomSheet>
      )}

      {ending && (
        <div className={ending.stage === "review" ? "rt-transition rt-transition--visible" : "rt-action-receipt"} role="status" aria-live="polite">
          <div className="rt-transition__symbol" aria-hidden="true">{ending.choice === "verify" ? "✓" : ending.choice === "stop" ? "✕" : "↗"}</div>
          <strong>{ending.choice === "verify" ? "기존 연락처로 확인했어요" :
            ending.choice === "stop" ? "대화를 종료했어요" :
            ending.choice === "comply" ? "송금 행동이 기록됐어요" : "정보 전송이 기록됐어요"}</strong>
          {ending.stage === "review" && (
            <>
              <p>상대의 실제 정체와 내 대응을 확인해 볼까요?</p>
              <span className="rt-transition__loading" aria-hidden="true" />
            </>
          )}
        </div>
      )}
      {previewIndex !== null && (
        <BottomSheet onClose={() => setPreviewIndex(null)}>
          <div className="rt-browser">
            <div className="rt-browser-bar"><span aria-hidden="true">◀</span><strong>메시지에서 열린 페이지</strong><span aria-hidden="true">···</span></div>
            <div className="rt-browser-content">
              <span className="rt-browser-symbol" aria-hidden="true">▣</span>
              <h2>{session?.title?.includes("택배") ? "배송지 확인" : session?.title?.includes("은행") ? "거래 내역 확인" : "안내 확인"}</h2>
              <p>정보 확인을 위해 아래 항목을 작성하시겠어요?</p>
              <div className="rt-browser-field">{session?.title?.includes("택배") ? "받는 분 · 배송지" : "이름 · 확인 정보"}</div>
              <button className="btn btn--primary" disabled={busy} onClick={() => void perform("share", previewIndex)}>
                정보 입력 후 전송
              </button>
              <button className="btn btn--gray" disabled={busy} onClick={() => setPreviewIndex(null)}>페이지 닫기</button>
            </div>
            <p className="rt-browser-foot">가상 페이지이며 실제 웹사이트로 이동하거나 개인정보를 입력하지 않습니다.</p>
          </div>
        </BottomSheet>
      )}
    </main>
  );
}
