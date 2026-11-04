"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/AppState";
import { BottomCTA, Screen } from "@/components/ui";
import { familyShareUrl, saveFamilyQuestion } from "@/lib/invite";
import { copyText } from "@/lib/share";

/** 가족 암호 · 완료 */
export default function FamilyCodeDone() {
  const { ready, familyQuestion, familyAnswer } = useAppState();
  const [reveal, setReveal] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const router = useRouter();

  // 공유 시트는 클릭 직후 바로 열려야 해서 질문 저장·가족 링크를 미리 준비
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (ready && !familyQuestion) router.replace("/family-code/question");
  }, [ready, familyQuestion, router]);

  useEffect(() => {
    if (!ready || !familyQuestion) return;
    let alive = true;
    saveFamilyQuestion(familyQuestion)
      .then(() => familyShareUrl(location.origin))
      .then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [ready, familyQuestion]);

  const shareWithFamily = async () => {
    const text = `우리 가족 확인 질문: ${familyQuestion}\n답은 메시지로 보내지 말고 직접 만나서 정해요.\n미끼주의보에서 함께 연습해요.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "우리 가족 암호", text, url });
        setShareMessage("가족에게 공유할 내용을 준비했어요.");
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    setShareMessage((await copyText(`${text}\n${url}`)) ? "질문과 링크를 복사했어요." : "공유하지 못했어요. 다시 시도해 주세요.");
  };

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
      {shareMessage && <div className="toast" role="status">{shareMessage}</div>}
      <BottomCTA row>
        <Link href="/home" className="btn btn--gray btn--lg" style={{ color: "var(--g800)" }}>홈으로</Link>
        <button className="btn btn--primary btn--lg" onClick={() => void shareWithFamily()} disabled={!url}>
          {url ? "가족에게 공유하기" : "링크 준비 중…"}
        </button>
      </BottomCTA>
    </Screen>
  );
}
