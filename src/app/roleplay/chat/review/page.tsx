"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BottomCTA, Header, Screen } from "@/components/ui";
import { CHAT_MOMENTS, REMEMBER_CHAT } from "@/lib/chatScript";
import { DEFAULT_NICKNAME, useAppState } from "@/components/AppState";

function Review() {
  const router = useRouter();
  const { nickname } = useAppState();
  const params = useSearchParams();
  const reached = Math.min(Math.max(Number(params.get("r")) || 0, 0), CHAT_MOMENTS.length);
  const stopped = params.get("stopped") === "1";
  const moments = CHAT_MOMENTS.slice(0, reached);
  const title = "사례 속 위험 신호를\n되짚어 볼까요?";
  const desc = stopped
    ? "사례를 중단한 지점까지 위험 신호를 살펴봐요."
    : "사례 속 인물이 놓친 위험 신호를 살펴봐요.";

  return (
    <Screen>
      <Header back={() => router.push("/home")} />
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 20, gap: 8 }}>
          <h2 className="title">{title}</h2>
          <p className="desc">{nickname || DEFAULT_NICKNAME}님이 살펴본 사례</p>
          <p className="desc">{desc}</p>
          <p className="desc" style={{ fontSize: 13 }}>관찰형 사례는 본인의 행동을 평가한 결과가 아니에요. 실전 대응 훈련에서 직접 행동해 보세요.</p>
        </div>
        <div className="stack" style={{ marginTop: 64, gap: 20 }}>
          {moments.length > 0 && (
            <div className="card">
              <p className="card__title">사례 속 위험했던 순간</p>
              {moments.map((m) => (
                <div className="kv" key={m.time}>
                  <span className="kv__k">{m.time}</span>
                  <span className={m.danger ? "kv__v kv__v--red" : "kv__v"}>{m.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="card card--blue">
            <p className="card__title">꼭 기억할 한 가지</p>
            <p className="card__text--blue">{REMEMBER_CHAT}</p>
          </div>
        </div>
      </section>
      <BottomCTA row>
        <button className="btn btn--gray" onClick={() => router.push("/home")}>홈으로</button>
        <button className="btn btn--primary" onClick={() => router.push("/roleplay/case")}>사례 다시 보기</button>
      </BottomCTA>
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Review />
    </Suspense>
  );
}
