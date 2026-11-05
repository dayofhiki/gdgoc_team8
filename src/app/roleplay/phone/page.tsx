"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomCTA, Header, Screen } from "@/components/ui";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * 전화 연습 시작 화면.
 * 실제 ARS 발신·녹음·AI 분석은 아직 연동 전이라, 지금은 통화 시간만 재는 모의 통화입니다.
 */
export default function PhonePractice() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "calling" | "talking">("idle");
  const [sec, setSec] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (state !== "calling") return;
    const t = setTimeout(() => {
      started.current = Date.now() - 1000;
      setSec(1);
      setState("talking");
    }, 1800);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (state !== "talking") return;
    const t = setInterval(() => setSec(Math.floor((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [state]);

  const end = () => router.push(`/roleplay/phone/done?d=${sec}`);

  return (
    <Screen>
      <Header title="전화 체험 미리보기" back="/roleplay/mode" onClose={() => router.push("/home")} />
      <section className="screen__body">
        <div className="phone">
          <img
            src="/images/icon-phone.png"
            alt=""
            className={state === "idle" ? "phone__icon" : "phone__icon phone__icon--ring"}
          />
          {state === "idle" && (
            <>
              <p className="phone__title">{"통화 화면 미리보기예요.\n실제 전화·음성 AI 기능은 아직 준비 중이에요."}</p>
              <p className="phone__sub">음성 녹음이나 분석은 이루어지지 않아요.</p>
            </>
          )}
          {state === "calling" && <p className="phone__title">모의 통화 시작 중…</p>}
          {state === "talking" && (
            <>
              <p className="phone__title">모의 통화 화면</p>
              <p className="phone__timer" aria-live="off">{fmt(sec)}</p>
              <p className="phone__sub">실제 상대방과 연결되지 않았어요.</p>
            </>
          )}
        </div>
      </section>
      <BottomCTA>
        {state === "idle" ? (
          <button className="btn btn--primary btn--lg" onClick={() => setState("calling")}>모의 화면 체험</button>
        ) : (
          <button className="btn btn--primary" onClick={end} disabled={state === "calling"}>통화 끊기</button>
        )}
      </BottomCTA>
    </Screen>
  );
}
