"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomCTA, Header, Screen } from "@/components/ui";
import { callFn, ensureAnon } from "@/lib/supabase";
import type { Stage } from "@shared/types";

type Turn = { reply: string; stage: Stage; ended: boolean; used_fallback: boolean; ai_configured: boolean };
type Message = { role: "senior" | "scammer"; text: string; stage: Stage };

export default function ChatPractice() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState<Stage>("approach");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(true);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState(false);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        await ensureAnon();
        const r = await callFn<Turn>("practice-chat", { mission_id: "family" });
        setMessages([{ role: "scammer", text: r.reply, stage: r.stage }]);
        if (!r.ai_configured) setError("AI 서버 설정이 아직 완료되지 않았습니다. 관리자에게 문의해주세요.");
      } catch {
        setError("연습을 시작하지 못했습니다. Supabase 연결과 practice-chat 함수 배포를 확인해주세요.");
      } finally { setBusy(false); }
    })();
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy || ended || messages.length >= 24) return;
    const previous = messages;
    setInput("");
    setError("");
    setBusy(true);
    setMessages([...previous, { role: "senior", text, stage }]);
    try {
      const r = await callFn<Turn>("practice-chat", {
        mission_id: "family", difficulty: "normal", stage, history: previous, text,
      });
      setMessages((old) => [...old, { role: "scammer", text: r.reply, stage: r.stage }]);
      setStage(r.stage);
      setEnded(r.ended);
      setFallback(r.used_fallback || !r.ai_configured);
      if (r.used_fallback || !r.ai_configured) setError("Gemini 응답 대신 예비 대사가 사용됐습니다. 관리자에게 AI 설정을 확인해주세요.");
    } catch (e) {
      setMessages(previous);
      setInput(text);
      setError(e instanceof Error && e.message === "PII_BLOCKED" ? "개인정보는 입력하지 마세요." : "메시지 전송에 실패했습니다. 다시 시도해주세요.");
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <Header title="AI 채팅 연습" onClose={() => router.push("/home")} />
      <section className="screen__body" style={{ minHeight: 0 }}>
        <div className="stack" style={{ marginTop: 12, gap: 8 }}>
          <span className="chip">가족·지인 사칭 · 실시간 대화</span>
          <h2 className="title">수상한 문자가 도착했어요</h2>
          <p className="desc">직접 답장하면서 연습해 보세요. 실제 개인정보는 입력하지 마세요.</p>
        </div>
        <div className="chat-card" style={{ marginTop: 20, flex: 1, minHeight: 260, overflowY: "auto", marginBottom: 12 }} aria-live="polite">
          {messages.map((m, i) => (
            <div className={m.role === "senior" ? "msg msg--me" : "msg"} key={i}>
              {m.role === "senior" ? <p className="bubble bubble--me" style={{ whiteSpace: "pre-wrap" }}>{m.text}</p> : <div className="msg__col"><p className="bubble" style={{ whiteSpace: "pre-wrap" }}>{m.text}</p></div>}
            </div>
          ))}
          {busy && <p className="desc">응답을 기다리고 있어요…</p>}
          <div ref={bottom} />
        </div>
        {error && <p role="alert" style={{ color: "#b91c1c", marginTop: 12 }}>{error}</p>}
        {ended && (
          <div className="card card--blue" style={{ marginTop: 16 }}>
            <p className="card__title">연습이 종료됐어요</p>
            <p className="card__text--blue">사기범의 요구에 응하지 말고, 원래 알고 있던 번호로 직접 확인하세요.</p>
            {fallback && <p className="desc">일부 대사는 예비 시나리오로 생성됐습니다.</p>}
          </div>
        )}
      </section>
      <BottomCTA>
        {!ended && messages.length < 24 ? (
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} style={{ display: "flex", gap: 8, width: "100%", alignItems: "center" }}>
            <input aria-label="답장 입력" value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="답장을 입력하세요" disabled={busy || messages.length === 0} style={{ flex: "1 1 0%", width: 0, minWidth: 0, height: 56, background: "#fff", padding: 12, border: "1px solid #ccc", borderRadius: 12, fontSize: 16 }} />
            <button type="submit" className="btn btn--primary" style={{ flex: "0 0 88px", width: 88, borderRadius: 14 }} disabled={busy || !input.trim()}>보내기</button>
          </form>
        ) : (
          <button className="btn btn--primary" onClick={() => window.location.reload()}>다시 연습하기</button>
        )}
      </BottomCTA>
    </Screen>
  );
}
