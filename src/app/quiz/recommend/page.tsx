"use client";
import Link from "next/link";
import { useAppState } from "@/components/AppState";
import { BottomCTA, Header, Screen } from "@/components/ui";

export default function QuizRecommendation() {
  const { nickname } = useAppState();
  return (
    <Screen>
      <Header title="오늘의 추천" back />
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 32, gap: 12 }}>
          <span className="chip">퀴즈를 마쳤어요!</span>
          <h2 className="title">{"배운 내용을\n우리 가족의 습관으로 만들어요"}</h2>
          <p className="desc">누군가 가족을 사칭하며 급하게 돈을 요구한다면, 우리 가족만 아는 확인 질문이 도움이 될 수 있어요.</p>
        </div>
        <img src="/images/fish-family.png" alt="뻐끄미 가족" style={{ width: 208, maxWidth: "70%", alignSelf: "center", marginTop: 28 }} />
        <div className="card card--blue" style={{ marginTop: 28 }}>
          <p className="card__title">다음 추천: 가족 암호 만들기</p>
          <p className="card__text">가족끼리만 아는 질문을 정해 두고, 의심스러운 연락이 오면 원래 알고 있던 번호로 직접 확인해 보세요.</p>
        </div>
      </section>
      <BottomCTA row>
        <Link href={nickname ? "/home" : "/onboarding"} className="btn btn--gray">홈으로</Link>
        <Link href="/family-code/guide" className="btn btn--primary">가족 암호 만들기</Link>
      </BottomCTA>
    </Screen>
  );
}
