"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PersonIcon } from "@/components/Icons";
import { BottomCTA, Dialog, Header, Progress, Screen } from "@/components/ui";

type Message = { actor: "them" | "me" | "system"; text: string };
type Choice = "verify" | "verify_sender" | "verify_chat" | "comply" | "share" | "stop";
type Guess = "legitimate" | "fraud" | "uncertain";
type Phase = "loading" | "chat" | "judge" | "result";
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
  verificationEvidence: string;
  feedback: string[];
  nextStep: string;
  note: string;
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

const ACT_LABELS: Record<Choice, string> = {
  verify: "기존 번호·공식 채널로 확인",
  verify_sender: "상대가 알려준 경로로 확인",
  verify_chat: "현재 상대에게 다시 묻기",
  comply: "상대의 요청에 응하기",
  share: "개인정보 제공하기",
  stop: "대화 중단하기",
};

export default function RealTraining() {
  const router = useRouter();
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [input, setInput] = useState("");
  const [confirm, setConfirm] = useState<Choice | null>(null);
  const [verifySheet, setVerifySheet] = useState(false);
  const [guess, setGuess] = useState<Guess>("uncertain");
  const [result, setResult] = useState<Result | null>(null);

  async function start() {
    setPhase("loading");
    setError("");
    setInput("");
    setSession(null);
    setGuess("uncertain");
    setResult(null);
    setBusy(true);
    try {
      const initial = await request({ action: "start" });
      setSession(initial);
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
    if (phase === "chat") bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [phase, session?.messages.length]);

  async function send() {
    const text = input.trim();
    if (!session || !text || busy || session.closed || session.turns >= session.maxTurns) return;
    setBusy(true);
    setError("");
    try {
      const next = await request({ action: "message", token: session.token, text });
      setSession(next);
      setInput("");
      if (next.closed) setPhase("judge");
    } catch (err) {
      setError(err instanceof Error ? err.message : "대화에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function perform(choice: Choice) {
    if (!session || busy) return;
    setConfirm(null);
    setVerifySheet(false);
    setBusy(true);
    setError("");
    try {
      const next = await request({ action: "choice", token: session.token, choice });
      setSession(next);
      if (next.closed || next.turns >= next.maxTurns) setPhase("judge");
    } catch (err) {
      setError(err instanceof Error ? err.message : "행동을 기록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
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

  return (
    <Screen>
      <Header title="실전 대응 훈련" back={() => router.push("/roleplay/mode")} onClose={() => router.push("/home")} />
      <Progress value={Math.max(1, session?.turns ?? 0)} total={session?.maxTurns ?? 8} dark />
      <section className="screen__body" style={{ paddingBottom: 310 }}>
        <div className="stack" style={{ marginTop: 10, gap: 6 }}>
          <span className="chip">{session?.title ?? "실전 대화"}</span>
          <h2 className="title" style={{ fontSize: 21 }}>이 연락, 어떻게 대응하시겠어요?</h2>
          <p className="desc" style={{ fontSize: 14 }}>실제 연락일 수도, 사칭일 수도 있어요. 답장하거나 아래의 가상 행동을 선택해 보세요.</p>
        </div>
        <div className="chat-card" style={{ marginTop: 18, marginBottom: 12 }} aria-live="polite">
          {(session?.messages ?? []).map((m, i) =>
            m.actor === "system" ? (
              <div className="card card--blue" key={i} style={{ padding: 14 }}>
                <p className="card__title" style={{ fontSize: 15 }}>확인·행동 결과</p>
                <p className="card__text">{m.text}</p>
              </div>
            ) : (
              <div className={m.actor === "me" ? "msg msg--me" : "msg"} key={i}>
                {m.actor === "them" && <span className="msg__avatar"><PersonIcon /></span>}
                {m.actor === "me"
                  ? <p className="bubble bubble--me" style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
                  : <div className="msg__col"><p className="bubble" style={{ whiteSpace: "pre-wrap" }}>{m.text}</p></div>}
              </div>
            ),
          )}
          {busy && <p className="desc" role="status">응답을 기다리고 있어요…</p>}
          <div ref={bottom} />
        </div>
        {error && <p role="alert" style={{ color: "var(--red)", fontSize: 14 }}>{error}</p>}
        <p className="desc" style={{ fontSize: 12, marginTop: 10 }}>
          실제 전화·송금·개인정보 전송은 발생하지 않습니다. 실제 개인정보는 입력하지 마세요.
        </p>
      </section>
      <BottomCTA>
        <div style={{ width: "100%", borderRadius: 18, padding: 10, background: "#fff", boxShadow: "0 -4px 20px #00000010", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            <button className="btn btn--secondary" style={{ height: 48, fontSize: 15 }} disabled={busy || session?.verified} onClick={() => setVerifySheet(true)}>
              {session?.verified ? "독립 확인 완료" : "어떻게 확인할까요?"}
            </button>
            <button className="btn btn--gray" style={{ height: 48, fontSize: 15 }} disabled={busy} onClick={() => void perform("stop")}>대화 중단</button>
            <button className="btn btn--gray" style={{ height: 48, fontSize: 15 }} disabled={busy} onClick={() => setConfirm("comply")}>요청 수락 (가상)</button>
            <button className="btn btn--gray" style={{ height: 48, fontSize: 15 }} disabled={busy} onClick={() => setConfirm("share")}>정보 제공 (가상)</button>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void send(); }} style={{ display: "flex", gap: 8 }}>
            <input type="text" aria-label="상대에게 답장하기" value={input} maxLength={300}
              onChange={(event) => setInput(event.target.value)} placeholder="직접 답장해 보세요"
              disabled={busy || session?.closed || (session?.turns ?? 0) >= (session?.maxTurns ?? 8)}
              style={{ flex: 1, width: 0, minWidth: 0, padding: "10px 12px", border: "1px solid var(--g300)", borderRadius: 12, fontSize: 16 }} />
            <button type="submit" className="btn btn--primary" style={{ width: 76, height: 47, fontSize: 15 }} disabled={busy || !input.trim()}>보내기</button>
          </form>
          <button className="btn btn--muted" style={{ height: 38, fontSize: 14 }} disabled={busy} onClick={() => setPhase("judge")}>여기서 훈련 마치고 판단하기</button>
        </div>
      </BottomCTA>
      {verifySheet && (
        <Dialog onClose={() => setVerifySheet(false)}>
          <div className="stack" style={{ gap: 8 }}>
            <h2 className="title" style={{ fontSize: 20 }}>어떻게 신원을 확인하시겠어요?</h2>
            <p className="desc" style={{ fontSize: 14 }}>확인 방법을 직접 골라 보세요. 각각 다른 결과가 나옵니다.</p>
          </div>
          <button className="btn btn--primary" disabled={busy} onClick={() => void perform("verify")}>기존 번호·공식 앱으로 확인</button>
          <button className="btn btn--gray" disabled={busy} onClick={() => void perform("verify_sender")}>상대가 알려준 번호·링크로 확인</button>
          <button className="btn btn--gray" disabled={busy} onClick={() => void perform("verify_chat")}>이 채팅에서 본인인지 다시 묻기</button>
          <button className="btn btn--secondary" onClick={() => setVerifySheet(false)}>대화로 돌아가기</button>
        </Dialog>
      )}
      {confirm && (
        <Dialog onClose={() => setConfirm(null)}>
          <div className="stack" style={{ gap: 12 }}>
            <h2 className="title" style={{ fontSize: 20 }}>{ACT_LABELS[confirm]}</h2>
            <p className="desc">훈련 속에서 이 행동을 선택한 것으로 기록합니다. 실제 송금이나 개인정보 전송은 이루어지지 않습니다. 계속할까요?</p>
          </div>
          <button className="btn btn--primary" disabled={busy} onClick={() => void perform(confirm)}>이 행동 선택하기</button>
          <button className="btn btn--gray" onClick={() => setConfirm(null)}>다시 생각하기</button>
        </Dialog>
      )}
    </Screen>
  );
}
