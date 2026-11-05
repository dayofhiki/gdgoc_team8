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
      <Header back="/roleplay/phone" />
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 20, gap: 8 }}>
          <h2 className="title">{"전화 화면 미리보기를\n마치셨어요!"}</h2>
          <p className="desc">{nickname || DEFAULT_NICKNAME}님의 통화 연습 결과</p>
          <p className="desc">아직 음성 통화나 행동 분석은 진행되지 않았습니다.</p>
        </div>
        <div className="stack" style={{ marginTop: 64, gap: 20 }}>
          <div className="card">
            <p className="card__title">모의 화면 체험 정보 (훈련 점수 아님)</p>
            <div className="kv"><span className="kv__k">총 통화 시간</span><span className="kv__v">{duration}</span></div>
            {/* AI 통화 분석 연동 전까지는 기본 안내 문구를 보여줍니다. */}
            <div className="kv"><span className="kv__k">AI 대화 분석</span><span className="kv__v">진행되지 않음</span></div>
            <div className="kv"><span className="kv__k">실제 통화</span><span className="kv__v">없음</span></div>
          </div>
          <div className="card card--blue">
            <p className="card__title">꼭 기억할 한 가지</p>
            <p className="card__text--blue">{REMEMBER_CHAT}</p>
          </div>
        </div>
      </section>
      <BottomCTA row>
        <button className="btn btn--gray" onClick={() => router.replace("/home")}>홈으로</button>
        <button className="btn btn--primary" onClick={() => router.replace("/roleplay/mode")}>다시 연습하기</button>
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
