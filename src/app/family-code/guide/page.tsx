"use client";
import Link from "next/link";
import FamilyCodeGuideContent from "@/components/FamilyCodeGuideContent";
import { BottomCTA, Header, Screen } from "@/components/ui";

/** 가족 암호 · 소개 */
export default function FamilyCodeGuide() {
  return (
    <Screen>
      <Header title="가족 암호 정하기" small back="/family-practice" />
      <section className="screen__body screen__body--two">
        <div className="stack" style={{ marginTop: 28, gap: 8 }}>
          <h2 className="title">{"우리 가족만 아는\n암호를 정해요"}</h2>
          <p className="desc">{"가족만 아는 질문을 정해 두고,\n의심되는 연락은 원래 번호로 다시 확인해요."}</p>
        </div>
        <div className="stack" style={{ marginTop: 40, gap: 20 }}>
          <FamilyCodeGuideContent />
        </div>
      </section>
      <BottomCTA>
        <Link href="/family-code/question" className="btn btn--primary btn--lg">암호 정하러 가기</Link>
        <Link href="/family-code/shared" className="btn btn--gray">저장한 가족 암호 보기</Link>
      </BottomCTA>
    </Screen>
  );
}
