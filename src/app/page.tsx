"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppState } from "@/components/AppState";
import { Screen } from "@/components/ui";

/** 진입점: 별명이 있으면 홈, 없으면 온보딩으로 보냅니다. */
export default function Entry() {
  const { ready, nickname } = useAppState();
  const router = useRouter();
  useEffect(() => {
    if (ready) router.replace(nickname ? "/home" : "/onboarding");
  }, [ready, nickname, router]);
  return <Screen variant="sky">{null}</Screen>;
}
