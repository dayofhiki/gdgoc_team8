"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BottomCTA, Header, Screen } from "@/components/ui";
import { CHAT_MOMENTS, REMEMBER_CHAT } from "@/lib/chatScript";

const COUNT = ["", "한", "두", "세"];

function Review() {
  const router = useRouter();
  const params = useSearchParams();
  const reached = Math.min(Math.max(Number(params.get("r")) || 0, 0), CHAT_MOMENTS.length);
  const stopped = params.get("stopped") === "1";
  const moments = CHAT_MOMENTS.slice(0, reached);
  const fooled = moments.filter((m) => m.danger).length;

  const title = fooled > 0 ? `이 대화에서\n${COUNT[fooled] ?? fooled} 번 속았어요.` : "속기 전에\n잘 멈췄어요!";
  const desc =
    fooled > 0
      ? stopped
        ? "멈추기 전까지 어디서 속았는지 짚어볼게요."
        : "어디서 속았는지 다시 짚어볼게요."
      : "의심스러울 때 잠깐 멈추는 게 가장 좋은 대처예요.";

  return (
    <Screen>
      <Header back={() => router.push("/home")} />
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 20, gap: 8 }}>
          <h2 className="title">{title}</h2>
          <p className="desc">{desc}</p>
        </div>
        <div className="stack" style={{ marginTop: 64, gap: 20 }}>
          {moments.length > 0 && (
            <div className="card">
              <p className="card__title">위험했던 순간</p>
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
        <button className="btn btn--primary" onClick={() => router.push("/roleplay/chat")}>처음부터 다시 보기</button>
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
