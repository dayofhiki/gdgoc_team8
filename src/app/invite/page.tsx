"use client";
import { useEffect, useState } from "react";
import { DEFAULT_NICKNAME, useAppState } from "@/components/AppState";
import { ClockIcon } from "@/components/Icons";
import { BottomCTA, Header, Notice, Screen } from "@/components/ui";
import { getInviteToken } from "@/lib/invite";
import { copyText } from "@/lib/share";

export default function Invite() {
  const { nickname } = useAppState();
  const name = nickname || DEFAULT_NICKNAME;
  const [toast, setToast] = useState("");
  // 초대 토큰은 화면에 들어올 때 미리 준비 (공유 시트·복사는 클릭 직후 바로 실행돼야 해서)
  const [token, setToken] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(true);

  useEffect(() => {
    let alive = true;
    getInviteToken().then((t) => {
      if (!alive) return;
      setToken(t);
      setPreparing(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const link = () =>
    `${location.origin}/challenge?${token ? `invite=${token}&` : ""}from=${encodeURIComponent(name)}`;
  const message = `${name}님이 보이스피싱 대처 연습에 초대했어요. 가입 없이 퀴즈 3문제, 1분이면 끝나요!`;

  // 카카오 SDK(JavaScript 키 필요) 연동 전까지는 기기의 공유 시트를 사용합니다.
  const shareKakao = async () => {
    const url = link();
    if (navigator.share) {
      try {
        await navigator.share({ title: "미끼주의보 도전장", text: message, url });
      } catch {
        /* 사용자가 공유를 취소한 경우 */
      }
      return;
    }
    setToast((await copyText(`${message}\n${url}`)) ? "공유 문구와 링크를 복사했어요" : "링크를 복사하지 못했어요");
  };
  const copyLink = async () => setToast((await copyText(link())) ? "링크를 복사했어요" : "링크를 복사하지 못했어요");

  return (
    <Screen>
      <Header />
      <section className="screen__body screen__body--two">
        <h2 className="title" style={{ marginTop: 10 }}>가족을 연습에 초대해요</h2>

        <div className="invite__preview" aria-label="카카오톡 초대장 미리보기">
          <span className="invite__avatar">뻐</span>
          <div className="share-card">
            <div className="share-card__img">
              <img src="/images/fish-side.png" alt="" width={81} />
            </div>
            <div className="share-card__body">
              <p className="share-card__title">뻐끄미가 초대장을 보냈어요</p>
              <p className="share-card__desc">{name}님이 보이스피싱 대처 연습에 초대했어요.</p>
              <div className="share-card__line" />
              <p className="share-card__meta"><ClockIcon />퀴즈 3문제, 1분이면 끝나요</p>
              <div className="share-card__btn">가입 없이 도전하기</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 31 }}>
          <Notice dark>가입이나 앱 설치 없이, 링크만 누르면 바로 시작해요.</Notice>
        </div>
      </section>

      {toast && <div className="toast" role="status">{toast}</div>}

      <BottomCTA>
        <button className="btn btn--kakao" onClick={shareKakao} disabled={preparing}>
          {preparing ? "링크 준비 중…" : "카카오톡 공유하기"}
        </button>
        <button className="btn btn--muted" onClick={copyLink} disabled={preparing}>링크 복사하기</button>
      </BottomCTA>
    </Screen>
  );
}
