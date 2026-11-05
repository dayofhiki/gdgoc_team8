"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_REMEMBER, loadQuizProgress, pickQuiz, saveQuizProgress, type OX, type QuizItem } from "@/lib/quiz";

import { SHARED_FAMILY_CODE_PATH } from "@/lib/share";
import { saveRecord } from "@/lib/records";
import { BottomCTA, Dialog, Header, Progress, Screen } from "./ui";

type Props = {
  ids?: string[];
  /** 초대 링크(도전장)로 들어온 경우 보낸 사람 별명 */
  from?: string;
};

type Answer = { id: string; picked: OX; correct: boolean };

export default function QuizRunner({ ids, from }: Props) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [items, setItems] = useState(() => pickQuiz(ids, 0));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<OX | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintUsed, setHintUsed] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);

  const q = items[idx];
  const total = items.length;

  // 초기 렌더는 고정 시드, 마운트 후 무작위·취약점 복습 출제.
  useEffect(() => {
    const progress = loadQuizProgress();
    setItems(pickQuiz(ids, undefined, progress.wrongIds, progress.recentIds));
  }, [ids?.join(",")]);

  // 결과 화면에 도달하면 한 번만 기록 (StrictMode의 effect 2회 실행에도 1건)
  const saved = useRef(false);
  useEffect(() => {
    if (!done || saved.current) return;
    saved.current = true;
    if (!from) saveQuizProgress(answers, items);
    void saveRecord({
      kind: from ? "challenge" : "quiz",
      score: answers.filter((a) => a.correct).length,
      total: answers.length,
      detail: { wrong: answers.filter((a) => !a.correct).map((a) => a.id), hints: hintUsed.size },
    });
  }, [done, from, answers, hintUsed, items]);

  const choose = (v: OX) => {
    if (picked) return;
    setPicked(v);
    setAnswers((a) => [...a, { id: q.id, picked: v, correct: v === q.answer }]);
  };
  const next = () => {
    if (idx + 1 >= total) {
      setDone(true);
      return;
    }
    setIdx(idx + 1);
    setPicked(null);
  };
  const openHint = () => {
    setHintOpen(true);
    setHintUsed((s) => new Set(s).add(q.id));
  };

  const resetQuiz = (nextItems: QuizItem[], startImmediately: boolean) => {
    saved.current = false;
    setItems(nextItems);
    setStarted(startImmediately);
    setIdx(0);
    setPicked(null);
    setAnswers([]);
    setHintOpen(false);
    setHintUsed(new Set());
    setDone(false);
  };

  if (!started) {
    return (
      <Screen>
        <Header title="OX 퀴즈" back={() => router.push(from ? "/" : "/home")} />
        <section className="screen__body">
          <div className="stack" style={{ marginTop: 32, gap: 12 }}>
            <span className="chip">보이스피싱 대처 퀴즈</span>
            <h2 className="title">{"OX 퀴즈로\n사기 신호를 알아봐요"}</h2>
            <p className="desc">총 {total}문제예요. 문제를 읽고 맞으면 O, 틀리면 X를 선택해 주세요.</p>
          </div>
          <img src="/images/fish-ox.png" alt="O와 X 카드를 든 뻐끄미" style={{ alignSelf: "center", width: "min(74%, 260px)", marginTop: 30 }} />
          <div className="card card--blue" style={{ marginTop: 12 }}>
            <p className="card__title">퀴즈 진행 방법</p>
            <p className="card__text">정답을 고르면 바로 해설이 나와요. 어려우면 힌트를 볼 수 있고, 마지막에 결과를 확인할 수 있어요.</p>
          </div>
        </section>
        <BottomCTA><button className="btn btn--primary" onClick={() => setStarted(true)}>시작하기</button></BottomCTA>
      </Screen>
    );
  }

  if (done) {
    const right = answers.filter((a) => a.correct).length;
    const wrong = answers.filter((a) => !a.correct);
    const firstWrong = items.find((it) => it.id === wrong[0]?.id);
    const remember = firstWrong?.explanation ?? DEFAULT_REMEMBER;
    const retry = () => resetQuiz(pickQuiz(wrong.map(answer => answer.id)), true);
    const nextSet = () => {
      const progress = loadQuizProgress();
      resetQuiz(pickQuiz(undefined, undefined, progress.wrongIds, progress.recentIds), false);
    };
    return (
      <Screen>
        <Header back={() => router.push(from ? "/" : "/home")} />
        <section className="screen__body figma-quiz-result">
          <div className="figma-quiz-hero">
            <h2>OX 퀴즈를<br />모두 풀었어요!</h2>
            <p>{total}문제 중 <strong>{right}문제</strong>를 맞혔어요.</p>
          </div>
          <div className="figma-quiz-result-card">
            <h3>이번 퀴즈 결과</h3>
            <div className="figma-quiz-stat"><span>맞힌 문제</span><strong>{right}문제</strong></div>
            <div className="figma-quiz-stat figma-quiz-stat--wrong"><span>틀린 문제</span><strong>{wrong.length}문제</strong></div>
            <div className="figma-quiz-stat figma-quiz-stat--neutral"><span>힌트 사용</span><strong>{hintUsed.size}번</strong></div>
          </div>
          <div className="figma-quiz-remember">
            <h3>꼭 기억할 한 가지</h3>
            <p>{remember}</p>
          </div>
          {!from && <button type="button" className="figma-quiz-more" onClick={nextSet}>새 문제 10개 도전하기 ›</button>}
        </section>
        <BottomCTA row>
          {from ? (
            <>
              <button className="btn btn--gray" onClick={() => router.push(SHARED_FAMILY_CODE_PATH)}>가족 암호 보기</button>
              <button className="btn btn--primary" onClick={() => router.push("/")}>끝내기</button>
            </>
          ) : (
            <>
              <button className="btn btn--gray" onClick={() => router.push("/home")}>홈으로</button>
              <button className="btn btn--primary" onClick={wrong.length ? retry : nextSet}>
                {wrong.length ? "틀린 문제 다시 풀기" : "새 문제 10개"}
              </button>
            </>
          )}
        </BottomCTA>
      </Screen>
    );
  }

  const answered = picked !== null;
  const isCorrect = answered && picked === q.answer;
  const variant = !answered ? "default" : isCorrect ? "correct" : "wrong";

  const btnClass = (v: OX) => {
    const base = `ox-btn ox-btn--${v.toLowerCase()}`;
    if (!answered) return base;
    return v === q.answer ? `${base} ox-btn--answer` : `${base} ox-btn--faded`;
  };
  const tagFor = (v: OX) => {
    if (!answered) return null;
    if (v === q.answer) return <span className="tag tag--blue">{picked === v ? "내 선택 · 정답" : "정답"}</span>;
    if (picked === v) return <span className="tag tag--gray">내 선택</span>;
    return null;
  };

  return (
    <Screen variant={variant}>
      <Header title="OX 퀴즈" back={() => router.push(from ? "/" : "/home")} />
      <div style={{ padding: "20px 9px 0" }}>
        <Progress value={idx + 1} total={total} />
      </div>

      <section className="screen__body">
        <div className="quiz">
          <div className="quiz__card" key={q.id + String(answered)} style={{ animation: "pop .25s ease" }}>
            {!answered ? (
              <>
                <p className="quiz__eyebrow">문제 {idx + 1}</p>
                <p className="quiz__q">{q.question}</p>
              </>
            ) : (
              <>
                <p className={isCorrect ? "quiz__eyebrow" : "quiz__eyebrow quiz__eyebrow--red"}>{isCorrect ? "정답" : "오답"}</p>
                <p className="quiz__a">{isCorrect ? `맞아요! 정답은 ${q.answer}예요.` : `아쉬워요. 정답은 ${q.answer}예요.`}</p>
                <p className="quiz__exp">{q.explanation}</p>
              </>
            )}
            <div className="quiz__btns">
              {(["O", "X"] as OX[]).map((v) => (
                <div className="quiz__col" key={v}>
                  {answered && <div className="quiz__tagslot">{tagFor(v)}</div>}
                  <button className={btnClass(v)} onClick={() => choose(v)} disabled={answered} aria-label={v === "O" ? "O, 맞다" : "X, 아니다"}>
                    {v}
                  </button>
                </div>
              ))}
            </div>
          </div>
          {!answered && (
            <button className="quiz__hint" style={{ display: "block" }} onClick={openHint}>
              힌트 보기&nbsp;&nbsp;›
            </button>
          )}
        </div>
      </section>

      {answered && (
        <BottomCTA>
          <button className="btn btn--primary" onClick={next}>{idx + 1 >= total ? "결과 보기" : "다음 문제"}</button>
        </BottomCTA>
      )}

      {hintOpen && (
        <Dialog onClose={() => setHintOpen(false)}>
          <div>
            <p className="dialog__eyebrow">힌트</p>
            <p className="dialog__title">{q.hintTitle}</p>
            <p className="dialog__text">{q.hint}</p>
          </div>
          <button className="btn btn--primary" onClick={() => setHintOpen(false)}>문제로 돌아가기</button>
        </Dialog>
      )}
    </Screen>
  );
}
