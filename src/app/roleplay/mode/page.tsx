"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronRight } from "@/components/Icons";
import { BottomCTA, Header, Notice, Screen } from "@/components/ui";

type Mode = "chat" | "phone";
const OPTIONS: { id: Mode; title: string; desc: string; icon: string; size: number }[] = [
  { id: "chat", title: "채팅으로 연습하기", desc: "대화를 보며 속는 순간을 찾아요.", icon: "/images/icon-chat.png", size: 54 },
  { id: "phone", title: "전화로 연습하기", desc: "통화를 들으며 속는 순간을 찾아요.", icon: "/images/icon-phone.png", size: 58 },
];

/** AI 상황극 · 연습 방식 선택 */
export default function RoleplayMode() {
  const [mode, setMode] = useState<Mode>("chat");
  const router = useRouter();
  return (
    <Screen>
      <Header title="AI 상황극" />
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 16, gap: 8 }}>
          <span className="chip">가족·지인 사칭 미션</span>
          <h2 className="title">{"어떤 방식으로\n연습해 볼까요?"}</h2>
          <p className="desc">{"같은 미션을 문자나 전화 중\n편한 방식으로 연습할 수 있어요."}</p>
        </div>
        <div className="stack" style={{ marginTop: 36, gap: 12 }} role="radiogroup" aria-label="연습 방식">
          {OPTIONS.map((o) => {
            const on = mode === o.id;
            return (
              <button key={o.id} role="radio" aria-checked={on} className={on ? "option option--selected" : "option"} onClick={() => setMode(o.id)}>
                <img src={o.icon} alt="" width={o.size} height={o.size} style={{ margin: o.size === 58 ? -2 : 0 }} />
                <span className="option__text">
                  <span className="option__title">{o.title}</span>
                  <span className="option__desc">{o.desc}</span>
                </span>
                {on ? <CheckCircle /> : <ChevronRight size={24} />}
              </button>
            );
          })}
          <Notice>연습용이라 실제 전화가 걸리거나 돈이 오가지 않아요.</Notice>
        </div>
      </section>
      <BottomCTA>
        <button className="btn btn--primary" onClick={() => router.push(mode === "chat" ? "/roleplay/chat" : "/roleplay/phone")}>
          {mode === "chat" ? "채팅으로 시작하기" : "전화로 시작하기"}
        </button>
      </BottomCTA>
    </Screen>
  );
}
