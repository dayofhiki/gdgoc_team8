"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/AppState";
import { BottomCTA, Screen } from "@/components/ui";

/** 가족 암호 · 완료 */
export default function FamilyCodeDone() {
  const { ready, familyQuestion, familyAnswer } = useAppState();
  const [reveal, setReveal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (ready && !familyQuestion) router.replace("/family-code/question");
  }, [ready, familyQuestion, router]);

  return (
    <Screen>
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 72, gap: 8 }}>
          <h2 className="title title--xl">{"우리 가족 암호가\n정해졌어요!"}</h2>
          <p className="desc" style={{ lineHeight: "24px" }}>{"이제 가족에게 질문을 보내고,\n답은 직접 만나서 알려주세요."}</p>
        </div>
        <div className="stack" style={{ marginTop: 40, gap: 20 }}>
          <div className="card">
            <p className="card__title card__title--bold">우리 가족 암호</p>
            <div className="kv">
              <span className="kv__k">질문</span>
              <span className="kv__v kv__v--semi">{familyQuestion}</span>
            </div>
            <div className="kv">
              <span className="kv__k">답</span>
              {familyAnswer ? (
                <button className="reveal" onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
                  {reveal ? familyAnswer : "●".repeat(Math.min(familyAnswer.length, 6))}
                  <u>{reveal ? "숨기기" : "보기"}</u>
                </button>
              ) : (
                <span className="kv__v kv__v--semi" style={{ color: "var(--g500)" }}>가족과 직접 정해요</span>
              )}
            </div>
          </div>
          <div className="card card--blue">
            <p className="card__title">모르는 번호로 돈 얘기가 나오면</p>
            <p className="card__text">먼저 이 질문을 물어보세요. 답이 다르면 바로 끊고 원래 번호로 확인해요.</p>
          </div>
        </div>
      </section>
      <BottomCTA row>
        <Link href="/home" className="btn btn--gray btn--lg" style={{ color: "var(--g800)" }}>홈으로</Link>
        <Link href="/invite" className="btn btn--primary btn--lg">가족에게 질문 보내기</Link>
      </BottomCTA>
    </Screen>
  );
}
