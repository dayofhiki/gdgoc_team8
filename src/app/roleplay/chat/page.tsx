"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomCTA, BottomSheet, Header, Progress, Screen } from "@/components/ui";
import { PersonIcon } from "@/components/Icons";
import { callFn, ensureAnon } from "@/lib/supabase";
import {
  addPending, applyOpening, applyTurn, buildReport, clearReport, endLocally, freshPractice, rollback, saveReport, toHistory,
  type PracticeState,
} from "@/lib/practiceSession";
import { blobToBase64, MAX_RECORD_MS, useRecorder, useSpeech, type RecordError, type Recording } from "@/lib/voice";
import type { EndReason, PracticeReportResponse, PracticeTurnResponse, TranscribeResponse } from "@shared/types";

const MISSION = { id: "family", title: "가족·지인 사칭" };
const STAGES = ["approach", "trust", "pressure", "demand"];

const END_TEXT: Record<EndReason, string> = {
  refused: "요청을 거절하셨어요.",
  verify_intent: "직접 확인하겠다고 말씀하셨어요.",
  verified_claimed: "가족에게 확인했다고 말씀하셨어요.",
  complied: "요청에 응하겠다고 말씀하셨어요.",
  claimed_action: "행동했다고 말씀하셨지만, 화면에서 기록된 행동은 없어요.",
  mock_action: "모의 링크를 열었어요. 실제로는 아무 일도 일어나지 않았어요.",
  scammer_left: "상대가 대화를 끝냈어요.",
  user_stopped: "연습을 중단했어요.",
  inconclusive: "대화가 길어져 여기서 마칠게요.",
};

const RECORD_ERROR: Record<RecordError, string> = {
  unsupported: "이 브라우저에서는 녹음을 쓸 수 없어요. 글자로 입력해 주세요.",
  denied: "마이크 권한이 거부됐어요. 브라우저 설정에서 허용하거나 글자로 입력해 주세요.",
  "no-mic": "마이크를 찾을 수 없어요. 글자로 입력해 주세요.",
  failed: "녹음을 시작하지 못했어요. 다시 시도하거나 글자로 입력해 주세요.",
  empty: "녹음된 소리가 없어요. 조금 더 길게 말씀해 주세요.",
};

const TRANSCRIBE_ERROR: Record<string, string> = {
  TRANSCRIBE_EMPTY: "말소리를 알아듣지 못했어요. 다시 말씀하거나 글자로 입력해 주세요.",
  AI_NOT_CONFIGURED: "음성 인식이 아직 설정되지 않았어요. 글자로 입력해 주세요.",
  AUDIO_INVALID: "녹음 형식을 처리하지 못했어요. 글자로 입력해 주세요.",
};

const sec = (ms: number) => `0:${String(Math.floor(ms / 1000)).padStart(2, "0")}`;

