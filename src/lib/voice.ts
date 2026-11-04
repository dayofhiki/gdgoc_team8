"use client";
/**
 * 녹음형 음성 입력과 TTS(브라우저 speechSynthesis).
 * - 녹음은 버튼으로 시작·종료하고, 끝나면 Blob 하나를 돌려줍니다. 파일은 저장하지 않습니다.
 * - TTS는 브라우저 내장 한국어 음성으로 읽습니다. 실제 가족 목소리는 쓰지 않습니다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_RECORD_MS = 30_000;
const MIN_RECORD_MS = 600;
const MIN_BYTES = 1_000;

export type RecordError = "unsupported" | "denied" | "no-mic" | "failed" | "empty";
export type Recording = { blob: Blob; mime: string };

const PREFERRED = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

/** onDone: 녹음이 끝나면(버튼 또는 최대 시간 도달) 결과 한 번 호출. cancel()로 버리면 호출하지 않음 */
export function useRecorder(onDone: (r: Recording | RecordError) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [supported, setSupported] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const done = useRef(onDone);
  done.current = onDone;
  const timers = useRef<{ tick?: ReturnType<typeof setInterval>; limit?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    setSupported(typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  const release = useCallback(() => {
    clearInterval(timers.current.tick);
    clearTimeout(timers.current.limit);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    rec.current = null;
    setRecording(false);
    setElapsed(0);
  }, []);

  /** 녹음 시작. 결과는 onDone으로 받음 */
  const start = useCallback(async (): Promise<RecordError | null> => {
    if (rec.current) return null;
    if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      return name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "no-mic" : "failed";
    }
    const mime = PREFERRED.find((m) => MediaRecorder.isTypeSupported(m));
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    } catch {
      release();
      return "failed";
    }
    chunks.current = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      const ms = Date.now() - startedAt.current;
      const type = r.mimeType || mime || "audio/webm";
      const blob = new Blob(chunks.current, { type });
      chunks.current = [];
      release();
      done.current(ms < MIN_RECORD_MS || blob.size < MIN_BYTES ? "empty" : { blob, mime: type });
    };
    rec.current = r;
    startedAt.current = Date.now();
    r.start();
    setRecording(true);
    timers.current.tick = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    timers.current.limit = setTimeout(() => { if (rec.current?.state === "recording") rec.current.stop(); }, MAX_RECORD_MS);
    return null;
  }, [release]);

  /** 녹음 종료 → onDone */
  const stop = useCallback(() => {
    if (rec.current?.state === "recording") rec.current.stop();
  }, []);

  /** 녹음 버리기 (새 훈련·중단·화면 이동) */
  const cancel = useCallback(() => {
    if (rec.current) {
      rec.current.onstop = null;
      if (rec.current.state === "recording") rec.current.stop();
    }
    chunks.current = [];
    release();
  }, [release]);

  useEffect(() => cancel, [cancel]);

  return { supported, recording, elapsed, start, stop, cancel };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined");
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 0.95;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("ko"));
    if (voice) u.voice = voice;
    u.onstart = () => { setSpeaking(true); setFailed(false); };
    u.onend = () => setSpeaking(false);
    u.onerror = (e) => {
      setSpeaking(false);
      // cancel()로 멈춘 경우는 오류로 보지 않음
      if (e.error !== "canceled" && e.error !== "interrupted") setFailed(true);
    };
    synth.speak(u);
  }, []);

  useEffect(() => stop, [stop]);

  return { supported, speaking, failed, speak, stop };
}
