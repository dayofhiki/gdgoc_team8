"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import QuizRunner from "@/components/QuizRunner";

function QuizPage() {
  const ids = useSearchParams().get("ids") ?? "";
  // 직접 링크로 들어온 문제 목록이 바뀌면 별도의 퀴즈로 시작한다.
  return <QuizRunner key={ids} ids={ids ? ids.split(",") : undefined} />;
}

export default function Page() {
  return (
    <Suspense>
      <QuizPage />
    </Suspense>
  );
}