export default function ChatPractice() {
  const router = useRouter();
  const [s, setS] = useState<PracticeState>(() => freshPractice(0));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [heard, setHeard] = useState(false); // 입력칸 내용이 음성 인식 결과인지
  const [ttsOn, setTtsOn] = useState(false);
  const run = useRef(0);
  const state = useRef(s);
  state.current = s;
  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const recorder = useRecorder((out) => void onRecorded(out));
  const speech = useSpeech();

  const lastScammer = [...s.messages].reverse().find((m) => m.role === "scammer");
  const userTurns = s.messages.filter((m) => m.role === "senior").length;

  /** 종료 후: 리포트를 만들어 임시 저장. 서버 피드백이 실패하면 같은 규칙의 기본 피드백 */
  const finish = useCallback(async (ended: PracticeState) => {
    const runId = ended.runId;
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let server: PracticeReportResponse | null = null;
    try {
      server = await callFn<PracticeReportResponse>("practice-chat", {
        action: "report", mission_id: MISSION.id, end_reason: ended.endReason ?? "inconclusive",
        history: toHistory(ended.messages), events: ended.events, link_offered: ended.linkOffered,
      });
    } catch {
      server = null;
    }
    if (run.current !== runId) return;
    saveReport(buildReport(ended, id, MISSION.title, server));
    setReportId(id);
  }, []);

  /** 새 훈련: 이전 대화·판정·이벤트·리포트·녹음·음성 재생을 모두 정리하고 첫 대사를 받음 */
  const start = useCallback(async () => {
    const runId = ++run.current;
    recorder.cancel();
    speech.stop();
    clearReport();
    setS(freshPractice(runId));
    setInput("");
    setHeard(false);
    setError("");
    setSheet(false);
    setReportId(null);
    setTranscribing(false);
    setBusy(true);
    try {
      await ensureAnon();
      const r = await callFn<PracticeTurnResponse>("practice-chat", { mission_id: MISSION.id });
      if (run.current !== runId) return;
      setS((old) => applyOpening(old, runId, r));
      if (!r.ai_configured) setError("AI 서버 설정이 아직 완료되지 않아 예비 대사로 진행돼요.");
    } catch {
      if (run.current === runId) setError("연습을 시작하지 못했습니다. Supabase 연결과 practice-chat 함수 배포를 확인해주세요.");
    } finally {
      if (run.current === runId) setBusy(false);
    }
    // recorder·speech의 함수는 useCallback으로 고정된 참조라 의존성에서 뺌
  }, []);

  useEffect(() => {
    void start();
    return () => { run.current++; };
  }, [start]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [s.messages, busy]);

  // 상대 답장 읽어주기 (켜져 있을 때만). 중단·새 훈련·화면 이동 시에는 speech.stop()으로 멈춤
  useEffect(() => {
    if (ttsOn && lastScammer?.text) speech.speak(lastScammer.text);
  }, [lastScammer?.text, ttsOn, speech.speak]);

  function endNow(reason: EndReason, endedBy: "learner" | "system", event?: { type: "link_clicked" }, base = state.current) {
    const cur = base;
    const next = endLocally(cur, cur.runId, reason, endedBy, event && { ...event, at: new Date().toISOString() });
    if (next === cur) return;
    // 진행 중인 요청의 응답은 버림 (중단은 AI 응답을 기다리지 않음)
    run.current++;
    const ended = { ...next, runId: run.current };
    recorder.cancel();
    speech.stop();
    setBusy(false);
    setTranscribing(false);
    setS(ended);
    void finish(ended);
  }

  async function send() {
    const text = input.trim();
    const cur = state.current;
    if (!text || busy || cur.ended || recorder.recording || transcribing) return;
    const runId = cur.runId;
    setInput("");
    setHeard(false);
    setError("");
    setBusy(true);
    speech.stop();
    setS(addPending(cur, text));
    try {
      const r = await callFn<PracticeTurnResponse>("practice-chat", {
        mission_id: MISSION.id, difficulty: "normal", stage: cur.stage, history: toHistory(cur.messages), text, link_offered: cur.linkOffered,
      });
      if (run.current !== runId) return;
      const next = applyTurn({ ...state.current, messages: [...cur.messages, { role: "senior", text, stage: cur.stage }] }, runId, r);
      setS(next);
      if (r.used_fallback || !r.ai_configured) setError("Gemini 응답 대신 예비 대사가 사용됐어요.");
      if (next.ended) void finish(next);
    } catch (e) {
      if (run.current !== runId) return;
      const code = e instanceof Error ? e.message : "";
      if (code === "SESSION_ENDED") {
        // 서버 턴 제한: 방금 보낸 말은 기록에서 빼고 판단 보류로 마침
        endNow("inconclusive", "system", undefined, rollback(state.current, runId));
        return;
      }
      setS(rollback(state.current, runId));
      setInput(text);
      setError(code === "PII_BLOCKED" ? "개인정보는 입력하지 마세요." : "메시지 전송에 실패했습니다. 다시 시도해주세요.");
    } finally {
      if (run.current === runId) setBusy(false);
    }
  }

  async function toggleRecord() {
    setError("");
    if (recorder.recording) {
      recorder.stop(); // 결과는 onRecorded로
      return;
    }
    speech.stop();
    const err = await recorder.start();
    if (err) setError(RECORD_ERROR[err]);
  }

  /** 녹음이 끝나면(버튼 또는 30초 도달) 글자로 바꿔 입력칸에 넣음 */
  async function onRecorded(out: Recording | RecordError) {
    const runId = state.current.runId;
    if (run.current !== runId || state.current.ended) return;
    if (typeof out === "string") {
      setError(RECORD_ERROR[out]);
      return;
    }
    setTranscribing(true);
    try {
      const audio = await blobToBase64(out.blob);
      const r = await callFn<TranscribeResponse>("transcribe", { audio, mime_type: out.mime });
      if (run.current !== runId) return;
      // 인식 결과는 바로 보내지 않고 입력칸에 넣어 확인·수정하게 함
      setInput(r.text);
      setHeard(true);
      setTimeout(() => field.current?.focus(), 50); // 입력칸 활성화 후 포커스
    } catch (e) {
      if (run.current !== runId) return;
      const code = e instanceof Error ? e.message : "";
      setError(TRANSCRIBE_ERROR[code] ?? "음성 인식에 실패했어요. 다시 녹음하거나 글자로 입력해 주세요.");
    } finally {
      if (run.current === runId) setTranscribing(false);
    }
  }

  function leave() {
    // 대화가 있으면 중단도 결과로 남기고, 시작 전이면 홈으로
    if (userTurns > 0 && !s.ended) endNow("user_stopped", "learner");
    else router.push("/home");
    setSheet(false);
  }

  const inputLocked = busy || s.messages.length === 0 || recorder.recording || transcribing;

  return (
    <Screen>
      <Header title="채팅 연습" back={() => (s.ended ? router.push("/home") : setSheet(true))} onClose={() => (s.ended ? router.push("/home") : setSheet(true))} />
      <Progress value={Math.min(4, STAGES.indexOf(s.stage) + 1)} total={4} dark />
      <section className="screen__body" style={{ minHeight: 0 }}>
        <div className="stack" style={{ marginTop: 12, gap: 8 }}>
          <span className="chip">{MISSION.title}</span>
          <h2 className="title">수상한 문자가 도착했어요</h2>
          <p className="desc">직접 답장하면서 연습해 보세요. 실제 개인정보는 입력하지 마세요.</p>
          {speech.supported && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="chip chip--ghost" style={{ border: 0, cursor: "pointer" }} aria-pressed={ttsOn} onClick={() => { if (ttsOn) speech.stop(); setTtsOn(!ttsOn); }}>
                {ttsOn ? "🔊 소리로 듣기 끄기" : "🔈 소리로 듣기"}
              </button>
              {speech.speaking && <button type="button" className="chip chip--ghost" style={{ border: 0, cursor: "pointer" }} onClick={speech.stop}>■ 읽기 멈추기</button>}
            </div>
          )}
          {speech.failed && ttsOn && <p className="desc">소리를 재생하지 못했어요. 글로 계속 읽어 주세요.</p>}
        </div>
        <div className="chat-card" style={{ marginTop: 20, flex: 1, minHeight: 260, overflowY: "auto", marginBottom: 12 }} aria-live="polite">
          {s.messages.map((m, i) => (
            <div className={m.role === "senior" ? "msg msg--me" : "msg"} key={`${s.runId}-${i}`}>
              {m.role === "scammer" && <span className="msg__avatar"><PersonIcon /></span>}
              {m.role === "senior" ? (
                <p className="bubble bubble--me" style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
              ) : (
                <div className="msg__col">
                  <p className="bubble" style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
                  {m.offerLink && (
                    <button
                      type="button"
                      className="bubble"
                      disabled={s.ended}
                      onClick={() => endNow("mock_action", "learner", { type: "link_clicked" })}
                      style={{ textAlign: "left", border: "1px solid #c7d2fe", background: "#eef2ff", color: "#3730a3", cursor: "pointer" }}
                    >
                      🔗 [연습용] 결제 확인 링크
                      <br />
                      <span style={{ fontSize: 13, color: "#6b7280" }}>훈련용 가짜 링크예요. 눌러도 실제로 열리지 않아요.</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {busy && <p className="desc">응답을 기다리고 있어요…</p>}
          <div ref={bottom} />
        </div>
        {error && <p role="alert" style={{ color: "#b91c1c", marginTop: 12 }}>{error}</p>}
        {!s.ended && userTurns > 0 && <p className="desc" style={{ marginTop: 4 }}>답장 {userTurns}/{s.maxTurns}</p>}
        {s.ended && (
          <div className="card card--blue" style={{ marginTop: 16 }}>
            <p className="card__title">연습이 종료됐어요</p>
            <p className="card__text--blue">{END_TEXT[s.endReason ?? "inconclusive"]}</p>
            {s.usedFallback && <p className="desc">일부 대사는 예비 시나리오로 진행됐어요.</p>}
          </div>
        )}
      </section>
      <BottomCTA row={s.ended}>
        {s.ended ? (
          <>
            <button className="btn btn--gray" onClick={() => void start()}>다시 연습하기</button>
            <button className="btn btn--primary" disabled={!reportId} onClick={() => reportId && router.push(`/roleplay/chat/review?id=${reportId}`)}>
              {reportId ? "결과 보기" : "결과 정리 중…"}
            </button>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
            {recorder.recording && (
              <p className="desc" role="status">● 녹음 중 {sec(recorder.elapsed)} / {sec(MAX_RECORD_MS)} · 다 말씀하시면 &lsquo;녹음 끝&rsquo;을 눌러 주세요</p>
            )}
            {transcribing && <p className="desc" role="status">말씀을 글자로 바꾸고 있어요…</p>}
            {heard && !transcribing && <p className="desc">인식된 문장을 확인하고, 틀린 부분은 고친 뒤 보내기를 눌러 주세요.</p>}
            <form onSubmit={(e) => { e.preventDefault(); void send(); }} style={{ display: "flex", gap: 8, width: "100%", alignItems: "center" }}>
              {recorder.supported && (
                <button
                  type="button"
                  className={recorder.recording ? "btn btn--primary" : "btn btn--gray"}
                  style={{ flex: "0 0 72px", width: 72, borderRadius: 14, fontSize: 15 }}
                  aria-label={recorder.recording ? "녹음 끝내기" : "말로 입력하기"}
                  disabled={busy || transcribing || s.messages.length === 0}
                  onClick={() => void toggleRecord()}
                >
                  {recorder.recording ? "녹음 끝" : "🎤 말하기"}
                </button>
              )}
              <input
                ref={field}
                aria-label="답장 입력"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder="답장을 입력하세요"
                disabled={inputLocked}
                style={{ flex: "1 1 0%", width: 0, minWidth: 0, height: 56, background: "#fff", padding: 12, border: "1px solid #ccc", borderRadius: 12, fontSize: 16 }}
              />
              <button type="submit" className="btn btn--primary" style={{ flex: "0 0 88px", width: 88, borderRadius: 14 }} disabled={inputLocked || !input.trim()}>보내기</button>
            </form>
          </div>
        )}
      </BottomCTA>
      {sheet && <BottomSheet onClose={() => setSheet(false)}><div className="sheet__top"><div style={{ flex: 1 }}><p className="sheet__title">연습을 중단하시겠어요?</p><p className="sheet__text">{userTurns > 0 ? "지금까지의 대화로 결과를 정리해 드려요." : "대화가 아직 진행 중이에요."}</p></div></div><div className="sheet__btns"><button className="btn btn--gray" onClick={leave}>그만할래요</button><button className="btn btn--primary" onClick={() => setSheet(false)}>계속할게요</button></div></BottomSheet>}
    </Screen>
  );
}
