// 녹음 → 텍스트 (Gemini 3.5 Transcribe, Interactions API).
// 2026-11-04 공식 문서 기준: POST /v1beta/interactions, 짧은 음성은 base64 inline({type:"audio", data, mime_type}) 가능,
// 요청 최대 20MB. REST 응답에서 텍스트 위치는 문서에 예시가 없어 output_text → steps[].content[].text 순으로 읽음 (실키 미검증).
import { env } from "./ai.ts";

const DEFAULT_MODEL = "gemini-3.5-transcribe";
const API_REVISION = "2026-05-20";
const TIMEOUT_MS = 15000;
export const MAX_AUDIO_B64 = 2_000_000; // 약 1.5MB. 30초 Opus 녹음은 수백 KB

// 문서의 지원 형식. Safari MediaRecorder의 audio/mp4(AAC)는 m4a로 보냄 (미검증)
const MIME: Record<string, string> = {
  "audio/webm": "audio/webm",
  "audio/ogg": "audio/ogg",
  "audio/opus": "audio/opus",
  "audio/wav": "audio/wav",
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mp3",
  "audio/aac": "audio/aac",
  "audio/m4a": "audio/m4a",
  "audio/x-m4a": "audio/m4a",
  "audio/mp4": "audio/m4a",
};
export const normalizeMime = (mime: string): string | null => MIME[mime.split(";")[0].trim().toLowerCase()] ?? null;

// Node 타입 제거 실행(test:backend)이 생성자 매개변수 속성을 지원하지 않아 필드로 선언
export class TranscribeError extends Error {
  code: "AI_NOT_CONFIGURED" | "TRANSCRIBE_FAILED";
  constructor(code: "AI_NOT_CONFIGURED" | "TRANSCRIBE_FAILED", message: string) {
    super(message);
    this.code = code;
  }
}

type Step = { content?: { type?: string; text?: string }[] };
export function readTranscript(data: unknown): string {
  const d = data as { output_text?: unknown; steps?: Step[] } | null;
  if (typeof d?.output_text === "string") return d.output_text.trim();
  const parts = (d?.steps ?? []).flatMap((s) => s.content ?? []).filter((c) => c.type === "text" && typeof c.text === "string");
  return parts.map((c) => c.text).join(" ").trim();
}

export async function transcribeAudio(audioB64: string, mime: string): Promise<string> {
  const key = env("GEMINI_API_KEY");
  if (!key) throw new TranscribeError("AI_NOT_CONFIGURED", "GEMINI_API_KEY 없음");
  const model = env("GEMINI_TRANSCRIBE_MODEL") || DEFAULT_MODEL;
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key, "Api-Revision": API_REVISION },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: `models/${model}`,
      input: [{ type: "audio", data: audioB64, mime_type: mime }],
      generation_config: { transcription_config: { language_codes: ["ko-KR"] } },
    }),
  }).catch((e) => {
    throw new TranscribeError("TRANSCRIBE_FAILED", e instanceof Error ? e.message : "network");
  });
  // 응답 본문에는 음성 내용이 들어 있을 수 있어 상태 코드만 남김
  if (!res.ok) throw new TranscribeError("TRANSCRIBE_FAILED", `Transcribe ${res.status}`);
  return readTranscript(await res.json());
}
