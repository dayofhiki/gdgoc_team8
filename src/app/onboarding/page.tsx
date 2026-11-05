"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_NICKNAME, useAppState } from "@/components/AppState";
import { BottomCTA, Progress, Screen } from "@/components/ui";

const TOTAL = 4;

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [nick, setNick] = useState("");
  const [nickFocused, setNickFocused] = useState(false);
  const { setNickname } = useAppState();
  const router = useRouter();
  // 가족 도전장 링크로 처음 온 경우: 끝나면 그 도전장으로 돌아감 (같은 사이트 경로만 허용)
  const [next, setNext] = useState("");
  useEffect(() => {
    const n = new URLSearchParams(location.search).get("next") ?? "";
    if (n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\")) setNext(n);
  }, []);

  // 별명은 필수: 공백만 입력한 경우도 시작할 수 없음
  const trimmed = nick.trim();
  const finish = (to: string) => {
    if (!trimmed) return;
    setNickname(trimmed);
    router.push(to);
  };

  return (
    <Screen variant="sky">
      <div style={{ height: 30 }} />
      <Progress value={step} total={TOTAL} />

      <section className="screen__body" key={step} style={{ animation: "fade .3s ease" }}>
        {step === 1 && (
          <>
            <div className="onb__copy" style={{ marginTop: 39 }}>
              <h2 className="onb__title">
                사기인지 모르는 순간에도{"\n"}
                <span className="hl">안전한 대응</span>을{"\n"}뻐끄미와 함께 연습해 봐요.
              </h2>
            </div>
            <div className="onb__art">
              <p className="onb__bubble">안녕하세요! 저는 뻐끄미예요</p>
              <img src="/images/fish-wave.png" alt="손을 흔드는 뻐끄미" className="float"
                style={{ position: "absolute", left: "50%", top: 128, width: 237, marginLeft: -118 }} />
              <span className="shadow-oval" style={{ left: "50%", marginLeft: -53, top: 341, width: 106 }} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="onb__copy" style={{ marginTop: 24 }}>
              <span className="chip chip--ghost">가족과 함께하기</span>
              <h2 className="onb__title">
                서로에게 <span className="hl">퀴즈를 보내고</span>
                {"\n"}
                <span className="hl">가족 암호</span>도 정해요.{"\n"}함께 연습하며 우리 가족을 지켜요.
              </h2>
            </div>
            <div className="onb__art">
              <img src="/images/fish-side.png" alt="" className="float"
                style={{ position: "absolute", left: 155, top: 71, width: 212 }} />
              <img src="/images/fish-purple.png" alt="" className="float float--delay"
                style={{ position: "absolute", left: 31, top: 180, width: 124 }} />
              <span className="shadow-oval" style={{ left: 60, top: 319, width: 66 }} />
              <span className="shadow-oval" style={{ left: 212, top: 319, width: 97 }} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="onb__copy" style={{ marginTop: 24 }}>
              <span className="chip chip--ghost">혼자 연습하기</span>
              <h2 className="onb__title">
                <span className="hl">퀴즈와 실전 대응 훈련</span>으로{"\n"}보이스피싱 대처법을 익혀요.{"\n"}내 속도에 맞춰 하나씩 도전해요.
              </h2>
            </div>
            <div className="onb__art">
              <img src="/images/fish-ox.png" alt="O X 카드를 든 뻐끄미" className="float"
                style={{ position: "absolute", left: "50%", top: 40, width: 303, marginLeft: -151 }} />
            </div>
          </>
        )}

        {step === 4 && (
          <div className="nick" style={{ paddingTop: 24, justifyContent: "flex-start" }}>
            <label htmlFor="nick" className="nick__label" style={{ marginTop: 16 }}>별명을 입력해주세요</label>
            <input
              id="nick"
              className="nick__input"
              value={nick}
              onChange={(e) => setNick(e.target.value.slice(0, 12))}
              placeholder={`예: ${DEFAULT_NICKNAME}`}
              autoComplete="off"
              onFocus={() => setNickFocused(true)}
              onBlur={() => setNickFocused(false)}
              enterKeyHint="done"
              aria-required="true"
            />
            {!nickFocused && <img src="/images/fish-side.png" alt="뻐끄미" className="float" style={{ marginTop: 36, width: 156, maxWidth: "46vw" }} />}
          </div>
        )}
      </section>

      {step < 4 ? (
        <BottomCTA>
          <button className="btn btn--primary btn--lg" style={{ fontWeight: 600 }} onClick={() => setStep(step + 1)}>
            다음으로
          </button>
        </BottomCTA>
      ) : next ? (
        <BottomCTA>
          <button className="btn btn--primary btn--lg" style={{ fontWeight: 600 }} disabled={!trimmed} onClick={() => finish(next)}>
            도전장 열기
          </button>
        </BottomCTA>
      ) : (
        <BottomCTA>
          <button className="btn btn--primary btn--lg" style={{ fontWeight: 600 }} disabled={!trimmed} onClick={() => finish("/home")}>
            나 혼자 시작하기
          </button>
          <button className="btn btn--outline" disabled={!trimmed} onClick={() => finish("/invite")}>
            가족과 함께 시작하기
          </button>
        </BottomCTA>
      )}
    </Screen>
  );
}
