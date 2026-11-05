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
      <Header title="상황별 연습" back={() => router.replace("/roleplay/mode")} />
      <section className="screen__body rt-select-page">
        <div className="rt-select-heading">
          <span className="chip">상황별 연습 · {TRAINING_TOPICS.length}가지 상황</span>
          <h2>연습하고 싶은 상황을 골라보세요</h2>
          <p>가족 연락부터 택배·금융 안내까지, 다양한 상황에서 안전하게 대응하는 방법을 연습할 수 있어요.</p>
        </div>
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
          {selected ? TRAINING_TOPICS.find(t => t.id === selected)?.title + " 연습 시작" : "연습할 상황을 선택해 주세요"}
        </button>
      </BottomCTA>
    </Screen>
  );
}
