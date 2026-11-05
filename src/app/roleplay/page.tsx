"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottomCTA, Header, Screen } from "@/components/ui";

/** 실전 대응 훈련 · 시작 전 안내 */
export default function RoleplayIntro() {
  const router = useRouter();
  return (
    <Screen>
      <Header title="실전 대응 훈련" back={() => router.replace("/home")} />
      <section className="screen__body">
        <img className="rp-intro__img" src="/images/fish-clipboard.png" alt="안내문을 든 뻐끄미" />
        <h2 className="rp-intro__title">시작 전에 확인해주세요</h2>
        <div className="rp-intro__blocks">
          <div>
            <p className="rp-intro__h">가상의 대화예요.</p>
            <p className="rp-intro__p">
              어떤 연락이 오더라도 안전하게 대응하는 연습이에요. 상대와 대화하면서 필요할 때 연락처·전화·앱을 직접 사용해 보세요. 모든 대화와 행동은 가상이며 실제 거래는 발생하지 않아요.
            </p>
          </div>
          <div>
            <p className="rp-intro__h">개인정보는 적지 마세요.</p>
            <p className="rp-intro__p">비밀번호, 주민등록번호, 계좌번호 등 실제 개인정보는 입력하지 마세요. 작성한 대화는 Gemini가 답변을 만들기 위해 처리합니다.</p>
          </div>
        </div>
      </section>
      <BottomCTA>
        <Link href="/roleplay/mode" className="btn btn--primary btn--lg" style={{ fontWeight: 600 }}>확인했어요</Link>
      </BottomCTA>
    </Screen>
  );
}
