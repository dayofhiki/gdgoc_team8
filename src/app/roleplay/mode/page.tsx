"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "@/components/Icons";
import { Header, Screen } from "@/components/ui";

/** 훈련 목표는 신원 맞히기가 아니라, 맥락을 보며 안전한 행동을 실제로 선택하는 것이다. */
const OPTIONS = [
  {
    title: "실전 훈련",
    subtitle: "어떤 연락이 올지 모릅니다",
    desc: "답장 예시를 누르거나 직접 쓰고, 전화·앱으로 대응해 보세요.",
    image: "/images/icon-chat.png",
    path: "/roleplay/chat",
  },
  {
    title: "상황별 연습",
    subtitle: "연습할 상황을 직접 선택합니다",
    desc: "가족·택배·금융 등 원하는 유형을 골라 집중해서 연습해 보세요.",
    image: "/images/icon-chat.png",
    path: "/roleplay/select",
  },
] as const;

export default function RoleplayMode() {
  const router = useRouter();

  return (
    <Screen>
      <Header title="문자·채팅 대응 훈련" back={() => router.replace("/roleplay")} />
      <section className="screen__body rt-mode-page">
        <div className="rt-mode-intro">
          <span className="chip">미끼주의보 · 대응 훈련</span>
          <h2>안전하게 행동하는 연습,<br />어떻게 시작할까요?</h2>
          <p>어떤 상황이든 중요한 것은 상대의 요구에 휩쓸리지 않고 스스로 안전한 행동을 선택하는 거예요.</p>
        </div>
        <div className="rt-mode-options" aria-label="훈련 방식">
          {OPTIONS.map(option => (
            <button key={option.path} type="button" className="rt-mode-card"
              onClick={() => router.push(option.path)}
            >
              <img src={option.image} alt="" width={52} height={52} />
              <span className="rt-mode-copy">
                <strong>{option.title}</strong>
                <span className="rt-mode-subtitle">{option.subtitle}</span>
                <small>{option.desc}</small>
              </span>
              <span className="rt-mode-arrow" aria-hidden="true"><ChevronRight size={23} /></span>
            </button>
          ))}
        </div>
        <p className="rt-mode-disclaimer">모든 대화는 가상입니다. 실제 송금·통화·개인정보 전송은 일어나지 않아요.</p>
      </section>
    </Screen>
  );
}
