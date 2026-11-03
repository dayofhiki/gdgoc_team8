"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PersonIcon } from "@/components/Icons";
import { BottomCTA, BottomSheet, Header, Progress, Screen } from "@/components/ui";
import { CHAT_MISSION, CHAT_SCRIPT, CHAT_TOTAL_STEPS, delayFor, type ChatEvent } from "@/lib/chatScript";

/** 채팅 연습(관찰형): 대화가 자동으로 흘러가고, 위험 순간마다 멈춰서 설명합니다. */
export default function ChatPractice() {
  const router = useRouter();
  const [shown, setShown] = useState(1); // 화면에 공개된 이벤트 수
  const [sheet, setSheet] = useState(false);

  const visible = CHAT_SCRIPT.slice(0, shown);
  const last = visible[visible.length - 1];
  const holding = last.kind === "danger" || last.kind === "end";
  const step = last.step;

  // 자동 진행
  useEffect(() => {
    if (sheet || holding || shown >= CHAT_SCRIPT.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), delayFor(last));
    return () => clearTimeout(t);
  }, [shown, sheet, holding, last]);

  // 새 메시지가 보이도록 스크롤
  useEffect(() => {
    if (shown > 1) window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, [shown]);

  const reachedMoments = useMemo(
    () => visible.filter((e): e is Extract<ChatEvent, { kind: "me" }> => e.kind === "me" && e.moment !== undefined).length,
    [visible],
  );
  const toReview = (stopped: boolean) =>
    router.push(`/roleplay/chat/review?r=${reachedMoments}${stopped ? "&stopped=1" : ""}`);

  return (
    <Screen>
      <Header title="채팅 연습" back={() => setSheet(true)} onClose={() => setSheet(true)} />
      <Progress value={step} total={CHAT_TOTAL_STEPS} dark />

      <section className="screen__body">
        {step === 1 && (
          <div className="stack" style={{ marginTop: 8, gap: 8 }}>
            <span className="chip">{CHAT_MISSION.chip}</span>
            <h2 className="title">{CHAT_MISSION.title}</h2>
          </div>
        )}

        <div className="chat-card" style={{ marginTop: step === 1 ? 36 : 8 }} aria-live="polite">
          {step === 1 && <p className="chat-card__sit">{CHAT_MISSION.situation}</p>}
          {visible.map((e, i) => {
            const isLast = i === visible.length - 1;
            switch (e.kind) {
              case "them":
                return (
                  <div className="msg" key={i}>
                    <span className="msg__avatar"><PersonIcon /></span>
                    <div className="msg__col">
                      {e.from && <span className="msg__from">{e.from}</span>}
                      <p className="bubble">{e.text}</p>
                      <span className="msg__time">{e.time}</span>
                    </div>
                  </div>
                );
              case "me":
                return (
                  <div className="msg msg--me" key={i}>
                    <p className="bubble bubble--me">{e.text}</p>
                    {e.photo && <div className="photo">{e.photo}</div>}
                    <span className="msg__time">{e.time}</span>
                    {e.tag && <span className="tag tag--red" style={{ marginTop: 4 }}>{e.tag}</span>}
                  </div>
                );
              case "typing":
                return isLast ? (
                  <div className={e.who === "me" ? "typing" : "typing typing--them"} key={i} aria-label="입력 중">
                    <i /><i /><i />
                  </div>
                ) : null;
              case "end":
                return <span className="sys-pill" key={i}>대화가 끝났어요</span>;
              default:
                return null;
            }
          })}
        </div>

        {last.kind === "danger" && (
          <div className="card card--red" style={{ marginTop: 20, animation: "rise .3s ease" }} role="alert">
            <p className="card__title">{last.title}</p>
            <p className="card__text--red">{last.text}</p>
          </div>
        )}
      </section>

      <BottomCTA>
        {last.kind === "danger" ? (
          <button className="btn btn--primary" onClick={() => setShown((n) => n + 1)}>이어서 보기</button>
        ) : last.kind === "end" ? (
          <button className="btn btn--primary" onClick={() => toReview(false)}>리뷰 보기</button>
        ) : (
          <button className="btn btn--gray" onClick={() => toReview(true)}>잠깐 멈추기</button>
        )}
      </BottomCTA>

      {sheet && (
        <BottomSheet onClose={() => setSheet(false)}>
          <div className="sheet__top">
            <div style={{ flex: 1 }}>
              <p className="sheet__title">연습을 중단하시겠어요?</p>
              <p className="sheet__text">{"얼마 안 남았어요!\n조금만 더 보면 오늘 훈련이 끝나요."}</p>
            </div>
            <img src="/images/fish-clipboard.png" alt="" width={72} height={66} />
          </div>
          <div className="sheet__btns">
            <button className="btn btn--gray" onClick={() => router.push("/home")}>그만할래요</button>
            <button className="btn btn--primary" onClick={() => setSheet(false)}>계속할게요</button>
          </div>
        </BottomSheet>
      )}
    </Screen>
  );
}
