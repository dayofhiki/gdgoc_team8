"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { DEFAULT_NICKNAME, useAppState } from "@/components/AppState";
import FamilyCodeCard from "@/components/FamilyCodeCard";
import { BottomCTA, Header, Screen } from "@/components/ui";
import { readFamilyCode, savedFamilyCodes, storeFamilyCode } from "@/lib/familyCode";
import { configured, currentFirebaseUser, ensureAnon } from "@/lib/firebase";
import { familyQuestions, joinInvite } from "@/lib/invite";

type DisplayCode = { id: string; question: string; answer?: string };
type Content =
  | { status: "loading" | "invalid" | "offline" }
  | { status: "ready"; codes: DisplayCode[] };

export default function SharedFamilyCode() {
  const { ready, nickname, setNickname } = useAppState();
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  const [token, setToken] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [content, setContent] = useState<Content>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [savedToken, setSavedToken] = useState("");
  const saved = token !== "" && token === savedToken;
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const update = () => setToken(new URLSearchParams(location.hash.slice(1)).get("code") ?? "");
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    currentFirebaseUser()
      .then(user => { if (alive) setUid(nickname ? user?.uid ?? null : null); })
      .catch(() => { if (alive) setUid(null); });
    return () => { alive = false; };
  }, [ready, nickname]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    setContent({ status: "loading" });
    setNotice("");
    const load = async (): Promise<DisplayCode[]> => {
      if (token) return [{ id: "shared", ...await readFamilyCode(token) }];
      const stored = savedFamilyCodes(uid);
      const [codes, questions] = await Promise.all([
        Promise.all(stored.map(async ({ id, token: storedToken }) => {
          try {
            return { id, ...await readFamilyCode(storedToken) };
          } catch (error) {
            if (error instanceof Error && error.message === "LINK_INVALID") return null;
            throw error;
          }
        })),
        familyQuestions(),
      ]);
      const validCodes = codes.filter(code => code !== null);
      const savedQuestions = new Set(validCodes.map(code => code.question));
      return [...validCodes, ...(questions ?? []).filter(item => !savedQuestions.has(item.question))];
    };
    load().then(codes => {
      if (alive) setContent({ status: "ready", codes });
    }).catch((error: unknown) => {
      if (!alive) return;
      setContent({ status: error instanceof Error && error.message === "LINK_INVALID" ? "invalid" : "offline" });
    });
    return () => { alive = false; };
  }, [attempt, token, uid]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    const name = (nicknameInput || nickname).trim();
    if (!name || busy) return;
    setBusy(true);
    setNotice("");
    try {
      await ensureAnon();
      const user = await currentFirebaseUser();
      if (!user) throw new Error("LOGIN_REQUIRED");
      setNickname(name);
      setUid(user.uid);
    } catch {
      setNotice("로그인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!uid || !token || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const invite = await storeFamilyCode(uid, token);
      setSavedToken(token);
      setNotice("이 기기에 가족 암호를 저장했어요.");
      if (invite) void joinInvite(invite);
    } catch {
      setNotice("저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (uid === null) {
    return (
      <Screen>
        <Header title="미끼주의보 로그인" back="/family-practice" />
        <form id="family-code-login" className="screen__body" onSubmit={login}>
          <div className="stack" style={{ marginTop: 32, gap: 16 }}>
            <h2 className="title">가족 암호를 보려면 로그인해 주세요</h2>
            <p className="desc">별명으로 로그인하면 받은 링크의 가족 암호를 바로 열 수 있어요.</p>
            <div className="field">
              <label className="field__label" htmlFor="family-code-nickname">별명</label>
              <input id="family-code-nickname" className="field__input" maxLength={12}
                placeholder={nickname || DEFAULT_NICKNAME} autoComplete="nickname"
                value={nicknameInput} onChange={event => setNicknameInput(event.target.value)} />
            </div>
            {!configured() && <p className="desc" role="alert">지금은 로그인에 연결할 수 없어요. 잠시 후 다시 열어 주세요.</p>}
            {notice && <p className="desc" role="alert">{notice}</p>}
          </div>
        </form>
        <BottomCTA>
          <button type="submit" form="family-code-login" className="btn btn--primary"
            disabled={busy || !configured() || !(nicknameInput || nickname).trim()}>
            {busy ? "로그인 중…" : "별명으로 로그인"}
          </button>
        </BottomCTA>
      </Screen>
    );
  }

  const codes = content.status === "ready" ? content.codes : [];
  const title = content.status === "loading" ? "가족 암호를 불러오고 있어요" :
    content.status === "invalid" ? "이 공유 링크는 사용할 수 없어요" :
    content.status === "offline" ? "가족 암호를 불러오지 못했어요" :
    codes.length ? "우리 가족 암호" : "저장한 가족 암호가 없어요";
  const detail = content.status === "invalid" ? "가족에게 새 링크를 보내 달라고 해 주세요." :
    content.status === "offline" ? "연결을 확인한 뒤 다시 시도해 주세요." :
    codes.length ? "의심스러운 연락이 오면 가족끼리 정한 질문을 사용해 보세요." :
    content.status === "ready" ? "가족에게 받은 링크를 열고 암호를 저장하면 여기서 다시 볼 수 있어요." : "";

  return (
    <Screen>
      <Header title="가족 암호 보기" back="/family-practice" />
      <section className="screen__body">
        <div className="stack" style={{ marginTop: 28, gap: 16 }}>
          <h2 className="title" aria-live="polite">{title}</h2>
          {detail && <p className="desc">{detail}</p>}
          {codes.map(code => <FamilyCodeCard key={code.id} question={code.question} answer={code.answer} />)}
          {codes.length > 0 && (
            <div className="card card--blue">
              <p className="card__title">가족이 맞는지 따로 확인해요</p>
              <p className="card__text">의심되는 연락에 답을 알려주지 말고 원래 저장된 가족 번호로 다시 전화해요.</p>
            </div>
          )}
          {notice && <p className="desc" role="status">{notice}</p>}
        </div>
      </section>
      <BottomCTA>
        {content.status === "offline" ? (
          <button type="button" className="btn btn--primary" onClick={() => setAttempt(n => n + 1)}>다시 불러오기</button>
        ) : token && codes.length > 0 && !saved ? (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save()}>이 암호 저장하기</button>
        ) : (
          <Link className="btn btn--primary" href={saved ? "/family-code/shared" : "/home"} onClick={() => { if (saved) setToken(""); }}>
            {saved ? "저장한 가족 암호 보기" : "홈으로"}
          </Link>
        )}
      </BottomCTA>
    </Screen>
  );
}
