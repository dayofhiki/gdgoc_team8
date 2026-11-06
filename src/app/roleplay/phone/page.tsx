"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header, Screen } from "@/components/ui";
import { saveRecord } from "@/lib/records";
import { GeminiLiveAudio, type LiveBoot } from "@/lib/geminiLiveAudio";
import { findPhoneCase, heardPhoneRequest, POST_ACTION_LABEL, type PhoneFeedback, type PhoneLine, type PhonePostAction } from "@/lib/phoneTraining";

type Phase = "incoming" | "call" | "after_call" | "feedback";
type PhoneReply = {
  token: string;
  endedBy?: "user" | "caller" | "connection";
  phase: "call" | "after_call" | "finished";
  requestObserved: boolean;
  postActions: PhonePostAction[];
  caller?: string;
  caseId?: string;
  availableActions?: PhonePostAction[];
  requestActionLabel?: string;
  liveToken?: string;
  liveEndpoint?: string;
  liveSetup?: Record<string, unknown>;
  feedback?: PhoneFeedback;
  actionNotice?: string;
};
type AppMenu = "phone" | "apps" | "request" | null;
const RECENT_KEY = "mikki:phone-recent-v1";
const fmt = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

async function api(payload: object): Promise<PhoneReply> {
  const response = await fetch("/api/phone-training", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload), cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(
    data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error : "전화 훈련 요청에 실패했어요.");
  return data as PhoneReply;
}
function previousCases(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(-3) : [];
  } catch { return []; }
}
function rememberCase(id?: string) {
  if (!id) return;
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify([...previousCases().filter(x => x !== id), id].slice(-3))); }
  catch { /* 저장소를 못 써도 훈련은 정상 진행 */ }
}

