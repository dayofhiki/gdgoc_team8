"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QuizRunner from "@/components/QuizRunner";
import { CHALLENGE_IDS } from "@/lib/quiz";

/** 가족에게 받은 초대 링크(도전장): /challenge?from=별명 → 가입 없이 3문제 */
function Challenge() {
  const from = useSearchParams().get("from")?.trim();
  const router = useRouter();
  useEffect(() => {
    if (!from) router.replace("/error/link");
  }, [from, router]);
  if (!from) return null;
  return <QuizRunner ids={CHALLENGE_IDS} from={from} />;
}

export default function Page() {
  return (
    <Suspense>
      <Challenge />
    </Suspense>
  );
}
