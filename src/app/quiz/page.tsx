"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import QuizRunner from "@/components/QuizRunner";

function QuizPage() {
  const ids = useSearchParams().get("ids") ?? "";
  // key: "틀린 문제 다시 풀기"로 같은 경로에 다시 들어와도 상태를 새로 시작
  return <QuizRunner key={ids} ids={ids ? ids.split(",") : undefined} />;
}

export default function Page() {
  return (
    <Suspense>
      <QuizPage />
    </Suspense>
  );
}
