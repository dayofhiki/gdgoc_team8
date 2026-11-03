"use client";
/**
 * 임시 AI 테스트 페이지 (/lab). Figma 디자인과 무관하며, Supabase 서버·DB를 쓰지 않습니다.
 * 로컬 Next.js API(/api/lab)가 Edge Function과 같은 AI 코드로 Gemini를 호출합니다.
 * 화면 흐름이 정해지면 삭제할 예정.
 */
import { useEffect, useState, type CSSProperties } from "react";
import type { Difficulty, Message, Mission, Outcome, Stage } from "@shared/types";

type View = "setup" | "chat" | "result";
type Hist = Pick<Message, "role" | "text" | "stage">;
type Turn = { reply: string; stage: Stage; turn_count: number; ended: boolean; used_fallback: boolean; ms?: number };
type LabResult = { outcome: Outcome; red_flags: string[]; feedback: string[] };

const outcomeText: Record<Outcome, string> = { safe: "안전하게 대응했어요", unsafe: "다시 연습이 필요해요", incomplete: "끝까지 판단하지 못했어요" };
const stageText: Record<Stage, string> = { approach: "접근", trust: "신뢰 쌓기", pressure: "압박", demand: "요구" };

const S: Record<string, CSSProperties> = {
  wrap: { maxWidth: 402, margin: "0 auto", padding: 20, fontSize: 16, lineHeight: 1.5, minHeight: "100vh", background: "#fff" },
  badge: { display: "inline-block", fontSize: 12, padding: "2px 8px", borderRadius: 8, background: "#fde68a", marginBottom: 12 },
  btn: { display: "block", width: "100%", padding: 14, margin: "8px 0", borderRadius: 12, border: 0, background: "#2563eb", color: "#fff", fontSize: 16, fontWeight: 600 },
  btn2: { display: "block", width: "100%", padding: 14, margin: "8px 0", borderRadius: 12, border: "1px solid #ccc", background: "#fff", fontSize: 16 },
  input: { width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ccc", fontSize: 16, boxSizing: "border-box" },
  card: { padding: 14, borderRadius: 12, background: "#f3f4f6", margin: "10px 0" },
  them: { padding: "10px 12px", borderRadius: 12, background: "#f3f4f6", margin: "6px 48px 6px 0", whiteSpace: "pre-wrap" },
  me: { padding: "10px 12px", borderRadius: 12, background: "#dbeafe", margin: "6px 0 6px 48px", whiteSpace: "pre-wrap" },
  small: { fontSize: 12, color: "#6b7280" },
};

async function api<T>(body: object): Promise<T> {
  const res = await fetch("/api/lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.code ?? `HTTP ${res.status}`);
  return data as T;
}

export default function Lab() {
  const [view, setView] = useState<View>("setup");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [gemini, setGemini] = useState<boolean | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [missionId, setMissionId] = useState("");
  const [stage, setStage] = useState<Stage>("approach");
  const [turnCount, setTurnCount] = useState(0);
  const [history, setHistory] = useState<Hist[]>([]);
  const [meta, setMeta] = useState<Record<number, string>>({}); // 말풍선별 응답 정보 (ms·fallback)
  const [ended, setEnded] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<LabResult | null>(null);

  useEffect(() => {
    api<{ missions: Mission[]; gemini: boolean }>({ action: "missions" })
      .then((r) => { setMissions(r.missions); setGemini(r.gemini); })
      .catch((e) => setNotice(`미션을 불러오지 못했어요: ${e.message}`));
  }, []);

  async function start(id: string) {
    setBusy(true);
    setNotice("");
    try {
      const r = await api<Turn>({ action: "turn", mission_id: id, difficulty, stage: "approach", turn_count: 0, history: [] });
      setMissionId(id);
      setStage("approach");
      setTurnCount(0);
      setEnded(false);
      setMeta({});
      setHistory([{ role: "scammer", text: r.reply, stage: "approach" }]);
      setView("chat");
    } catch (e) {
      setNotice(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const t = text.trim();
    if (!t || busy || ended) return;
    setBusy(true);
    setNotice("");
    try {
      const r = await api<Turn>({ action: "turn", mission_id: missionId, difficulty, stage, turn_count: turnCount, history, text: t });
      const next: Hist[] = [...history, { role: "senior", text: t, stage }, { role: "scammer", text: r.reply, stage: r.stage }];
      setHistory(next);
      setMeta((m) => ({ ...m, [next.length - 1]: `${r.used_fallback ? "기본 대사(fallback)" : "Gemini"} · ${((r.ms ?? 0) / 1000).toFixed(1)}초` }));
      setStage(r.stage);
      setTurnCount(r.turn_count);
      setText("");
      if (r.ended) setEnded(true);
    } catch (e) {
      const code = (e as Error).message;
      setNotice(code === "PII_BLOCKED" ? "전화번호·계좌번호 같은 실제 정보는 입력하지 마세요. (PII_BLOCKED)" : `오류: ${code}`);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      const r = await api<{ result: LabResult }>({ action: "end", history });
      setResult(r.result);
      setView("result");
    } catch (e) {
      setNotice(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={S.wrap}>
      <span style={S.badge}>로컬 AI 테스트 · 서버/DB 사용 안 함</span>
      <p style={S.small}>
        AI: {gemini === null ? "확인 중…" : gemini ? "Gemini 연결됨 (.env.local의 GEMINI_API_KEY)" : "키 없음 → mock 대사"}
      </p>

      {view === "setup" && (
        <>
          <h2>어떤 상황을 연습할까요?</h2>
          <label>난이도
            <select style={S.input} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="easy">쉬움</option><option value="normal">보통</option><option value="hard">어려움</option>
            </select>
          </label>
          {missions.map((m) => (
            <button key={m.id} style={S.btn2} disabled={busy} onClick={() => start(m.id)}>{m.title}</button>
          ))}
          {notice && <p role="alert" style={{ color: "#dc2626" }}>{notice}</p>}
        </>
      )}

      {view === "chat" && (
        <>
          <h2>대화해 보세요</h2>
          <p style={S.small}>턴 {turnCount}/8 · 현재 단계: {stageText[stage]} · 종료는 AI 판정 + 서버 규칙으로 결정</p>
          {history.map((m, i) => (
            <div key={i} style={m.role === "senior" ? S.me : S.them}>
              {m.text}
              {m.role === "scammer" && <div style={S.small}>단계: {stageText[m.stage]}{meta[i] ? ` · ${meta[i]}` : ""}</div>}
            </div>
          ))}
          {ended ? (
            <>
              <div style={{ ...S.card, textAlign: "center" }}>대화가 끝났어요</div>
              <button style={S.btn} disabled={busy} onClick={finish}>결과 보기</button>
            </>
          ) : (
            <>
              <input style={{ ...S.input, marginTop: 12 }} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void send(); }}
                placeholder="답장을 입력하세요" aria-label="답장" />
              {notice && <p role="alert" style={{ color: "#dc2626" }}>{notice}</p>}
              <button style={S.btn} disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? "답장 기다리는 중…" : "보내기"}</button>
              <button style={S.btn2} disabled={busy} onClick={finish}>훈련 끝내기</button>
            </>
          )}
        </>
      )}

      {view === "result" && result && (
        <>
          <h2>결과</h2>
          <div style={S.card}><b>{outcomeText[result.outcome]}</b> ({result.outcome})
            {result.feedback.map((f) => <p key={f}>{f}</p>)}
          </div>
          <div style={S.card}><b>이번 대화의 위험 신호</b>
            {result.red_flags.map((f) => <p key={f}>• {f}</p>)}
          </div>
          <p style={S.small}>※ 결과 판정은 아직 키워드 방식(서버 session-end와 동일)이에요.</p>
          <button style={S.btn} onClick={() => setView("setup")}>다른 상황 연습하기</button>
        </>
      )}
    </main>
  );
}
