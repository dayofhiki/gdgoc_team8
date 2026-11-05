"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronRight } from "@/components/Icons";
import { BottomCTA, Header, Notice, Screen } from "@/components/ui";

type Mode = "chat" | "case";
const OPTIONS: { id: Mode; title: string; desc: string; icon: string; size: number }[] = [
  { id: "chat", title: "실전 대화에 참여하기", desc: "9가지 상황 중 직접 고르거나 무작위로 연습해요.", icon: "/images/icon-chat.png", size: 54 },
  { id: "case", title: "사례로 먼저 배우기", desc: "진행되는 대화를 보며 위험한 순간을 익혀요.", icon: "/images/fish-clipboard.png", size: 54 },
];

/** 실전 대응 훈련과 사례 학습의 진입점 */
export default function RoleplayMode() {
  const [mode, setMode] = useState<Mode>("chat");
  const router = useRouter();
  return (
    <Screen>
      <Header title="실전 대응 훈련" back={() => router.replace("/roleplay")} />
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 16, gap: 8 }}>
          <span className="chip">상대를 모르는 현실적인 상황</span>
          <h2 className="title">{"직접 대응해 볼까요?\n사례부터 배워 볼까요?"}</h2>
          <p className="desc">{"실전 대화에는 실제 연락과 사칭 시도가 섞여 있어요.\n사기인지 맞히는 것보다 안전한 행동이 중요해요."}</p>
        </div>
        <div className="stack" style={{ marginTop: 36, gap: 12 }} role="radiogroup" aria-label="연습 방식">
          {OPTIONS.map((o) => {
            const on = mode === o.id;
            return (
              <button key={o.id} role="radio" aria-checked={on} className={on ? "option option--selected" : "option"} onClick={() => setMode(o.id)}>
                <img src={o.icon} alt="" width={o.size} height={o.size} style={{ margin: 0, objectFit: "contain" }} />
                <span className="option__text">
                  <span className="option__title">{o.title}</span>
                  <span className="option__desc">{o.desc}</span>
                </span>
                {on ? <CheckCircle /> : <ChevronRight size={24} />}
              </button>
            );
          })}
          <Notice>훈련은 가상이며 실제 연락·송금·개인정보 전달은 발생하지 않아요.</Notice>
        </div>
      </section>
      <BottomCTA>
        <button className="btn btn--primary" onClick={() => router.push(mode === "chat" ? "/roleplay/select" : "/roleplay/case")}>
          {mode === "chat" ? "실전 대응 훈련 시작" : "사례 학습 시작"}
        </button>
      </BottomCTA>
    </Screen>
  );
}
