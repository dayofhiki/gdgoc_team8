// 혼자 연습 화면 상태: 새 훈련 초기화, 늦은 응답 무시, 리포트 전달 테스트
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPending, applyOpening, applyTurn, buildReport, clearReport, endLocally, freshPractice, loadReport, rollback, saveReport, toHistory,
} from "./practiceSession.ts";
import type { PracticeTurnResponse } from "../../supabase/functions/_shared/types.ts";

const res = (o: Partial<PracticeTurnResponse>): PracticeTurnResponse => ({
  reply: "응", stage: "trust", ended: false, used_fallback: false, ai_configured: true, turn_count: 1, max_turns: 8, ...o,
});

function played() {
  let s = applyOpening(freshPractice(1), 1, res({ reply: "엄마 나야", stage: "approach", turn_count: 0 }));
  s = addPending(s, "링크 눌렀어");
  s = applyTurn(s, 1, res({ analysis: { text: "링크 눌렀어", intent: "claimed_action", uncertain: false }, offer_link: true, stage: "demand" }));
  return s;
}

test("턴 적용: 학습자 말에 intent가 붙고, 모의 링크 표시가 기록됨", () => {
  const s = played();
  assert.deepEqual(toHistory(s.messages).map((m) => m.intent ?? null), [null, "claimed_action", null]);
  assert.equal(s.linkOffered, true);
  assert.equal(s.messages.at(-1)?.offerLink, true);
  assert.equal(s.events.length, 0); // 말만 했고 클릭 이벤트는 없음
});

test("늦은 응답: runId가 다르면 새 훈련 상태를 바꾸지 않음", () => {
  const fresh = freshPractice(2);
  assert.equal(applyTurn(fresh, 1, res({ reply: "이전 훈련 답장" })), fresh);
  assert.equal(applyOpening(fresh, 1, res({})), fresh);
  assert.equal(endLocally(fresh, 1, "user_stopped", "learner"), fresh);
  assert.equal(rollback(addPending(fresh, "x"), 1).messages.length, 1);
});

test("새 훈련 초기화: 대화·판정·턴·이벤트·종료 상태가 남지 않음", () => {
  const ended = endLocally(played(), 1, "mock_action", "learner", { type: "link_clicked", at: "t" });
  assert.equal(ended.ended, true);
  const next = freshPractice(ended.runId + 1);
  assert.deepEqual(
    [next.messages.length, next.analyses.length, next.turnCount, next.events.length, next.ended, next.endReason, next.linkOffered],
    [0, 0, 0, 0, false, undefined, false],
  );
});

test("종료 후에는 추가 턴·중복 종료가 반영되지 않음", () => {
  const ended = applyTurn(played(), 1, res({ ended: true, end_reason: "refused", ended_by: "learner" }));
  assert.equal(ended.endReason, "refused");
  assert.equal(applyTurn(ended, 1, res({ reply: "또" })), ended);
  assert.equal(endLocally(ended, 1, "user_stopped", "learner"), ended);
  assert.equal(addPending(ended, "또"), ended);
});

test("리포트: 서버 응답이 없으면 같은 규칙의 근거·기본 피드백, 저장·불러오기·초기화", () => {
  const ended = endLocally(played(), 1, "mock_action", "learner", { type: "link_clicked", at: "t" });
  const r = buildReport(ended, "abc", "가족·지인 사칭", null);
  assert.equal(r.feedback_source, "fallback");
  assert.ok(r.observations.includes("훈련 화면에서 모의 링크를 열었어요."));
  assert.match(r.feedback.summary, /모의 링크를 열었어요/);
  saveReport(r); // Node에는 sessionStorage가 없어 메모리 보관 경로
  assert.equal(loadReport("abc")?.id, "abc");
  assert.equal(loadReport("other"), null);
  clearReport();
  assert.equal(loadReport("abc"), null);
});
