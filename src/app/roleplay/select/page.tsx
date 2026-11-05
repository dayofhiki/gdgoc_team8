"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomCTA, Header, Screen } from "@/components/ui";
import { TRAINING_TOPICS, type TrainingTopicId } from "@/lib/trainingCatalog";

/**
 * 주제만 공개한다. 같은 주제에서 실제 연락인지 사칭인지는
 * 서버가 매번 무작위로 정하므로 사용자가 진입 화면에서 추측할 수 없다.
 */
export default function SelectTrainingTopic() {
  const router = useRouter();
  const [selected, setSelected] = useState<TrainingTopicId | null>(null);
  const categories = ["가족·지인", "생활 문자", "금융", "공공기관"];
  return (
    <Screen>
      <Header title="대화 상황 선택" back={() => router.replace("/roleplay/mode")} />
      <section className="screen__body rt-select-page">
        <div className="rt-select-heading">
          <span className="chip">실전 대화 · {TRAINING_TOPICS.length}가지 주제</span>
          <h2>어떤 상황부터 연습할까요?</h2>
          <p>직접 고르거나, 추천 상황을 받아보세요. 상대가 진짜인지는 대화와 행동으로 확인해야 해요.</p>
        </div>
        <button type="button" className="rt-select-random" onClick={() => router.push("/roleplay/chat")}>
          <span className="rt-select-random-mark" aria-hidden="true">↻</span>
          <span><strong>추천 상황으로 바로 시작</strong><small>9가지 중 하나를 무작위로 골라줘요.</small></span>
          <span className="rt-select-chevron" aria-hidden="true">›</span>
        </button>
        <p className="rt-select-separator">또는 직접 선택</p>
        <div className="rt-select-categories" role="group" aria-label="훈련 상황 목록">
          {categories.map(category => (
            <section className="rt-select-category" key={category} aria-label={category}>
              <h3>{category}</h3>
              <div className="rt-select-list">
                {TRAINING_TOPICS.filter(t => t.category === category).map(topic => {
                  const on = selected === topic.id;
                  return (
                    <button type="button" key={topic.id}
                      className={"rt-select-item" + (on ? " rt-select-item--selected" : "")}
                      aria-pressed={on}
                      onClick={() => setSelected(topic.id)}>
                      <span className="rt-select-dot" aria-hidden="true">{on ? "✓" : ""}</span>
                      <span className="rt-select-copy">
                        <strong>{topic.title}</strong>
                        <small>{topic.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <p className="rt-select-disclaimer">실제 사례의 유형을 참고한 가상 훈련입니다. 개인정보나 실제 돈은 주고받지 않아요.</p>
      </section>
      <BottomCTA>
        <button type="button" className="btn btn--primary" disabled={!selected}
          onClick={() => selected && router.push("/roleplay/chat?topic=" + encodeURIComponent(selected))}>
          {selected ? TRAINING_TOPICS.find(t => t.id === selected)?.title + " 연습하기" : "연습할 상황을 선택해 주세요"}
        </button>
      </BottomCTA>
    </Screen>
  );
}
