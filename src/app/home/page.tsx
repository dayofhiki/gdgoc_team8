"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/AppState";
import { ChevronRight, LockIcon, SendIcon } from "@/components/Icons";
import { Screen } from "@/components/ui";
import { randomTrainingTopic, type TrainingTopicId, topicDescriptor } from "@/lib/trainingCatalog";

export default function Home() {
  const { ready, nickname } = useAppState();
  const router = useRouter();
  const [recommendedId, setRecommendedId] = useState<TrainingTopicId>();
  useEffect(() => { setRecommendedId(randomTrainingTopic().id); }, []);
  const recommended = recommendedId ? topicDescriptor(recommendedId) : undefined;
  useEffect(() => {
    if (ready && !nickname) router.replace("/onboarding");
  }, [ready, nickname, router]);
  return (
    <Screen>
      <div className="home__logo">
        <img src="/images/logo.svg" alt="미끼주의보" width={121} height={24} />
      </div>

      <section className="hero" aria-label="추천 훈련">
        <span className="hero__chip">추천 훈련</span>
        <h2 className="hero__title">{recommended?.title ?? "추천 상황을 고르는 중이에요"}</h2>
        <p className="hero__sub">{recommended && `${recommended.description}. 어떤 행동을 할지 연습해 보세요.`}</p>
        <img className="hero__bobber float" src="/images/bobber.png" alt="" />
        {recommended && (
          <Link href={`/roleplay?topic=${recommended.id}&entry=live`} className="btn btn--primary hero__btn">추천 훈련 시작하기</Link>
        )}
      </section>

      <div className="home__sections">
        <section>
          <div className="sec__head">
            <h3 className="sec__title">혼자 연습하기</h3>
            <Link href="/practice" className="sec__more">전체 보기</Link>
          </div>
          <div className="list">
            <Link href="/roleplay" className="list-row">
              <span className="list-row__icon"><img src="/images/icon-chat.png" alt="" width={32} height={32} /></span>
              <span className="list-row__text">
                <span className="list-row__title">문자·채팅 대응 훈련</span>
                <span className="list-row__desc">실전 훈련 · 상황별 연습</span>
              </span>
              <ChevronRight />
            </Link>
            <Link href="/roleplay/phone" className="list-row">
              <span className="list-row__icon"><img src="/images/icon-phone.png" alt="" width={32} height={32} /></span>
              <span className="list-row__text">
                <span className="list-row__title">AI 전화 대응 훈련</span>
                <span className="list-row__desc">말로 대응하고, 직접 끊고 확인하는 연습</span>
              </span>
              <ChevronRight />
            </Link>
            <Link href="/roleplay/case" className="list-row">
              <span className="list-row__icon"><img src="/images/fish-clipboard.png" alt="" width={32} height={32} /></span>
              <span className="list-row__text">
                <span className="list-row__title">사례로 배우기</span>
                <span className="list-row__desc">실제 사건을 되감아 안전한 대응을 배워요</span>
              </span>
              <ChevronRight />
            </Link>
            <Link href="/quiz" className="list-row">
              <span className="list-row__icon">
                <span className="ox-badges ox-badges--sm">
                  <span className="ox-badge" style={{ background: "var(--blue)" }}>O</span>
                  <span className="ox-badge" style={{ background: "var(--red)" }}>X</span>
                </span>
              </span>
              <span className="list-row__text">
                <span className="list-row__title">OX 퀴즈</span>
                <span className="list-row__desc">매번 새로운 10문제와 틀린 개념 복습</span>
              </span>
              <ChevronRight />
            </Link>
          </div>
        </section>

        <section>
          <div className="sec__head">
            <h3 className="sec__title">가족과 함께하기</h3>
          </div>
          <div className="list">
            <Link href="/invite" className="list-row">
              <span className="list-row__icon"><SendIcon /></span>
              <span className="list-row__text">
                <span className="list-row__title">가족에게 퀴즈 보내기</span>
                <span className="list-row__desc">카카오톡으로 도전장을 보내요</span>
              </span>
              <ChevronRight />
            </Link>
            <Link href="/family-practice" className="list-row">
              <span className="list-row__icon"><LockIcon /></span>
              <span className="list-row__text">
                <span className="list-row__title">우리 가족 안전 공유</span>
                <span className="list-row__desc">가족 암호와 공유한 연습 리포트를 한곳에서</span>
              </span>
              <ChevronRight />
            </Link>
          </div>
        </section>
      </div>
    </Screen>
  );
}
