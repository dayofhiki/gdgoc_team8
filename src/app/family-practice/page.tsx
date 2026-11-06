"use client";

import Link from "next/link";
import { Header, Screen } from "@/components/ui";
import FamilyCodeGuideContent from "@/components/FamilyCodeGuideContent";

export default function FamilyPractice() {
  return (
    <Screen>
      <Header title="우리 가족 안전 공유" back="/home" />
      <section className="screen__body family-practice">
        <section className="family-report__hero">
          <h2>가족의 대응 약속과 연습 기록</h2>
          <p>가족 확인 암호를 정하고, 가족이 공유한 연습 기록을 확인해요.</p>
          <Link href="/family-practice/report" className="btn btn--gray">
            가족 연습 리포트 보기
          </Link>
        </section>
        <section className="fb-subcard family-hub__code" aria-labelledby="family-code-title">
          <h2 id="family-code-title">우리 가족 암호</h2>
          <p>가족만 아는 질문을 정해 두고, 의심되는 연락은 원래 번호로 다시 확인해요.</p>
          <Link href="/family-code/question" className="btn btn--primary">암호 정하러 가기</Link>
          <Link href="/family-code/shared" className="btn btn--gray">저장한 가족 암호 보기</Link>
          <details className="fb-inline-disclosure">
            <summary>가족 암호를 사용하는 방법</summary>
            <FamilyCodeGuideContent />
          </details>
        </section>
      </section>
    </Screen>
  );
}
