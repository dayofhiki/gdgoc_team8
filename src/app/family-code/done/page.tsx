"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/AppState";
import FamilyCodeCard from "@/components/FamilyCodeCard";
import ShareMessageSheet from "@/components/ShareMessageSheet";
import { BottomCTA, Screen } from "@/components/ui";
import { prepareFamilyCodeLink } from "@/lib/familyCode";
import { getInviteToken, saveFamilyQuestion } from "@/lib/invite";
import { shareWithDevice } from "@/lib/share";

export default function FamilyCodeDone() {
  const { ready, familyQuestion, familyAnswer } = useAppState();
  const [url, setUrl] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [manualShare, setManualShare] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (ready && !familyQuestion) router.replace("/family-code/question");
  }, [ready, familyQuestion, router]);

  // Prepare before the click so the device share sheet retains the user gesture.
  useEffect(() => {
    if (!ready || !familyQuestion || !familyAnswer) return;
    let alive = true;
    setUrl("");
    setLinkError(false);
    const prepare = async () => {
      await saveFamilyQuestion(familyQuestion);
      const invite = await getInviteToken();
      return prepareFamilyCodeLink(location.origin, { question: familyQuestion, answer: familyAnswer }, invite);
    };
    prepare()
      .then(link => { if (alive) setUrl(link); })
      .catch(() => { if (alive) setLinkError(true); });
    return () => { alive = false; };
  }, [ready, familyQuestion, familyAnswer, attempt]);

  const shareWithFamily = async () => {
    if (!url) return;
    const text = `우리 가족 암호\n질문: ${familyQuestion}\n답: ${familyAnswer}\n미끼주의보에서 가족 암호를 확인하고 저장해요.`;
    if (await shareWithDevice({ title: "우리 가족 암호", text, url }) === "unavailable") {
      setManualShare(`${text}\n${url}`);
    }
  };

  return (
    <Screen>
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 72, gap: 8 }}>
          <h2 className="title title--xl">{"우리 가족 암호가\n정해졌어요!"}</h2>
          <p className="desc" style={{ lineHeight: "24px" }}>가족에게 질문과 답을 함께 보내세요. 가족은 링크에서 암호를 확인하고 저장할 수 있어요.</p>
        </div>
        <div className="stack" style={{ marginTop: 40, gap: 20 }}>
          <FamilyCodeCard question={familyQuestion} answer={familyAnswer} />
          <div className="card card--blue">
            <p className="card__title">모르는 번호로 돈 얘기가 나오면</p>
            <p className="card__text">먼저 이 질문을 물어보세요. 답이 다르면 바로 끊고 원래 번호로 확인해요.</p>
          </div>
          <p className="desc">공유 메시지에는 답도 들어가요. 믿을 수 있는 가족에게만 보내 주세요.</p>
          {linkError && <p className="desc" role="alert">가족 암호 링크를 만들지 못했어요. 연결을 확인하고 다시 시도해 주세요.</p>}
        </div>
      </section>
      {manualShare && <ShareMessageSheet message={manualShare} onClose={() => setManualShare("")} />}
      <BottomCTA row>
        <Link href="/home" className="btn btn--gray btn--lg" style={{ color: "var(--g800)" }}>홈으로</Link>
        {ready && familyQuestion && !familyAnswer ? (
          <Link href="/family-code/answer" className="btn btn--primary btn--lg">답 다시 정하기</Link>
        ) : linkError ? (
          <button className="btn btn--primary btn--lg" onClick={() => setAttempt(value => value + 1)}>다시 시도하기</button>
        ) : (
          <button className="btn btn--primary btn--lg" onClick={() => void shareWithFamily()} disabled={!url}>
            {url ? "가족에게 공유하기" : "링크 준비 중…"}
          </button>
        )}
      </BottomCTA>
    </Screen>
  );
}
