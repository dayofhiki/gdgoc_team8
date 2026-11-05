"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/AppState";
import { LockIcon } from "@/components/Icons";
import { BottomCTA, Header, Progress, Screen } from "@/components/ui";

/** 가족 암호 · 답 정하기 (답은 저장하지 않음: 메모리에만 보관) */
export default function FamilyCodeAnswer() {
  const { ready, familyQuestion, familyAnswer, setFamilyAnswer } = useAppState();
  const router = useRouter();
  const [answer, setAnswer] = useState(familyAnswer);

  useEffect(() => {
    if (ready && !familyQuestion) router.replace("/family-code/question");
  }, [ready, familyQuestion, router]);

  const submit = () => {
    if (!answer.trim()) return;
    setFamilyAnswer(answer.trim());
    router.push("/family-code/done");
  };

  return (
    <Screen>
      <Header title="가족 암호 정하기" small />
      <div style={{ paddingTop: 4 }}>
        <Progress value={2} total={3} label={false} />
      </div>
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 22, gap: 8 }}>
          <span className="chip chip--lg">가족 암호 정하기</span>
          <h2 className="title" style={{ lineHeight: "34px" }}>답을 정해 주세요</h2>
          <p className="desc">{"가족이 바로 떠올릴 수 있게\n짧게 정하면 좋아요."}</p>
        </div>

        <div className="stack" style={{ marginTop: 24, gap: 24 }}>
          <div className="card card--blue" style={{ padding: "18px 20px", gap: 4 }}>
            <p style={{ fontSize: 13, fontWeight: 700, lineHeight: "18px", color: "var(--blue)" }}>선택한 질문</p>
            <p style={{ fontSize: 16, fontWeight: 600, lineHeight: "22px" }}>{familyQuestion}</p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="answer">답</label>
            <input
              id="answer"
              className="field__input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value.slice(0, 20))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="예: 콩이"
              autoComplete="off"
              autoFocus
              enterKeyHint="next"
            />
            <p className="field__help">띄어쓰기 없이 한두 단어로 정하면 기억하기 쉬워요.</p>
          </div>
          <div className="notice">
            <LockIcon size={18} color="#8B95A1" filled />
            <span>{"답은 저장하지 않고,\n가족에게도 보내지 않아요."}</span>
          </div>
        </div>
      </section>
      <BottomCTA>
        <button className="btn btn--primary btn--lg" onClick={submit} disabled={!answer.trim()}>
          다음
        </button>
      </BottomCTA>
    </Screen>
  );
}
