"use client";
import Link from "next/link";
import { useBackNavigation } from "@/lib/backNavigation";
import { BottomCTA, Screen } from "@/components/ui";

/** 오류 · 초대 링크 만료/잘못됨 */
export default function LinkError() {
  const goBack = useBackNavigation("/invite");
  return (
    <Screen>
      <section className="screen__body">
        <div className="center">
          <h2 className="center__title">{"초대 링크를\n확인해 주세요."}</h2>
          <p className="center__desc">{"링크가 만료되었거나 잘못 입력된 것\n같아요. 당황하지 않으셔도 괜찮아요."}</p>
          <div className="dots" aria-hidden>
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <BottomCTA>
        <button className="btn btn--primary" onClick={goBack}>새 링크로 다시 들어가기</button>
        <Link href="/" className="btn btn--secondary">처음 화면으로</Link>
      </BottomCTA>
    </Screen>
  );
}
