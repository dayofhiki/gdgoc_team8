"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomCTA, Header, Progress, Screen } from "@/components/ui";
import { ChevronRight } from "@/components/Icons";
import { CASE_STORIES, type CaseStory } from "@/lib/caseStories";

/** 공개된 실제 범행 사례/경보를 읽고, 시점을 되감아 다른 대응의 효과를 탐색한다. */
export default function CaseStudyPage() {
  const router = useRouter();
  const [story, setStory] = useState<CaseStory | null>(null);
  const [step, setStep] = useState(0);
  const [actionIndex, setActionIndex] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  const openStory = (next: CaseStory) => {
    setStory(next);
    setStep(0);
    setActionIndex(null);
    setFinished(false);
  };
  const backToList = () => {
    setStory(null);
    setFinished(false);
    setStep(0);
    setActionIndex(null);
  };
  const rewind = () => {
    if (!story) return;
    setStep(story.checkpoint);
    setActionIndex(null);
    setFinished(false);
  };
  const advance = () => {
    if (!story || step === story.checkpoint && actionIndex === null) return;
    if (step + 1 === story.events.length) setFinished(true);
    else setStep(step + 1);
  };

  if (!story) return (
    <Screen>
      <Header title="사례로 배우기" back="/home" />
      <section className="screen__body case-study-catalog">
        <span className="case-study-eyebrow">실제 경보와 피해 수법으로 배우는 예방 행동</span>
        <h2>실제로 있었던 일,<br />다음에는 막을 수 있도록</h2>
        <p className="case-study-lead">경찰청·KISA 등 공신력 있는 기관이 발표한 수법을 살펴보고, 사건의 중요한 순간으로 돌아가 다른 행동을 직접 선택해 보세요.</p>
        <div className="case-study-note">
          <strong>실제 자료와 가상 재구성을 구별해요.</strong>
          <p>공개자료로 확인한 범행 구조를 바탕으로 제작했습니다. 읽기 쉽게 바꾼 대사와 ‘그때 이렇게 했다면’ 결과는 교육용 가상 장면입니다.</p>
        </div>
        <div className="case-study-list" aria-label="사례 선택">
          {CASE_STORIES.map((item, i) => (
            <button key={item.id} type="button" className="case-study-list-card" onClick={() => openStory(item)}>
              <span className="case-study-meta">사건 기록 {String(i + 1).padStart(2, "0")} · {item.tag}</span>
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
              <span className="case-study-source">{item.source} · {item.date} <ChevronRight size={19}/></span>
            </button>
          ))}
        </div>
      </section>
    </Screen>
  );

  if (finished) {
    const selected = actionIndex === null ? null : story.actions[actionIndex];
    return (
      <Screen>
        <Header title="사건 되짚어보기" back={rewind} onClose={backToList} />
        <section className="screen__body case-study-detail">
          <span className="case-study-eyebrow">사건 기록 · 학습 완료</span>
          <h2>같은 상황,<br />다른 행동을 해봤어요</h2>
          <p className="case-study-lead">실제 자료가 설명한 범행 구조와 내가 선택한 가상의 대응을 비교해 보세요.</p>
          <section className="case-study-result case-study-result--actual">
            <span>공개된 수법에서 일어난 일</span>
            <h3>사기범이 설계한 경로</h3>
            <p>{story.actual}</p>
          </section>
          {selected && (
            <section className={"case-study-result " + (selected.safe ? "case-study-result--safe" : "case-study-result--risky")}>
              <span>내가 선택한 행동 · 교육용 가상 비교</span>
              <h3>{selected.label}</h3>
              <p>{selected.effect}</p>
              <p><strong>그다음에는:</strong> {selected.followUp}</p>
            </section>
          )}
          <section className="case-study-lesson">
            <span>이번 사건에서 꼭 기억할 것</span>
            <p>{story.lesson}</p>
          </section>
          <section className="case-study-proof">
            <h3>자료 출처와 재구성 기준</h3>
            <p>{story.sourceFact}</p>
            <p className="case-study-source-text">{story.sourceType} · {story.source} · {story.date}</p>
            <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer">기관 원문 자료 확인하기 ↗</a>
            <p className="case-study-footnote">사건의 개별 인물·대사는 교육용으로 바꿨습니다. 내가 개입해 바꾼 결과는 실제 사건에서 관찰된 결과가 아닙니다.</p>
          </section>
          <button className="case-study-rewind" type="button" onClick={rewind}>↶ 중요한 순간으로 다시 돌아가기</button>
        </section>
        <BottomCTA row>
          <button className="btn btn--gray" onClick={backToList}>다른 사례</button>
          <button className="btn btn--primary" onClick={() => router.push("/roleplay/chat?topic=" + story.topic)}>실전에서 연습</button>
        </BottomCTA>
      </Screen>
    );
  }

  const scene = story.events[step];
  const checkpoint = step === story.checkpoint;
  const selected = actionIndex === null ? null : story.actions[actionIndex];
  return (
    <Screen>
      <Header title="사례로 배우기" back={step === 0 ? backToList : () => setStep(n => Math.max(0,n-1))} onClose={backToList} />
      <Progress value={step + 1} total={story.events.length} dark />
      <section className="screen__body case-study-detail">
        <div className="case-study-case-top">
          <span className="case-study-eyebrow">{story.tag}</span>
          <h2>{story.title}</h2>
          <p>사건 기록 {step + 1}/{story.events.length} · {scene.kicker}</p>
        </div>
        <div className="case-study-episode">
          <span className="case-study-episode-label">{scene.speaker}</span>
          <p>{scene.text}</p>
        </div>
        <div className="case-study-context">
          <strong>사건을 살펴보면</strong>
          <p>{scene.note}</p>
        </div>

        {checkpoint && (
          <section className="case-study-intervene">
            <div className="case-study-intervene-title">
              <span>↶ 사건 되감기</span>
              <h3>그때 여기 있었다면 어떻게 행동했을까요?</h3>
              <p>OX 정답을 맞히는 문제가 아닙니다. 실제로 할 수 있는 행동을 선택해 결과의 차이를 살펴보세요.</p>
            </div>
            <div className="case-study-choices">
              {story.actions.map((a, i) => (
                <button key={a.label} type="button" className={"case-study-choice" + (actionIndex === i ? " case-study-choice--selected" : "")}
                  aria-pressed={actionIndex === i} onClick={() => setActionIndex(i)}>
                  <span aria-hidden="true">{actionIndex === i ? "✓" : "○"}</span>
                  <strong>{a.label}</strong>
                </button>
              ))}
            </div>
            {selected && (
              <div className={"case-study-consequence " + (selected.safe ? "case-study-consequence--safe" : "case-study-consequence--risky")}>
                <span>선택한 행동으로 달라질 수 있는 일</span>
                <p>{selected.effect}</p>
                <strong>다음 행동: {selected.followUp}</strong>
                <small>이 분기는 실제 사건이 아닌 교육용 가상 비교입니다. 다른 행동을 눌러 비교할 수도 있어요.</small>
              </div>
            )}
          </section>
        )}
        <div className="case-study-step-note" role="status">
          {checkpoint && actionIndex === null ? "먼저 행동을 하나 골라 주세요." : "다음 버튼을 누를 때까지 화면은 넘어가지 않아요."}
        </div>
      </section>
      <BottomCTA row>
        <button className="btn btn--gray" onClick={step === 0 ? backToList : () => setStep(n => Math.max(0,n-1))}>
          {step === 0 ? "사례 목록" : "이전 장면"}
        </button>
        <button className="btn btn--primary" onClick={advance} disabled={checkpoint && actionIndex === null}>
          {step + 1 === story.events.length ? "결과 비교" : "다음 장면"}
        </button>
      </BottomCTA>
    </Screen>
  );
}
