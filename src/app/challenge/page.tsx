"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QuizRunner from "@/components/QuizRunner";
import { useAppState } from "@/components/AppState";
import { BottomCTA, Screen } from "@/components/ui";
import { joinInvite } from "@/lib/invite";
import { CHALLENGE_IDS } from "@/lib/quiz";

/**
 * 가족에게 받은 초대 링크(도전장): /challenge?invite=토큰&from=별명 → 가입 없이 3문제
 * - invite 토큰이 있으면 Supabase(invite-join)로 확인: 없는 토큰·만료·정원 초과 → 링크 오류 화면
 * - 서버 연결이 안 되면 퀴즈는 그대로 진행 (문제는 기기 안에 있어서 서버 없이도 풀 수 있음)
 * - 토큰 없는 예전 링크(/challenge?from=별명)도 계속 동작
 * - 가족 링크는 별명이 없으면 먼저 물어봄 (가족 목록에 누구인지 보이도록)
 */
function Challenge() {
  const params = useSearchParams();
  const from = params.get("from")?.trim() || "";
  const token = params.get("invite")?.trim() || "";
  const router = useRouter();
  const { ready, nickname, setNickname } = useAppState();
  const [checked, setChecked] = useState(!token);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!from && !token) {
      router.replace("/error/link");
      return;
    }
    if (!token || !ready || !nickname) return;
    let alive = true;
    joinInvite(token).then((r) => {
      if (!alive) return;
      if (r === "invalid") router.replace("/error/link");
      else setChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [from, token, router, ready, nickname]);

  if (token && ready && !nickname) {
    const submit = () => name.trim() && setNickname(name.trim());
    return (
      <Screen>
        <section className="screen__body">
          <div className="nick" style={{ paddingTop: 72, justifyContent: "flex-start" }}>
            <label htmlFor="nick" className="nick__label" style={{ whiteSpace: "pre-line", textAlign: "center" }}>{`${from || "가족"}님이 보낸 도전장이에요.
가족에게 보일 이름을 알려주세요`}</label>
            <input
              id="nick"
              className="nick__input"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 12))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="예: 엄마"
              autoComplete="off"
              enterKeyHint="done"
              aria-required="true"
            />
          </div>
        </section>
        <BottomCTA>
          <button className="btn btn--primary" onClick={submit} disabled={!name.trim()}>시작하기</button>
        </BottomCTA>
      </Screen>
    );
  }
  if ((!from && !token) || !checked) return <Screen variant="sky">{null}</Screen>;
  return <QuizRunner ids={CHALLENGE_IDS} from={from || "가족"} />;
}

export default function Page() {
  return (
    <Suspense>
      <Challenge />
    </Suspense>
  );
}
