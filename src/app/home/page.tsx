"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/AppState";
import { ChevronRight, LockIcon, SendIcon } from "@/components/Icons";
import { Screen } from "@/components/ui";

export default function Home() {
  const { ready, nickname } = useAppState();
  const router = useRouter();
  useEffect(() => {
    if (ready && !nickname) router.replace("/onboarding");
  }, [ready, nickname, router]);

  return (
    <Screen>
      <div className="home__logo">
        <img src="/images/logo.svg" alt="미끼주의보" width={121} height={24} />
      </div>

      <section className="hero" aria-label="오늘의 추천 미션">
        <span className="hero__chip">오늘의 추천 미션</span>
        <h2 className="hero__title">{"엄마! 나 핸드폰이 망가져서\n카드 좀 빌려줘.."}</h2>
        <p className="hero__sub">익숙한 관계를 사칭하며 돈을 요청하는 상황</p>
        <img className="hero__bobber float" src="/images/bobber.png" alt="" />
        <Link href="/roleplay" className="btn btn--primary hero__btn">시작하기</Link>
      </section>

      <div className="home__sections">
        <section>
          <div className="sec__head">
            <h3 className="sec__title">혼자 연습하기</h3>
            <Link href="/roleplay" className="sec__more">전체 보기</Link>
          </div>
          <div className="grid2">
            <Link href="/roleplay" className="tile">
              <img src="/images/icon-chat.png" alt="" width={40} height={40} />
              <div>
                <p className="tile__title">AI 상황극</p>
                <p className="tile__desc">채팅·전화로 연습해요</p>
              </div>
            </Link>
            <Link href="/quiz" className="tile">
              <div className="ox-badges">
                <span className="ox-badge" style={{ background: "var(--blue)" }}>O</span>
                <span className="ox-badge" style={{ background: "var(--red)" }}>X</span>
              </div>
              <div>
                <p className="tile__title">OX 퀴즈</p>
                <p className="tile__desc">10문제로 실력 확인해요</p>
              </div>
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
            <Link href="/family-code/guide" className="list-row">
              <span className="list-row__icon"><LockIcon /></span>
              <span className="list-row__text">
                <span className="list-row__title">우리 가족 암호 정하기</span>
                <span className="list-row__desc">사칭 전화에 대비한 확인 질문</span>
              </span>
              <ChevronRight />
            </Link>
          </div>
        </section>
      </div>
    </Screen>
  );
}
