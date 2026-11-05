"use client";
import Link from "next/link";
import { BottomCTA, Header, Screen } from "@/components/ui";

const STEPS = ["모르는 번호로 가족이 급하게 돈을 요청해요", "미리 정한 질문을 물어봐요", "답이 틀리면 끊고 원래 번호로 확인해요"];

/** 가족 암호 · 소개 */
export default function FamilyCodeGuide() {
  return (
    <Screen>
      <Header title="가족 암호 정하기" small />
      <section className="screen__body screen__body--two">
        <div className="stack" style={{ marginTop: 28, gap: 8 }}>
          <h2 className="title">{"우리 가족만 아는\n암호를 정해요"}</h2>
          <p className="desc">{"가족만 아는 질문을 정해 두고,\n의심되는 연락은 원래 번호로 다시 확인해요."}</p>
        </div>
        <div className="stack" style={{ marginTop: 40, gap: 20 }}>
          <div className="card">
            <p className="card__title card__title--bold">이렇게 써요</p>
            <ol className="steps" style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {STEPS.map((s, i) => (
                <li className="step" key={s}>
                  <span className="step__num">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
          <div className="card card--blue">
            <p className="card__title">암호는 가족끼리만 공유해요</p>
            <p className="card__text">질문과 답을 믿을 수 있는 가족과 공유해 두세요. 의심되는 연락에서는 답을 먼저 알려주지 마세요.</p>
          </div>
        </div>
      </section>
      <BottomCTA>
        <Link href="/family-code/question" className="btn btn--primary btn--lg">암호 정하러 가기</Link>
        <Link href="/family-code/shared" className="btn btn--gray">저장한 가족 암호 보기</Link>
      </BottomCTA>
    </Screen>
  );
}
