/**
 * 연습 결과 기록 → Supabase practice_records. 요약만 저장 (대화 원문 저장 안 함).
 * 가족에게는 본인이 공유를 켰을 때만 보임 (setShareResults). 실패해도 화면 흐름은 계속.
 * shortcut: 퀴즈 결과는 브라우저가 직접 기록해 조작 가능 (속는 건 자기 가족뿐), 위변조가 문제 되면 서버 라우트에서 기록할 것.
 */
import { configured, ensureAnon, sb } from "./supabase";

export type PracticeRecord = {
  kind: "quiz" | "challenge" | "training";
  title?: string;
  safe?: boolean;
  score?: number;
  total?: number;
  detail?: Record<string, unknown>;
};

export async function saveRecord(r: PracticeRecord): Promise<void> {
  if (!configured()) return;
  try {
    await ensureAnon();
    const { error } = await sb().from("practice_records").insert(r);
    if (error) throw error;
  } catch (e) {
    console.warn("연습 기록 저장 실패", e);
  }
}
