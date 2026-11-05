"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "@/components/Icons";
import { BottomCTA, Header, Screen } from "@/components/ui";

const OPTIONS = [
  { title: "실전 훈련", subtitle: "무작위로 상황이 선정돼요.", image: "/images/icon-chat.png", path: "/roleplay/chat" },
  { title: "상황별 연습", subtitle: "연습하고 싶은 상황을 골라요.", image: "/images/fish-ox.png", path: "/roleplay/select" },
] as const;

export default function RoleplayMode() {
  const router = useRouter();
  const [selected, setSelected] = useState<(typeof OPTIONS)[number]["path"]>("/roleplay/chat");
  return (
    <Screen>
      <Header title="AI 상황극" back={() => router.replace("/roleplay")} />
      <section className="screen__body figma-mode">
        <div className="figma-mode-heading">
          <span className="figma-kicker">가족·지인 사칭 미션</span>
          <h2>어떤 방식으로<br />연습해 볼까요?</h2>
          <p>선택해서 답장하거나 직접 답장할 수 있어요. 문자·전화·앱을 통해 실제 상황에서 어떻게 선택해야 할지 연습해 보세요.</p>
        </div>
        <div className="figma-mode-list" role="radiogroup" aria-label="연습 방식">
          {OPTIONS.map(option => (
            <button key={option.path} type="button" role="radio" aria-checked={selected === option.path}
              className={"figma-mode-item" + (selected === option.path ? " figma-mode-item--selected" : "")}
              onClick={() => setSelected(option.path)}>
              <img src={option.image} alt="" width={58} height={58} />
              <span className="figma-mode-item-copy"><strong>{option.title}</strong><small>{option.subtitle}</small></span>
              {selected === option.path
                ? <span className="figma-mode-check" aria-hidden="true">✓</span>
                : <ChevronRight size={21}/>}
            </button>
          ))}
        </div>
        <p className="figma-mode-disclaimer">ⓘ 모든 대화는 가상입니다. 실제 송금·통화·개인정보 전송은 일어나지 않아요.</p>
      </section>
      <BottomCTA>
        <button type="button" className="btn btn--primary" onClick={() => router.push(selected)}>
          {selected === "/roleplay/chat" ? "채팅으로 시작하기" : "상황 고르기"}
        </button>
      </BottomCTA>
    </Screen>
  );
}
