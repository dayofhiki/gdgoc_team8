/**
 * 녹음형 음성 입력: 브라우저가 녹음한 짧은 음성(base64)을 텍스트로 바꿔 돌려줍니다.
 * 결과는 바로 대화에 보내지 않고, 화면에서 사용자가 확인·수정한 뒤 practice-chat으로 전송합니다.
 * 음성·인식 결과는 저장하거나 로그에 남기지 않습니다. Gemini 키는 Edge Function Secret에서만 읽습니다.
 */
import { handle, HttpError } from "../_shared/http.ts";
import { maskPii } from "../_shared/pii.ts";
import { MAX_AUDIO_B64, normalizeMime, TranscribeError, transcribeAudio } from "../_shared/transcribe.ts";
import type { TranscribeRequest, TranscribeResponse } from "../_shared/types.ts";

const B64 = /^[A-Za-z0-9+/]+=*$/;

Deno.serve(handle<TranscribeRequest>(async ({ body }): Promise<TranscribeResponse> => {
  if (typeof body.audio !== "string" || typeof body.mime_type !== "string") throw new HttpError(400, "AUDIO_INVALID", "음성 형식이 올바르지 않습니다");
  const mime = normalizeMime(body.mime_type);
  if (!mime) throw new HttpError(400, "AUDIO_INVALID", "지원하지 않는 음성 형식입니다");
  if (body.audio.length < 200) throw new HttpError(422, "TRANSCRIBE_EMPTY", "녹음된 소리가 없어요");
  if (body.audio.length > MAX_AUDIO_B64 || !B64.test(body.audio)) throw new HttpError(400, "AUDIO_INVALID", "음성이 너무 길거나 형식이 올바르지 않습니다");
  try {
    const text = await transcribeAudio(body.audio, mime);
    if (!text) throw new HttpError(422, "TRANSCRIBE_EMPTY", "말소리를 알아듣지 못했어요");
    // 사용자가 수정 후 보내므로 실제 번호 등은 미리 가림 (practice-chat의 PII_BLOCKED 방지)
    return { text: maskPii(text).slice(0, 500) };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof TranscribeError) {
      console.error("transcribe error", e.code, e.message);
      throw e.code === "AI_NOT_CONFIGURED"
        ? new HttpError(503, "AI_NOT_CONFIGURED", "음성 인식이 설정되지 않았습니다")
        : new HttpError(502, "TRANSCRIBE_FAILED", "음성 인식에 실패했습니다");
    }
    throw e;
  }
}));
