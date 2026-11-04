"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BottomCTA, Header, Screen } from "@/components/ui";
import { REMEMBER_CHAT } from "@/lib/chatScript";
import { loadReport, type PracticeReport } from "@/lib/practiceSession";
import type { EndReason, Intent } from "@shared/types";

const TITLE: Record<EndReason, string> = {
  refused: "요청을\n분명하게 거절했어요",
  verify_intent: "직접 확인하겠다고\n답했어요",
  verified_claimed: "가족에게 확인했다고\n답했어요",
  complied: "요청에 응하겠다고\n답했어요",
  claimed_action: "행동했다고 말했지만\n기록된 행동은 없어요",
  mock_action: "모의 링크를\n열었어요",
  scammer_left: "상대가\n대화를 끝냈어요",
  user_stopped: "연습을\n중단했어요",
  inconclusive: "이번 대화는\n판단을 보류했어요",
};

const INTENT_LABEL: Record<Intent, string> = {
  refuse: "거절",
  verify_independent: "직접 확인 의사",
  verified_in_chat: "가족에게 확인했다고 말함",
  comply: "요청 수락 의사",
  claimed_action: "행동했다고 말함",
  suspect: "의심",
  continue: "대화 이어감",
  stop: "중단",
  unclear: "판단 어려움",
};

function Review() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  // sessionStorage는 브라우저에서만 읽을 수 있어 마운트 후 로드
  const [report, setReport] = useState<PracticeReport | null | undefined>(undefined);
  useEffect(() => setReport(loadReport(id)), [id]);

  if (report === undefined) return <Screen><Header back={() => router.push("/home")} /></Screen>;

  if (!report) {
    return (
      <Screen>
        <Header back={() => router.push("/home")} />
        <section className="screen__body">
          <div className="stack" style={{ marginTop: 20, gap: 8 }}>
            <h2 className="title">{"결과를\n찾을 수 없어요"}</h2>
            <p className="desc">연습 결과는 저장하지 않고 이 탭에서만 잠시 보관해요. 새 연습을 시작하거나 다른 탭에서 열면 볼 수 없어요.</p>
          </div>
          <div className="card card--blue" style={{ marginTop: 64 }}>
            <p className="card__title">꼭 기억할 한 가지</p>
            <p className="card__text--blue">{REMEMBER_CHAT}</p>
          </div>
        </section>
        <BottomCTA row>
          <button className="btn btn--gray" onClick={() => router.push("/home")}>홈으로</button>
          <button className="btn btn--primary" onClick={() => router.push("/roleplay/chat")}>연습하기</button>
        </BottomCTA>
      </Screen>
    );
  }

  const { feedback } = report;
  return (
    <Screen>
      <Header back={() => router.push("/home")} />
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 20, gap: 8 }}>
          <span className="chip">{report.mission_title}</span>
          <h2 className="title">{TITLE[report.end_reason]}</h2>
          <p className="desc">{feedback.summary}</p>
        </div>
        <div className="stack" style={{ marginTop: 40, gap: 20 }}>
          {report.observations.length > 0 && (
            <div className="card">
              <p className="card__title">대화에서 확인된 점</p>
              {report.observations.map((o) => <p className="card__text" key={o}>{o}</p>)}
            </div>
          )}
          {feedback.points.length > 0 && (
            <div className="card">
              <p className="card__title">돌아보기</p>
              {feedback.points.map((p) => <p className="card__text" key={p}>· {p}</p>)}
            </div>
          )}
          <div className="card card--blue">
            <p className="card__title">다음에는 이렇게 해 보세요</p>
            <p className="card__text--blue">{feedback.next_step}</p>
          </div>
          <details className="card">
            <summary className="card__title" style={{ cursor: "pointer" }}>대화 다시 보기</summary>
            <div className="stack" style={{ gap: 10, marginTop: 8 }}>
              {report.messages.map((m, i) => (
                <div key={i} className={m.role === "senior" ? "msg msg--me" : "msg"}>
                  <p className={m.role === "senior" ? "bubble bubble--me" : "bubble"} style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
                  {m.role === "senior" && m.intent && (
                    <span className="msg__time">
                      AI 해석: {INTENT_LABEL[m.intent]}
                      {report.analyses.find((a) => a.text === m.text)?.uncertain ? " (확실하지 않음)" : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </details>
          <p className="desc" style={{ fontSize: 13 }}>
            AI 해석은 대화를 보고 추정한 것이며, 실제 행동은 훈련 화면에서 기록된 것만 반영해요.
            {report.feedback_source === "fallback" ? " 이번 피드백은 기본 안내 문구로 정리했어요." : ""}
            {report.used_fallback ? " 일부 대사는 예비 시나리오로 진행됐어요." : ""}
          </p>
        </div>
      </section>
      <BottomCTA row>
        <button className="btn btn--gray" onClick={() => router.push("/home")}>홈으로</button>
        <button className="btn btn--primary" onClick={() => router.push("/roleplay/chat")}>다시 연습하기</button>
      </BottomCTA>
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Review />
    </Suspense>
  );
}
