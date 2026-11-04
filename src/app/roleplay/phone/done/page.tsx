"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BottomCTA, Header, Screen } from "@/components/ui";
import { REMEMBER_CHAT } from "@/lib/chatScript";
import { DEFAULT_NICKNAME, useAppState } from "@/components/AppState";

function Done() {
  const router = useRouter();
  const { nickname } = useAppState();
  const d = Math.max(0, Number(useSearchParams().get("d")) || 0);
  const duration = d >= 60 ? `${Math.floor(d / 60)}분 ${d % 60}초` : `${d}초`;

  return (
    <Screen>
      <Header back={() => router.push("/home")} />
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 20, gap: 8 }}>
          <h2 className="title">{"전화 훈련을\n마치셨어요!"}</h2>
          <p className="desc">{nickname || DEFAULT_NICKNAME}님의 통화 연습 결과</p>
          <p className="desc">사기범의 압박에서 빠져나오는 연습을 했어요.</p>
        </div>
        <div className="stack" style={{ marginTop: 64, gap: 20 }}>
          <div className="card">
            <p className="card__title">이번 연습에서 한 행동</p>
            <div className="kv"><span className="kv__k">총 통화 시간</span><span className="kv__v">{duration}</span></div>
            {/* AI 통화 분석 연동 전까지는 기본 안내 문구를 보여줍니다. */}
            <div className="kv"><span className="kv__k">대화 중단</span><span className="kv__v kv__v--red">하지 않았어요</span></div>
            <div className="kv"><span className="kv__k">다른 번호로 확인</span><span className="kv__v kv__v--blue">다음에 연습해요</span></div>
          </div>
          <div className="card card--blue">
            <p className="card__title">꼭 기억할 한 가지</p>
            <p className="card__text--blue">{REMEMBER_CHAT}</p>
          </div>
        </div>
      </section>
      <BottomCTA row>
        <button className="btn btn--gray" onClick={() => router.push("/home")}>홈으로</button>
        <button className="btn btn--primary" onClick={() => router.push("/roleplay/mode")}>다시 연습하기</button>
      </BottomCTA>
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Done />
    </Suspense>
  );
}
