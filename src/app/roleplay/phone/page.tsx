"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header, Screen } from "@/components/ui";
import { saveRecord } from "@/lib/records";
import type { PhoneDecision, PhoneFeedback, PhoneLine } from "@/lib/phoneTraining";

type Phase = "incoming" | "call" | "feedback";
type PhoneReply = {
  token: string;
  caller?: string;
  caseId?: string;
  canCallFamily?: boolean;
  maxTurns?: number;
  messages: PhoneLine[];
  turns: number;
  closed: boolean;
  riskPresented: boolean;
  feedback?: PhoneFeedback;
};
type RecognitionResult = { results: { [index: number]: { [index: number]: { transcript: string } } } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((result: RecognitionResult) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => Recognition;
const RECENT_KEY = "mikki:phone-recent-v1";
const formatDuration = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

async function phoneRequest(body: object): Promise<PhoneReply> {
  const r = await fetch("/api/phone-training", {
    method: "POST", headers: { "Content-Type": "application/json" },
    cache: "no-store", body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "연결에 실패했어요.");
  return data as PhoneReply;
}
function recentCases(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string").slice(-3) : [];
  } catch { return []; }
}
function rememberCase(caseId?: string) {
  if (!caseId) return;
  try { sessionStorage.setItem(RECENT_KEY, JSON.stringify([...recentCases().filter(c => c !== caseId), caseId].slice(-3))); }
  catch { /* 저장소가 차단되어도 훈련은 진행 */ }
}

export default function PhoneTraining() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("incoming");
  const [session, setSession] = useState<PhoneReply | null>(null);
  const sessionRef = useRef<PhoneReply | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [draft, setDraft] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const startTime = useRef(0);
  const recognitionRef = useRef<Recognition | null>(null);

  useEffect(() => {
    const w = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    setSpeechSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    if (phase !== "call") return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== "feedback" || !session?.feedback || hasSaved) return;
    setHasSaved(true);
    const feedback = session.feedback;
    void saveRecord({ kind: "training", title: "전화 상황 대응 훈련",
      safe: feedback.status === "good", detail: { mode: "phone", coverage: feedback.coverage } });
  }, [phase, session, hasSaved]);

  function stopAudio() {
    try { recognitionRef.current?.stop(); } catch { /* 이미 정지한 마이크 */ }
    recognitionRef.current = null;
    setListening(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }
  function speak(text: string) {
    if (!soundOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const voice = new SpeechSynthesisUtterance(text);
    voice.lang = "ko-KR";
    voice.rate = 0.97;
    voice.pitch = 0.94;
    const koreanVoice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith("ko"));
    if (koreanVoice) voice.voice = koreanVoice;
    voice.onstart = () => setSpeaking(true);
    voice.onend = () => setSpeaking(false);
    voice.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(voice);
  }
  function acceptReply(r: PhoneReply) {
    const updated: PhoneReply = { ...sessionRef.current, ...r };
    sessionRef.current = updated;
    setSession(updated);
    setError("");
    if (updated.closed && updated.feedback) {
      stopAudio();
      setActionsOpen(false);
      setPhase("feedback");
    }
  }
  async function acceptCall() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    stopAudio();
    try {
      const r = await phoneRequest({ action: "start", recentCases: recentCases() });
      rememberCase(r.caseId);
      acceptReply(r);
      startTime.current = Date.now();
      setElapsed(0);
      setDraft("");
      setHasSaved(false);
      setPhase("call");
      if (r.messages[0]?.text) speak(r.messages[0].text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "전화를 연결하지 못했어요.");
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function send(text: string) {
    const current = sessionRef.current;
    const clean = text.trim();
    if (!current || current.closed || !clean || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setListening(false);
    setError("");
    stopAudio();
    try {
      const r = await phoneRequest({ action: "turn", token: current.token, text: clean });
      acceptReply(r);
      setDraft("");
      if (!r.closed) {
        const answer = r.messages.at(-1);
        if (answer?.actor === "caller") speak(answer.text);
      }
    } catch (e) {
      setDraft(clean);
      setError(e instanceof Error ? e.message : "말씀을 전달하지 못했어요.");
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function decide(choice: PhoneDecision) {
    const current = sessionRef.current;
    if (!current || current.closed || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    stopAudio();
    try {
      const r = await phoneRequest({ action: "decide", token: current.token, decision: choice });
      acceptReply(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "선택을 기록하지 못했어요.");
    } finally { busyRef.current = false; setBusy(false); }
  }
  function listen() {
    if (busy || speaking || listening || !session || session.closed) return;
    const w = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { setError("이 브라우저에서는 음성 인식을 지원하지 않아요. 아래 입력칸에 직접 적어주세요."); return; }
    stopAudio();
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => {
      const text = event.results[0]?.[0]?.transcript?.trim();
      if (text) { setDraft(text); void send(text); }
    };
    recognition.onerror = e => {
      setListening(false);
      if (e.error !== "no-speech" && e.error !== "aborted") setError("마이크 음성을 인식하지 못했어요. 다시 말하거나 직접 입력해 주세요.");
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
      setError("");
    } catch {
      setListening(false);
      setError("마이크를 열지 못했어요. 권한을 확인하거나 직접 입력해 주세요.");
    }
  }
  function restart() {
    stopAudio();
    sessionRef.current = null;
    setSession(null);
    setPhase("incoming");
    setHasSaved(false);
    setActionsOpen(false);
    setElapsed(0);
    setDraft("");
    setError("");
  }

  if (phase === "incoming") return (
    <Screen>
      <Header title="전화 대응 훈련" back="/practice" />
      <section className="screen__body pv-intro">
        <span className="pv-topline">VOICE PRACTICE</span>
        <div className="pv-intro-icon"><img src="/images/icon-phone.png" alt="" width={88} height={88} /></div>
        <h2>모르는 전화가 걸려왔어요.</h2>
        <p>누구의 전화인지 미리 알 수 없어요. 실제처럼 통화하면서, 요구가 나왔을 때 직접 행동을 선택해 보세요.</p>
        <div className="pv-howto">
          <strong>이번 연습의 핵심</strong>
          <span>① 전화를 받고 상대의 이야기를 듣기</span>
          <span>② 목소리로 답하기 또는 글로 답하기</span>
          <span>③ 통화를 끝내거나 별도 연락처로 확인하기</span>
        </div>
        <p className="pv-note">가상의 전화입니다. 실제 전화 연결·돈 이동·개인정보 전송은 일어나지 않아요. 실제 인증번호나 계좌번호는 말하지 마세요.</p>
        <p className="pv-note">음성 인식은 사용하는 브라우저의 서비스에서 처리할 수 있고, 인식된 말은 AI 대화 생성에 이용됩니다. 통화 녹음 파일과 대화 원문은 연습 기록에 저장하지 않아요.</p>
        {error && <p className="pv-error" role="alert">{error}</p>}
        <button type="button" className="pv-accept" disabled={busy} onClick={() => void acceptCall()}>
          {busy ? "전화 연결 중…" : "전화 받기"} <span aria-hidden="true">☎</span>
        </button>
        <button type="button" className="pv-secondary" onClick={() => router.replace("/practice")}>나중에 연습하기</button>
      </section>
    </Screen>
  );

  if (phase === "feedback" && session?.feedback) {
    const f = session.feedback;
    return (
      <Screen>
        <Header title="전화 대응 돌아보기" back="/practice" />
        <section className="screen__body pv-feedback">
          <span className={"pv-feedback-label pv-feedback-label--" + f.status}>나의 실제 행동 평가</span>
          <h2>{f.headline}</h2>
          <p className="pv-feedback-main">{f.detail}</p>
          <div className="pv-feedback-card">
            <strong>이번에 내가 한 행동</strong>
            <p>{f.action}</p>
          </div>
          <div className="pv-feedback-card">
            <strong>통화 속 핵심 요청</strong>
            <p>{f.whatWasRequested}</p>
          </div>
          <div className="pv-feedback-card pv-feedback-card--lesson">
            <strong>다음 전화에서 기억하세요</strong>
            <p>{f.shouldRemember}</p>
            <small>{f.lesson}</small>
          </div>
          {f.coverage === "before_request" && <p className="pv-note">요구가 나오기 전에 종료했으므로 위험 요구 대응은 아직 평가하지 않았어요.</p>}
          <details className="pv-transcript">
            <summary>통화 내용 다시 보기</summary>
            <ol>{session.messages.map((line, i) => <li key={i}><strong>{line.actor === "caller" ? "상대" : "나"}</strong><p>{line.text}</p></li>)}</ol>
          </details>
          <p className="pv-note">공개된 범죄 수법을 교육용으로 재구성한 가상 상황입니다. 이번 전화의 설정은 {f.identity === "fraud" ? "사칭 시도" : "정상적인 연락"}이었습니다.</p>
          <div className="pv-final-actions">
            <button type="button" className="btn btn--gray" onClick={() => router.replace("/home")}>홈으로</button>
            <button type="button" className="btn btn--primary" onClick={restart}>다른 전화 연습하기</button>
          </div>
        </section>
      </Screen>
    );
  }

  const last = session?.messages.at(-1);
  const limitReached = !!session && session.turns >= (session.maxTurns ?? 4);
  const canSpeak = !!session && !busy && !listening && !speaking && !session.closed && !limitReached;
  return (
    <main className="screen pv-call-screen">
      <header className="pv-call-header">
        <button type="button" onClick={() => void decide("hangup")} disabled={busy} aria-label="통화 종료">×</button>
        <span>모의 통화 중</span>
        <button type="button" onClick={() => {
          if (soundOn) stopAudio();
          setSoundOn(!soundOn);
        }} aria-pressed={!soundOn}>{soundOn ? "소리 끄기" : "소리 켜기"}</button>
      </header>
      <section className="pv-call-stage">
        <div className="pv-call-avatar" aria-hidden="true"><img src="/images/icon-phone.png" alt="" /></div>
        <h1>{session?.caller ?? "전화 연결 중"}</h1>
        <span className="pv-call-timer">{formatDuration(elapsed)}</span>
        <div className="pv-call-speech" role="status" aria-live="polite">
          <small>{speaking ? "상대가 말하고 있어요" : busy ? "답변을 생성하고 있어요" : listening ? "내 말을 듣고 있어요" : "상대의 말"}</small>
          <p>{last?.actor === "caller" ? last.text : "잠깐만요, 듣고 있어요."}</p>
        </div>
        <details className="pv-transcript pv-transcript--call" open={showTranscript} onToggle={e => setShowTranscript(e.currentTarget.open)}>
          <summary>통화 자막 {showTranscript ? "접기" : "펴기"}</summary>
          <ol>{session?.messages.map((line, i) => (
            <li key={i}><strong>{line.actor === "caller" ? "상대" : "나"}</strong><p>{line.text}</p></li>
          ))}</ol>
        </details>
      </section>
      <section className="pv-call-controls">
        {error && <p className="pv-error" role="alert">{error}</p>}
        <button type="button" className={"pv-mic" + (listening ? " pv-mic--active" : "")}
          disabled={!canSpeak} onClick={listen}>
          <span aria-hidden="true">🎙</span>{listening ? "듣는 중…" : speaking ? "상대방 통화 중" : "눌러서 말하기"}
        </button>
        {limitReached && <p className="pv-note">대화를 충분히 나눴어요. 이제 끊거나, 직접 확인할 방법을 선택해 주세요.</p>}
        {!speechSupported && <p className="pv-note">이 기기에서는 음성 입력을 지원하지 않아 글로 답할 수 있어요.</p>}
        <form className="pv-typed-answer" onSubmit={e => { e.preventDefault(); void send(draft); }}>
          <input type="text" value={draft} maxLength={240}
            aria-label="통화에서 말할 내용" placeholder="또는 직접 답장하기"
            disabled={busy || listening || limitReached} onChange={e => setDraft(e.target.value)}/>
          <button type="submit" disabled={busy || listening || limitReached || !draft.trim()}>말하기</button>
        </form>
        <div className="pv-call-actions">
          <button type="button" className="pv-hangup" disabled={busy} onClick={() => void decide("hangup")}>통화 끊기</button>
          <button type="button" className="pv-verify" disabled={busy} onClick={() => setActionsOpen(true)}>다른 방법으로 확인</button>
        </div>
        <p className="pv-note">모의 통화 · 중요한 선택은 버튼으로 기록돼요.</p>
        {session?.riskPresented && <button type="button" className="pv-follow" disabled={busy}
          onClick={() => void decide("comply")}>상대 요구대로 행동해 보기 (가상)</button>}
      </section>
      {actionsOpen && (
        <div className="pv-action-overlay" role="presentation" onClick={() => setActionsOpen(false)}>
          <div className="pv-action-sheet" role="dialog" aria-modal="true" aria-label="통화 밖에서 확인하기" onClick={e => e.stopPropagation()}>
            <h2>어디에 확인하시겠어요?</h2>
            <p>통화 상대가 알려준 정보와, 내가 원래 알고 있던 연락처는 달라요.</p>
            <button type="button" disabled={busy} onClick={() => void decide("official")}>
              <strong>직접 찾은 공식 연락처</strong><small>공식 앱·기관 대표번호에서 확인하기</small>
            </button>
            {session?.canCallFamily && <button type="button" disabled={busy} onClick={() => void decide("family")}>
              <strong>기존에 저장한 가족 번호</strong><small>평소 알고 있던 번호로 다시 확인하기</small>
            </button>}
            <button type="button" disabled={busy} onClick={() => void decide("sender")}>
              <strong>통화 상대가 알려준 번호</strong><small>방금 상대가 안내한 연락처로 재통화하기</small>
            </button>
            <button type="button" className="pv-action-cancel" onClick={() => setActionsOpen(false)}>통화로 돌아가기</button>
          </div>
        </div>
      )}
    </main>
  );
}
