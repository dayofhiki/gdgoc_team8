"use client";
import Link from "next/link";
import { BottomCTA, Header, Screen } from "@/components/ui";

/** AI 상황극 · 시작 전 확인 */
export default function RoleplayIntro() {
  return (
    <Screen>
      <Header title="AI 상황극" />
      <section className="screen__body">
        <img className="rp-intro__img" src="/images/fish-clipboard.png" alt="안내문을 든 뻐끄미" />
        <h2 className="rp-intro__title">시작 전에 확인해주세요</h2>
        <div className="rp-intro__blocks">
          <div>
            <p className="rp-intro__h">가상의 대화예요.</p>
            <p className="rp-intro__p">
              선택하신 &apos;가족·지인 사칭&apos; 미션은 가상의 채팅 화면으로 연습합니다. 실제 통화·금융 거래는 연결되지 않아요.
            </p>
          </div>
          <div>
            <p className="rp-intro__h">개인정보는 적지 마세요.</p>
            <p className="rp-intro__p">비밀번호, 주민등록번호, 계좌번호 등 개인 정보는 요구하지 않아요.</p>
          </div>
        </div>
      </section>
      <BottomCTA>
        <Link href="/roleplay/mode" className="btn btn--primary btn--lg" style={{ fontWeight: 600 }}>확인했어요</Link>
      </BottomCTA>
    </Screen>
  );
}
