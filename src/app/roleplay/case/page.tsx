"use client";

import { useEffect, useRef, useState } from "react";
import { BottomCTA, Header, Progress, Screen } from "@/components/ui";
import { ChevronRight, ShieldIcon } from "@/components/Icons";
import { CASE_STORIES, type CaseStory } from "@/lib/caseStories";
import { CASE_EXPERIENCES } from "@/lib/caseExperience";

type Phase = "scene" | "outcome" | "debrief";

/** 실제 공개 수법을 읽어 주는 대신, 사건 속 휴대전화 조작과 선택의 결과로 체험한다. */
export default function CaseStudyPage() {
  const [story, setStory] = useState<CaseStory | null>(null);
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("scene");
  const scene = useRef<HTMLElement>(null);

  useEffect(() => {
    if (phase === "debrief") {
      window.scrollTo(0, 0);
      scene.current?.querySelector("h2")?.focus({ preventScroll: true });
    }
    else if (step > 0 || phase === "outcome") {
      scene.current?.querySelector("[data-current-event]")?.scrollIntoView({ block: "nearest" });
    }
  }, [phase, step]);

  const showList = () => {
    setStory(null);
    setStep(0);
    setChoice(null);
    setPhase("scene");
  };
  const openStory = (selected: CaseStory) => {
    setStory(selected);
    setStep(0);
    setChoice(null);
    setPhase("scene");
  };
  const goBack = () => {
    if (phase === "debrief") { setPhase("outcome"); return; }
    if (phase === "outcome") { showList(); return; }
    if (step > 0) { setStep(step - 1); return; }
    showList();
  };

  if (!story) {
    return (
      <Screen>
        <Header title="사례로 배우기" back="/home" />
        <section className="screen__body case-play-catalog">
          <div className="case-play-hero">
            <span>실제로 알려진 사기 수법</span>
            <h2>그때 나라면<br />어떻게 했을까요?</h2>
            <p>사건을 따라가다가, 직접 행동해 보세요.</p>
          </div>
          <div className="case-play-library">
            {CASE_STORIES.map((item, index) => (
              <button className="case-play-library-item" key={item.id} type="button" onClick={() => openStory(item)}>
                <span className="case-play-library-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="case-play-library-copy">
                  <small>{item.tag}</small>
                  <strong>{item.title}</strong>
                  <span>{item.source} 발표 기반</span>
                </span>
                <ChevronRight size={21} />
              </button>
            ))}
          </div>
          <p className="case-play-disclaimer">기관이 발표한 범행 수법을 교육용으로 재구성했어요. 실제 피해자 대화 원문은 아니에요.</p>
        </section>
      </Screen>
    );
  }

  const experience = CASE_EXPERIENCES[story.id];
  const choiceData = choice === null ? null : story.actions[choice];
  const choiceView = choice === null ? null : experience.actions[choice];
  const isCheckpoint = step === story.checkpoint;

  if (phase === "debrief") {
    return (
      <Screen>
        <Header title="사건 되짚어보기" back={goBack} onClose={showList} />
        <section className="screen__body case-play-summary" ref={scene}>
          <div className="case-play-summary-heading">
            <span className="case-play-kicker">다른 대응과 결과 비교</span>
            <h2 tabIndex={-1}>{story.title}</h2>
          </div>
          <div className="case-play-comparison" aria-label="행동별 결과">
            {[choice, ...story.actions.map((_, i) => i).filter(i => i !== choice)].map(i => {
              if (i === null) return null;
              const action = story.actions[i];
              const view = experience.actions[i];
              return (
                <article key={i} className={`case-play-my-route ${action.safe ? "case-play-my-route--safe" : "case-play-my-route--risk"}`}>
                  <span className="case-play-kicker">{i === choice ? "내가 고른 행동" : "이렇게 했다면"}</span>
                  <h3>{view.label}</h3>
                  <p>{view.outcome}</p>
                </article>
              );
            })}
          </div>
          <div className="case-play-takeaway">
            <span aria-hidden="true"><ShieldIcon /></span>
            <div>
              <strong>다음엔 이렇게 기억해요</strong>
              <p>{story.lesson}</p>
            </div>
          </div>
          <details className="case-play-sources">
            <summary>실제 발표 내용과 자료 출처 보기</summary>
            <p>{experience.riskPath.join(" → ")}</p>
            <p>{story.sourceFact}</p>
            <p>{story.actual}</p>
            <p>{story.sourceType} · {story.source} · {story.date}</p>
            <a href={story.sourceUrl} target="_blank" rel="noopener noreferrer">기관 원문 자료 확인하기 ↗</a>
            <small>대화와 내 선택의 결과는 교육용으로 재구성했습니다. 특정 피해자의 실제 행동을 재현한 것은 아니에요.</small>
          </details>
        </section>
        <BottomCTA>
          <button type="button" className="btn btn--primary" onClick={showList}>다른 사례 보기</button>
        </BottomCTA>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="사례로 배우기" back={goBack} onClose={showList} />
      <Progress value={phase === "outcome" ? story.checkpoint + 2 : step + 1} total={story.checkpoint + 2} dark={false} label={false} />
      <section className="screen__body case-play-scene" ref={scene}>
        <div className="case-play-scene-head">
          <span className="case-play-kicker">{story.tag}</span>
          <h2>{story.title}</h2>
          <p>기관 공개 수법 기반 · 교육용 상황</p>
        </div>

        <div className="case-play-device" aria-label="사건을 재구성한 휴대전화 화면">
          <div className="case-play-device-status"><span>9:41</span><span aria-hidden="true">●●● ▰</span></div>
          <div className="case-play-device-contact">
            <span className="case-play-avatar" aria-hidden="true">✉</span>
            <div><strong>문자 메시지</strong><small>가상 대화</small></div>
          </div>
          <div className="case-play-thread" role="log" aria-live="polite" aria-relevant="additions">
            {story.events.slice(0, step + 1).map((event, i) => (
              <div className={"case-play-message " + (event.surface ? `case-play-event--${event.surface}` :
                event.speaker === "받는 사람" ? "case-play-message--mine" : "")} key={i}
                data-current-event={phase === "scene" && i === step ? "" : undefined}>
                <span>{event.speaker}</span>
                <p>{event.text}</p>
              </div>
            ))}
            {phase === "outcome" && choiceData && choiceView && (
              <>
                <div className="case-play-action-confirm">
                  <div><small>내 휴대전화에서 실행한 행동</small><strong>{choiceView.label}</strong></div>
                </div>
                <div data-current-event className={"case-play-device-result " + (choiceData.safe ? "case-play-device-result--safe" : "case-play-device-result--risk")}>
                  <strong>{choiceData.safe ? "이렇게 대응했어요" : "이런 위험이 생길 수 있어요"}</strong>
                  <p>{choiceView.outcome}</p>
                  {!choiceData.safe && <small>{choiceData.followUp}</small>}
                </div>
              </>
            )}
          </div>
        </div>

        {phase === "scene" && isCheckpoint && (
          <section className="case-play-action-tray" aria-label="휴대전화에서 실행할 행동">
            <span className="case-play-kicker">선택할 순간</span>
            <h3>지금, 어떻게 하시겠어요?</h3>
            <div className="case-play-action-options">
              {experience.actions.map((action, i) => (
                <button key={action.label} type="button" onClick={() => { setChoice(i); setPhase("outcome"); }}
                  className="case-play-action-option">
                  <strong>{action.label}</strong>
                  <ChevronRight size={19} />
                </button>
              ))}
            </div>
          </section>
        )}
        {phase === "scene" && !isCheckpoint && (
          <p className="case-play-prompt">대화를 확인했으면 다음 메시지를 눌러 주세요.</p>
        )}
        {phase === "outcome" && (
          <p className="case-play-prompt">이 선택과 다른 대응의 결과를 비교해 보세요.</p>
        )}
      </section>

      {phase === "outcome" ? (
        <BottomCTA>
          <button type="button" className="btn btn--primary" onClick={() => setPhase("debrief")}>다른 대응과 비교</button>
        </BottomCTA>
      ) : !isCheckpoint ? (
        <BottomCTA row>
          <button type="button" className="btn btn--gray" onClick={goBack}>{step === 0 ? "사례 목록" : "이전 장면"}</button>
          <button type="button" className="btn btn--primary" onClick={() => setStep(n => Math.min(story.checkpoint, n + 1))}>다음 메시지</button>
        </BottomCTA>
      ) : null}
    </Screen>
  );
}
