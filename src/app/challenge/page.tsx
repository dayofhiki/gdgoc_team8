"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QuizRunner from "@/components/QuizRunner";
import { Screen } from "@/components/ui";
import { joinInvite } from "@/lib/invite";
import { CHALLENGE_IDS } from "@/lib/quiz";

/**
 * 가족에게 받은 초대 링크(도전장): /challenge?invite=토큰&from=별명 → 가입 없이 3문제
 * - invite 토큰이 있으면 Supabase(invite-join)로 확인: 없는 토큰·만료·정원 초과 → 링크 오류 화면
 * - 서버 연결이 안 되면 퀴즈는 그대로 진행 (문제는 기기 안에 있어서 서버 없이도 풀 수 있음)
 * - 토큰 없는 예전 링크(/challenge?from=별명)도 계속 동작
 */
function Challenge() {
  const params = useSearchParams();
  const from = params.get("from")?.trim() || "";
  const token = params.get("invite")?.trim() || "";
  const router = useRouter();
  const [checked, setChecked] = useState(!token);

  useEffect(() => {
    if (!from && !token) {
      router.replace("/error/link");
      return;
    }
    if (!token) return;
    let alive = true;
    joinInvite(token).then((r) => {
      if (!alive) return;
      if (r === "invalid") router.replace("/error/link");
      else setChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [from, token, router]);

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
