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
        <span className="hero__chip">오늘의 추천 미션</span>
        <h2 className="hero__title">{recommended?.title ?? "추천 상황을 고르는 중이에요"}</h2>
        <p className="hero__sub">{recommended && recommended.description}</p>
        <img className="hero__bobber float" src="/images/bobber.png" alt="" />
        {recommended && (
          <Link href={`/roleplay?topic=${recommended.id}&entry=live`} className="btn btn--primary hero__btn">시작하기</Link>
        )}
      </section>
      <div className="home__sections">
        <section>
          <div className="sec__head">
            <h3 className="sec__title">혼자 연습하기</h3>
            <Link href="/practice" className="sec__more">전체 보기</Link>
          </div>
          <div className="grid2 home-practice-grid">
            <Link href="/roleplay" className="tile home-practice-tile">
              <span className="home-practice-icon home-practice-icon--chat">
                <img src="/images/icon-chat.png" alt="" width={36} height={36} />
              </span>
              <span className="home-practice-title">AI 상황극</span>
              <span className="home-practice-description">채팅·전화로 연습해요</span>
            </Link>
            <Link href="/quiz" className="tile home-practice-tile">
              <span className="home-practice-icon home-practice-icon--quiz" aria-hidden="true">
                <span className="ox-badges ox-badges--sm">
                  <span className="ox-badge" style={{ background: "var(--blue)" }}>O</span>
                  <span className="ox-badge" style={{ background: "var(--red)" }}>X</span>
                </span>
              </span>
              <span className="home-practice-title">OX 퀴즈</span>
              <span className="home-practice-description">10문제로 실력 확인해요</span>
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
