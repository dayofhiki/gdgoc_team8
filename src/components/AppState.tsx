"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { syncFamilyNickname } from "@/lib/invite";

/**
 * 앱 전역 상태.
 * - 별명, 가족 암호 "질문"은 이 브라우저(localStorage)에 저장합니다.
 * - 가족 암호 "답"은 기획상 저장하지 않으므로 메모리에만 두고, 새로고침하면 사라집니다.
 */
type State = {
  ready: boolean;
  nickname: string;
  setNickname: (v: string) => void;
  familyQuestion: string;
  setFamilyQuestion: (v: string) => void;
  familyAnswer: string;
  setFamilyAnswer: (v: string) => void;
};

const KEY_NICK = "mikki:nickname";
const KEY_QUESTION = "mikki:family-question";
export const DEFAULT_NICKNAME = "똑똑한 물고기";

const Ctx = createContext<State | null>(null);

function read(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* 저장 불가 환경(시크릿 모드 등)은 무시 */
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [nickname, setNick] = useState("");
  const [familyQuestion, setQ] = useState("");
  const [familyAnswer, setFamilyAnswer] = useState("");

  useEffect(() => {
    setNick(read(KEY_NICK));
    setQ(read(KEY_QUESTION));
    setReady(true);
  }, []);

  const setNickname = useCallback((v: string) => {
    setNick(v);
    write(KEY_NICK, v);
    void syncFamilyNickname(v);
  }, []);
  const setFamilyQuestion = useCallback((v: string) => {
    setQ(v);
    write(KEY_QUESTION, v);
  }, []);

  const value = useMemo(
    () => ({ ready, nickname, setNickname, familyQuestion, setFamilyQuestion, familyAnswer, setFamilyAnswer }),
    [ready, nickname, setNickname, familyQuestion, setFamilyQuestion, familyAnswer],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used inside AppStateProvider");
  return v;
}