export default function GeminiLivePhonePractice() {
  const router = useRouter();
  const live = useRef<GeminiLiveAudio | null>(null);
  const sessionRef = useRef<PhoneReply | null>(null);
  const currentRun = useRef(0);
  const startedAt = useRef(0);
  const observedRisk = useRef(false);
  const modelTurnCaption = useRef("");
  const busyRef = useRef(false);
  const savedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("incoming");
  const [session, setSession] = useState<PhoneReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const [modelCaption, setModelCaption] = useState("");
  const [myCaption, setMyCaption] = useState("");
  const [transcript, setTranscript] = useState<PhoneLine[]>([]);
  const [typing, setTyping] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [menu, setMenu] = useState<AppMenu>(null);
  const [actionNotice, setActionNotice] = useState("");

  useEffect(() => {
    return () => { currentRun.current++; live.current?.close(); live.current = null; };
  }, []);
  useEffect(() => {
    if (phase !== "call") return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== "feedback" || !session?.feedback || savedRef.current) return;
    savedRef.current = true;
    void saveRecord({
      kind: "training", title: "AI 피싱범 전화 대응 훈련",
      safe: session.feedback.status === "good",
      detail: { mode: "phone_live", coverage: session.feedback.coverage,
        postActionCount: session.feedback.actions.length - 1 },
    });
  }, [phase, session]);

  function updateSession(next: PhoneReply) {
    const merged = { ...sessionRef.current, ...next };
    // Ephemeral credentials are needed only to connect, never in ongoing UI session state.
    delete merged.liveToken;
    sessionRef.current = merged;
    setSession(merged);
    if (next.actionNotice) setActionNotice(next.actionNotice);
    return merged;
  }
  function stopLive() {
    live.current?.close();
    live.current = null;
    setSpeaking(false);
  }
  async function acceptCall() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setModelCaption("");
    setMyCaption("");
    setTranscript([]);
    setStatus("마이크와 음성 연결을 준비하는 중…");
    observedRisk.current = false;
    const id = ++currentRun.current;
    const client = new GeminiLiveAudio({
      onCallerHangup: () => {
        if (id === currentRun.current) void hangUp("caller");
      },
      onConnectionClosed: () => {
        if (id === currentRun.current) void hangUp("connection");
      },
      onModelTurnStart: () => {
        if (id !== currentRun.current) return;
        modelTurnCaption.current = "";
        setModelCaption("");
      },
      onModelText: text => {
        if (id !== currentRun.current || !text.trim()) return;
        const startsTurn = !modelTurnCaption.current;
        const caption = (modelTurnCaption.current + " " + text).trim().slice(-600);
        modelTurnCaption.current = caption;
        setModelCaption(caption);
        setTranscript(prev => {
          const line = { actor: "caller" as const, text: caption };
          return [...(!startsTurn && prev.at(-1)?.actor === "caller" ? prev.slice(0, -1) : prev), line].slice(-16);
        });
        const phoneCase = findPhoneCase(sessionRef.current?.caseId ?? "");
        if (phoneCase && heardPhoneRequest(phoneCase, caption)) {
          observedRisk.current = true;
          live.current?.setCallerMayHangUp(true);
        }
      },
      onModelTurnComplete: () => {
        // A spoken farewell before the scenario's key decision does not count
        // as completed training and cannot trigger automatic hangup.
      },
      onPrematureCallerHangup: () => {
        if (id === currentRun.current) {
          setStatus("통화 상대가 종료를 언급했지만 중요한 요청은 확인되지 않았어요.");
        }
      },
      onUserText: text => {
        if (id !== currentRun.current) return;
        setMyCaption(text.slice(-300));
        setTranscript(prev => {
          const last = prev.at(-1);
          return last?.actor === "me"
            ? [...prev.slice(0, -1), { actor: "me" as const, text: (last.text + " " + text).slice(-600) }].slice(-16)
            : [...prev, { actor: "me" as const, text }].slice(-16);
        });
      },
      onSpeaking: setSpeaking,
      onStatus: setStatus,
      onError: setError,
    });
    live.current = client;
    try {
      await client.prepare(); // Within user activation, before any network wait.
      if (id !== currentRun.current) return;
      setMicAvailable(client.hasMicrophone());
      const boot = await api({ action: "start", recentCases: previousCases() });
      if (!boot.liveToken || !boot.liveEndpoint || !boot.liveSetup)
        throw Error("AI 피싱범 음성 연결 정보를 받지 못했어요.");
      rememberCase(boot.caseId);
      updateSession(boot);
      await client.connect(boot as LiveBoot);
      if (id !== currentRun.current) return;
      client.setMicrophoneEnabled(micOn);
      client.setSoundEnabled(soundOn);
      setSeconds(0);
      startedAt.current = Date.now();
      setPhase("call");
      setStatus("통화가 시작됐어요.");
      client.startConversation();
    } catch (e) {
      client.close();
      if (id === currentRun.current) {
        live.current = null;
        setPhase("incoming");
        setError(e instanceof Error ? e.message : "AI 피싱범과의 통화를 시작하지 못했어요.");
      }
    } finally { if (id === currentRun.current) { busyRef.current = false; setBusy(false); } }
  }

  async function hangUp(endedBy: "user" | "caller" | "connection" = "user") {
    if (busyRef.current) return;
    const current = sessionRef.current;
    if (!current || current.phase !== "call") return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    stopLive();
    try {
      const next = await api({
        action: "end_call", token: current.token,
        requestObserved: observedRisk.current, endedBy,
      });
      updateSession(next);
      setPhase("after_call");
      setMenu(null);
      setActionNotice("");
      setStatus(endedBy === "caller" ? "상대방이 먼저 전화를 끊었어요." :
        endedBy === "connection" ? "음성 연결이 종료됐어요." : "통화를 종료했어요.");
    } catch (e) { setError(e instanceof Error ? e.message : "통화 종료를 처리하지 못했어요. 다시 눌러주세요."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function recordPostAction(action: PhonePostAction) {
    const current = sessionRef.current;
    if (!current || current.phase !== "after_call" || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api({ action: "post_action", token: current.token, postAction: action });
      updateSession(result);
      setMenu(null);
    } catch (e) { setError(e instanceof Error ? e.message : "행동을 기록하지 못했어요."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function finish() {
    const current = sessionRef.current;
    if (!current || current.phase !== "after_call" || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api({ action: "finish", token: current.token });
      updateSession(result);
      setPhase("feedback");
    } catch (e) { setError(e instanceof Error ? e.message : "피드백을 불러오지 못했어요."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function sendLiveText() {
    const text = typing.trim();
    if (!text || !live.current?.isConnected()) return;
    try {
      live.current.sendText(text);
      setMyCaption(text);
      setTranscript(prev => [...prev, { actor: "me" as const, text }].slice(-16));
      setTyping("");
    } catch (e) { setError(e instanceof Error ? e.message : "전달하지 못했어요."); }
  }
  function toggleMic() {
    const enabled = !micOn;
    setMicOn(enabled);
    live.current?.setMicrophoneEnabled(enabled);
  }
  function toggleSound() {
    const enabled = !soundOn;
    setSoundOn(enabled);
    live.current?.setSoundEnabled(enabled);
  }
  function restart() {
    currentRun.current++;
    stopLive();
    sessionRef.current = null;
    setSession(null);
    savedRef.current = false;
    setPhase("incoming");
    setError("");
    setMenu(null);
    setActionNotice("");
    setTranscript([]);
    setTyping("");
    setModelCaption("");
    setMyCaption("");
    setSeconds(0);
    observedRisk.current = false;
  }

  if (phase === "incoming") return (
    <Screen>
      <Header title="AI 전화 대응 훈련" back={false} />
      <section className="screen__body pv-intro">
        
        <div className="pv-intro-icon"><img src="/images/icon-phone.png" alt="" width={88} height={88}/></div>
        <h2>낯선 전화가 걸려왔어요</h2>
        <p>AI 피싱범과 실제처럼 통화해 보세요. 전화를 끊은 뒤에도 안전한 확인 행동을 직접 연습합니다.</p>
        <div className="pv-howto">
          <strong>이번 훈련 진행</strong>
          <span>① AI 피싱범과 실시간으로 통화하기</span>
          <span>② 통화를 끊고 가상 휴대전화로 사후 행동하기</span>
          <span>③ 통화와 그 뒤 행동을 함께 돌아보기</span>
        </div>
        <p className="pv-note">가상의 통화이며 실제 금융 거래나 전화 연결은 이루어지지 않습니다. 마이크 음성은 실시간 대화 처리를 위해 Google에 전송됩니다. 실제 개인정보나 인증번호는 말하지 마세요. 음성·대화 원문은 연습 기록에 저장하지 않습니다.</p>
        {error && <p className="pv-error" role="alert">{error}</p>}
        <button type="button" className="pv-accept" disabled={busy} onClick={() => void acceptCall()}>
          {busy ? "통화 연결 중…" : "전화 받기"} <span aria-hidden="true">☎</span>
        </button>
        <button type="button" className="pv-secondary" onClick={() => router.replace("/home")}>홈으로</button>
      </section>
    </Screen>
  );

  if (phase === "call") return (
    <main className="screen pv-call-screen">
      <header className="pv-call-header pv-live-header">
        <span aria-hidden="true" />
        <span>AI 피싱범 · 모의 통화 중</span>
        <button type="button" onClick={toggleSound} aria-pressed={!soundOn}>
          {soundOn ? "소리 끄기" : "소리 켜기"}
        </button>
      </header>
      <section className="pv-call-stage">
        <div className="pv-call-avatar" aria-hidden="true"><img src="/images/icon-phone.png" alt=""/></div>
        <h1>{session?.caller ?? "알 수 없는 번호"}</h1>
        <span className="pv-call-timer">{fmt(seconds)}</span>
        <div className="pv-call-speech" role="status" aria-live="polite">
          <small>{speaking ? "상대가 말하는 중…" : "실시간 통화"}</small>
          <p>{modelCaption || (speaking ? "상대가 이야기하고 있어요." : "상대방의 말을 듣거나 직접 말씀해 보세요.")}</p>
        </div>
        {myCaption && <p className="pv-live-my-caption">내 말 · {myCaption}</p>}
        <p className="pv-live-status" role="status">{status}</p>
        <details className="pv-transcript pv-transcript--call" open={showTranscript}
          onToggle={e => setShowTranscript(e.currentTarget.open)}>
          <summary>실시간 자막 {showTranscript ? "접기" : "펼치기"}</summary>
          <ol>{transcript.map((line, i) => (
            <li key={i}><strong>{line.actor === "caller" ? "상대" : "나"}</strong><p>{line.text}</p></li>
          ))}</ol>
        </details>
      </section>
      <section className="pv-call-controls">
        {error && <p className="pv-error" role="alert">{error}</p>}
        <div className="pv-live-mic-row">
          <button type="button" className={"pv-mic" + (!micOn ? " pv-live-muted" : "")}
            onClick={toggleMic} disabled={!micAvailable}>
            <span aria-hidden="true">🎙</span>
            {!micAvailable ? "마이크 사용 불가" : micOn ? "마이크 켜짐 · 끄기" : "마이크 꺼짐 · 켜기"}
          </button>
        </div>
        {!micAvailable && <p className="pv-note">마이크를 사용할 수 없어 글로 답변해도 AI 피싱범의 음성으로 응답합니다.</p>}
        <form className="pv-typed-answer" onSubmit={e => { e.preventDefault(); sendLiveText(); }}>
          <input type="text" value={typing} maxLength={160} aria-label="모의 통화에서 말할 내용"
            placeholder="말하기가 어려우면 글로 답변" onChange={e => setTyping(e.target.value)} />
          <button type="submit" disabled={!typing.trim()}>전송</button>
        </form>
        <button type="button" className="pv-hangup pv-live-hangup" disabled={busy}
          onClick={() => void hangUp()}>{busy ? "통화 종료 중…" : "통화 끊기"}</button>
        <p className="pv-note">통화를 끊어도 훈련은 끝나지 않아요. 통화 뒤 행동까지 연습합니다.</p>
      </section>
    </main>
  );

  if (phase === "after_call") {
    const performed = session?.postActions ?? [];
    const available = session?.availableActions ?? [];
    const canChoose = (action: PhonePostAction) => available.includes(action);
    const stopped = performed.includes("no_action") || performed.length >= 6;
    const choose = (action: PhonePostAction, title: string, description: string) => (
      <button type="button" key={action} className="pv-after-option"
        disabled={busy || stopped || performed.includes(action)}
        onClick={() => void recordPostAction(action)}>
        <strong>{title}</strong><small>{description}</small>
        {performed.includes(action) && <span className="pv-after-done" aria-label="이미 수행함">✓</span>}
      </button>
    );
    return (
      <Screen>
        <Header title="통화 후 행동 연습" back={false} />
        <section className="screen__body pv-after-page">
          <div className="pv-after-heading">
            <span className="pv-after-icon" aria-hidden="true">☎</span>
            <h2>{session?.endedBy === "caller" ? "상대가 먼저 전화를 끊었어요." :
              session?.endedBy === "connection" ? "음성 연결이 종료됐어요." : "통화가 종료됐어요."}</h2>
            <p>{session?.endedBy === "caller"
              ? "상대가 통화를 끝내도 확인은 필요해요. 이제 무엇을 하시겠어요?"
              : "이제 실제 휴대전화라면 무엇을 하시겠어요? 직접 기능을 눌러보세요."}</p>
          </div>
          <div className="pv-after-device" aria-label="모의 휴대전화">
            <p className="pv-after-label">내 휴대전화</p>
            <div className="pv-after-tiles">
              <button type="button" onClick={() => setMenu("phone")} disabled={busy || stopped}><span aria-hidden="true">☎</span><strong>전화·연락처</strong></button>
              {canChoose("official_app") && <button type="button" onClick={() => setMenu("apps")} disabled={busy || stopped}><span aria-hidden="true">▦</span><strong>공식 앱</strong></button>}
              {canChoose("follow_request") && <button type="button" onClick={() => setMenu("request")} disabled={busy || stopped}><span aria-hidden="true">⇄</span><strong>상대 요구 처리</strong></button>}
              <button type="button" onClick={() => void recordPostAction("no_action")}
                disabled={busy || performed.length > 0}><span aria-hidden="true">▢</span><strong>별도 행동 하지 않기</strong></button>
            </div>
          </div>
          {actionNotice && <div className="pv-after-outcome" role="status"><strong>모의 행동 결과</strong><p>{actionNotice}</p></div>}
          {performed.length > 0 && (
            <section className="pv-after-history">
              <h3>지금까지 한 행동</h3>
              <ol>{performed.map((a, i) => <li key={i}>{a === "follow_request" ? session?.requestActionLabel ?? POST_ACTION_LABEL[a] : POST_ACTION_LABEL[a]}</li>)}</ol>
            </section>
          )}
          {error && <p className="pv-error" role="alert">{error}</p>}
          <button type="button" className="btn btn--primary pv-after-finish"
            disabled={!performed.length || busy} onClick={() => void finish()}>
            {busy ? "피드백 확인 중…" : "내 행동 피드백 보기"}
          </button>
          <p className="pv-note">실제 앱·전화·계좌 연결은 하지 않습니다. 모든 결과는 가상 상황입니다.</p>
        </section>
        {menu && (
          <div className="pv-action-overlay" role="presentation" onClick={() => setMenu(null)}>
            <div className="pv-action-sheet" role="dialog" aria-modal="true"
              aria-label="모의 휴대전화 메뉴" onClick={e => e.stopPropagation()}>
              <h2>{menu === "phone" ? "누구에게 전화하시겠어요?" :
                menu === "apps" ? "어떤 앱에서 확인하시겠어요?" : "상대 요구를 처리하시겠어요?"}</h2>
              <p>실제 통화나 송금은 일어나지 않습니다.</p>
              {menu === "phone" && (
                <>
                  {canChoose("official_call") && choose("official_call", "공식 대표번호를 직접 찾아 전화",
                    "검색이나 원래 알던 연락처에서 찾기")}
                  {canChoose("saved_family") && choose("saved_family", "원래 저장된 가족 번호로 전화",
                    "이번에 걸려온 번호와 무관하게 확인하기")}
                  {canChoose("caller_number") && choose("caller_number", "방금 상대가 안내한 번호로 전화",
                    "통화 중 알려준 번호를 이용하기")}
                </>
              )}
              {menu === "apps" && choose("official_app", "평소 사용하던 공식 앱에서 조회",
                "문자 링크가 아닌 기존 앱을 직접 열기")}
              {menu === "request" && choose("follow_request", session?.requestActionLabel ?? POST_ACTION_LABEL.follow_request,
                "실제로 실행하지 않고 모의 훈련에서 선택만 기록")}
              <button type="button" className="pv-action-cancel" onClick={() => setMenu(null)}>휴대전화로 돌아가기</button>
            </div>
          </div>
        )}
      </Screen>
    );
  }

  const feedback = session?.feedback;
  if (!feedback) return null;
  return (
    <Screen>
      <Header title="전화 대응 돌아보기" back={false} />
      <section className="screen__body pv-feedback">
        <span className={"pv-feedback-label pv-feedback-label--" + feedback.status}>통화 후 행동까지 분석했어요</span>
        <h2>{feedback.headline}</h2>
        <p className="pv-feedback-main">{feedback.detail}</p>
        <section className="pv-feedback-card">
          <strong>내 행동 기록</strong>
          <ol className="pv-feedback-timeline">
            {feedback.actions.map((item, i) => (
              <li key={i} className={item.safe === true ? "pv-step-safe" : item.safe === false ? "pv-step-risk" : ""}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div><b>{item.label}</b><p>{item.explanation}</p></div>
              </li>
            ))}
          </ol>
        </section>
        <div className="pv-feedback-card">
          <strong>통화에서 기억할 위험 신호</strong>
          <p>{feedback.whatWasRequested}</p>
        </div>
        <div className="pv-feedback-card pv-feedback-card--lesson">
          <strong>다음에 기억할 행동</strong>
          <p>{feedback.shouldRemember}</p>
          <small>{feedback.lesson}</small>
        </div>
        {feedback.coverage === "before_request" && <p className="pv-note">위험한 요구가 실제로 들렸는지는 확인되지 않아 통화 내용 자체는 채점하지 않았어요.</p>}
        <details className="pv-transcript">
          <summary>통화 자막 다시 보기 (이 기기에서만 표시)</summary>
          <ol>{transcript.map((line, i) => (
            <li key={i}><strong>{line.actor === "caller" ? "상대" : "나"}</strong><p>{line.text}</p></li>
          ))}</ol>
        </details>
        <p className="pv-note">공개 범행 수법을 바탕으로 재구성한 가상 전화입니다. 실제 설정은 {feedback.identity === "fraud" ? "사칭 시도" : "일상 연락"}였습니다.</p>
        <div className="pv-final-actions">
          <button className="btn btn--gray" type="button" onClick={() => router.replace("/home")}>홈으로</button>
          <button className="btn btn--primary" type="button" onClick={restart}>다른 전화 연습</button>
        </div>
      </section>
    </Screen>
  );
}
