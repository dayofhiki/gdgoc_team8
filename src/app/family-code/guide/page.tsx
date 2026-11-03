"use client";
import Link from "next/link";
import { BottomCTA, Header, Screen } from "@/components/ui";

const STEPS = ["모르는 번호로 가족이 급하게 돈을 요청해요", "미리 정한 질문을 물어봐요", "답이 틀리면 끊고 원래 번호로 확인해요"];

/** 가족 암호 · 소개 */
export default function FamilyCodeGuide() {
  return (
    <Screen>
      <Header title="가족 암호 정하기" small />
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 28, gap: 8 }}>
          <h2 className="title">{"우리 가족만 아는\n암호를 정해요"}</h2>
          <p className="desc">{"사칭 전화가 오면 이 질문 하나로\n진짜 가족인지 확인할 수 있어요."}</p>
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
            <p className="card__title">답은 메시지로 주고받지 않아요</p>
            <p className="card__text">답은 가족과 직접 만나거나 통화로 정해요. 앱은 질문만 가족에게 보내드려요.</p>
          </div>
        </div>
      </section>
      <BottomCTA>
        <Link href="/family-code/question" className="btn btn--primary btn--lg">암호 정하러 가기</Link>
      </BottomCTA>
    </Screen>
  );
}
