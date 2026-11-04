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
      <Header title="전화 연습" onClose={() => router.push("/home")} />
      <section className="screen__body">
        <div className="phone">
          <img
            src="/images/icon-phone.png"
            alt=""
            className={state === "idle" ? "phone__icon" : "phone__icon phone__icon--ring"}
          />
          {state === "idle" && (
            <>
              <p className="phone__title">{"ARS로 전화가 갈 거에요\n전화를 받은 뒤 대화를 시작해주세요"}</p>
              <p className="phone__sub">ai 분석을 위해 통화 내용이 녹음됩니다.</p>
            </>
          )}
          {state === "calling" && <p className="phone__title">연습 전화를 거는 중이에요…</p>}
          {state === "talking" && (
            <>
              <p className="phone__title">연습 통화 중</p>
              <p className="phone__timer" aria-live="off">{fmt(sec)}</p>
              <p className="phone__sub">수상하면 언제든 끊어도 괜찮아요.</p>
            </>
          )}
        </div>
      </section>
      <BottomCTA>
        {state === "idle" ? (
          <button className="btn btn--primary btn--lg" onClick={() => setState("calling")}>전화 시작하기</button>
        ) : (
          <button className="btn btn--primary" onClick={end} disabled={state === "calling"}>통화 끊기</button>
        )}
      </BottomCTA>
    </Screen>
  );
}
