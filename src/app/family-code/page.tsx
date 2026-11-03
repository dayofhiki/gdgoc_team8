"use client";
import Link from "next/link";
import { BottomCTA, Screen } from "@/components/ui";

/** "가족과 함께 시작하기"로 들어왔을 때 보이는 가족 암호 인트로 */
export default function FamilyCodeIntro() {
  return (
    <Screen variant="sky">
      <section className="screen__body">
        <div className="intro">
          <img src="/images/fish-family.png" alt="뻐끄미 가족" width={180} height={165} className="float" />
          <h2 className="intro__title">{"가족인 척하는 연락,\n우리만의 질문으로 확인해요"}</h2>
          <p className="intro__sub">가족들만 아는 내용의 질문을 만들고 공유해요</p>
        </div>
      </section>
      <BottomCTA row>
        <Link href="/home" className="btn btn--gray">홈으로</Link>
        <Link href="/family-code/guide" className="btn btn--primary">암호 정하러 가기</Link>
      </BottomCTA>
    </Screen>
  );
}
