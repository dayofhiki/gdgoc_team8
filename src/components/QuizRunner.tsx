"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_REMEMBER, pickQuiz, type OX } from "@/lib/quiz";
import { BottomCTA, Dialog, Header, Progress, Screen } from "./ui";

type Props = {
  ids?: string[];
  /** 초대 링크(도전장)로 들어온 경우 보낸 사람 별명 */
  from?: string;
};

type Answer = { id: string; picked: OX; correct: boolean };

export default function QuizRunner({ ids, from }: Props) {
  const router = useRouter();
  const items = useMemo(() => pickQuiz(ids), [ids]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<OX | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintUsed, setHintUsed] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);

  const q = items[idx];
  const total = items.length;

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

  if (done) {
    const right = answers.filter((a) => a.correct).length;
    const wrong = answers.filter((a) => !a.correct);
    const firstWrong = items.find((it) => it.id === wrong[0]?.id);
    const remember = firstWrong?.explanation ?? DEFAULT_REMEMBER;
    const retry = () => {
      const q = wrong.map((w) => w.id).join(",");
      router.push(`/quiz?ids=${q}`);
    };
    return (
      <Screen>
        <Header back={() => router.push(from ? "/" : "/home")} />
        <section className="screen__body">
          <div className="stack" style={{ marginTop: 20, gap: 8 }}>
            <h2 className="title">{"OX 퀴즈를\n모두 풀었어요!"}</h2>
            <p className="desc">
              {total}문제 중 {right}문제를 맞혔어요.
            </p>
          </div>
          <div className="stack" style={{ marginTop: 64, gap: 20 }}>
            <div className="card">
              <p className="card__title">이번 퀴즈 결과</p>
              <div className="kv"><span className="kv__k">맞힌 문제</span><span className="kv__v kv__v--blue">{right}문제</span></div>
              <div className="kv"><span className="kv__k">틀린 문제</span><span className="kv__v kv__v--red">{wrong.length}문제</span></div>
              <div className="kv"><span className="kv__k">힌트 사용</span><span className="kv__v">{hintUsed.size}번</span></div>
            </div>
            <div className="card card--blue">
              <p className="card__title">꼭 기억할 한 가지</p>
              <p className="card__text--blue">{remember}</p>
            </div>
          </div>
        </section>
        <BottomCTA row>
          <button className="btn btn--gray" onClick={() => router.push(from ? "/" : "/home")}>
            {from ? "시작하기" : "홈으로"}
          </button>
          {wrong.length > 0 ? (
            <button className="btn btn--primary" onClick={retry}>틀린 문제 다시 풀기</button>
          ) : (
            <button className="btn btn--primary" onClick={() => router.push(from ? "/" : "/roleplay")}>
              {from ? "나도 연습해 보기" : "AI 상황극 하러 가기"}
            </button>
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
