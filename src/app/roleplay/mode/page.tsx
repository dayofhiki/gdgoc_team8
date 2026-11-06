"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "@/components/Icons";
import { BottomCTA, Header, Screen } from "@/components/ui";

const OPTIONS = [
  {
    title: "문자·채팅 훈련",
    subtitle: "문자를 주고받고, 휴대전화로 직접 대응해요.",
    image: "/images/icon-chat.png",
    path: "/roleplay/chat",
    start: "채팅 훈련 시작하기",
  },
  {
    title: "AI 피싱범 전화 훈련",
    subtitle: "목소리로 대응하고, 끊은 뒤에도 행동을 연습해요.",
    image: "/images/icon-phone.png",
    path: "/roleplay/phone",
    start: "전화 훈련 시작하기",
  },
] as const;

export default function RoleplayMode() {
  const router = useRouter();
  const [selected, setSelected] = useState<(typeof OPTIONS)[number]["path"]>("/roleplay/chat");
  const choice = OPTIONS.find(option => option.path === selected) ?? OPTIONS[0];
  return (
    <Screen>
      <Header title="AI 상황극" back="/home" />
      <section className="screen__body figma-mode">
        <div className="figma-mode-heading">
          <h2>어떤 상황극으로<br />연습해 볼까요?</h2>
          <p>문자를 주고받거나 AI 피싱범과 통화해 보세요. 위험한 요구에 직접 대응하고, 그 뒤 행동까지 돌아볼 수 있어요.</p>
        </div>
        <div className="figma-mode-list" role="radiogroup" aria-label="AI 상황극 방식">
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
        {selected === "/roleplay/chat" && (
          <button type="button" className="figma-mode-topic-link"
            onClick={() => router.push("/roleplay/select")}>
            연습할 문자 상황을 직접 고르기 <ChevronRight size={18} />
          </button>
        )}
        <p className="figma-mode-disclaimer">ⓘ 모든 대화와 행동은 가상입니다. 실제 송금, 외부 통화, 개인정보 전송은 일어나지 않아요.</p>
      </section>
      <BottomCTA>
        <button type="button" className="btn btn--primary" onClick={() => router.push(choice.path)}>
          {choice.start}
        </button>
      </BottomCTA>
    </Screen>
  );
}
