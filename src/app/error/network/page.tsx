"use client";
import { useBackNavigation } from "@/lib/backNavigation";
import { BottomCTA, Header, Screen } from "@/components/ui";

/** 오류 · 연결 불안정 (AI 호출 실패 시 이동할 화면) */
export default function NetworkError() {
  const goBack = useBackNavigation("/home");
  return (
    <Screen>
      <Header />
      <section className="screen__body">
        <div className="center" style={{ paddingTop: 98 }}>
          <h2 className="center__title">{"잠시 연결이\n원활하지 않아요."}</h2>
          <p className="center__desc">{"연습이 잘못된 건 아니에요. 잠시 후\n다시 시도하거나 준비된 문제로 계속해요."}</p>
          <div className="dots" aria-hidden>
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <BottomCTA>
        <button className="btn btn--primary" onClick={goBack}>다시 시도하기</button>
      </BottomCTA>
    </Screen>
  );
}
