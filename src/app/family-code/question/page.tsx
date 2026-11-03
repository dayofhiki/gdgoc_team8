"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/AppState";
import { CheckCircle, PlusIcon } from "@/components/Icons";
import { BottomCTA, Header, Notice, Progress, Screen } from "@/components/ui";

const PRESETS = ["처음 키운 반려동물 이름은?", "가족 여행으로 처음 간 곳은?", "어릴 때 집에서 부르던 내 별명은?"];

/** 가족 암호 · 질문 고르기 */
export default function FamilyCodeQuestion() {
  const { familyQuestion, setFamilyQuestion } = useAppState();
  const router = useRouter();
  const isCustomSaved = familyQuestion !== "" && !PRESETS.includes(familyQuestion);
  const [selected, setSelected] = useState<string>(isCustomSaved ? "custom" : familyQuestion || PRESETS[0]);
  const [custom, setCustom] = useState(isCustomSaved ? familyQuestion : "");

  const question = selected === "custom" ? custom.trim() : selected;
  const submit = () => {
    if (!question) return;
    setFamilyQuestion(question);
    router.push("/family-code/answer");
  };

  return (
    <Screen>
      <Header title="가족 암호 정하기" small />
      <div style={{ paddingTop: 4 }}>
        <Progress value={1} total={3} label={false} />
      </div>
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 22, gap: 8 }}>
          <span className="chip chip--lg">가족 암호 정하기</span>
          <h2 className="title" style={{ lineHeight: "34px", letterSpacing: "-0.4px" }}>어떤 질문으로 확인할까요?</h2>
          <p className="desc" style={{ letterSpacing: "-0.4px" }}>{"가족만 답할 수 있고, 다른 사람은\n찾아볼 수 없는 질문이 좋아요."}</p>
        </div>

        <div className="stack" style={{ marginTop: 32, gap: 10 }} role="radiogroup" aria-label="확인 질문">
          {PRESETS.map((p) => {
            const on = selected === p;
            return (
              <button
                key={p}
                role="radio"
                aria-checked={on}
                className={on ? "option option--q option--selected" : "option option--q"}
                onClick={() => setSelected(p)}
              >
                <span className="option__label">{p}</span>
                {on ? <CheckCircle /> : <span className="radio" />}
              </button>
            );
          })}
          {selected === "custom" ? (
            <div className="option option--q option--selected" style={{ padding: "8px 17px 8px 19px" }}>
              <input
                className="option__label"
                style={{ border: 0, outline: "none", background: "transparent", height: 46, color: "var(--blue)", minWidth: 0 }}
                value={custom}
                onChange={(e) => setCustom(e.target.value.slice(0, 40))}
                placeholder="질문을 직접 적어 주세요"
                autoFocus
                aria-label="직접 만든 질문"
              />
              <CheckCircle />
            </div>
          ) : (
            <button className="option option--q option--dashed" onClick={() => setSelected("custom")}>
              <PlusIcon />
              <span className="option__label">직접 질문 만들기</span>
            </button>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <Notice>생일·전화번호처럼 알려진 정보는 피해 주세요.</Notice>
        </div>
      </section>
      <BottomCTA>
        <button className="btn btn--primary btn--lg" onClick={submit} disabled={!question}>
          이 질문으로 할게요
        </button>
      </BottomCTA>
    </Screen>
  );
}
