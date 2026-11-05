"use client";

import { useState } from "react";
import { BottomSheet } from "./ui";
import type { PhoneMethod } from "@/lib/realTraining";

type Screen = "home" | "contacts" | "phone" | "apps" | "outcome";
type Topic = "family" | "delivery" | "bank";
type ActionChoice = "verify" | "verify_sender" | "family_contact";

type Props = {
  topic: Topic;
  onClose: () => void;
  onAction: (choice: ActionChoice, method: PhoneMethod) => Promise<string | undefined>;
  onStop: () => void;
  busy: boolean;
};

function Glyph({ kind, size = 24 }: { kind: "device" | "contacts" | "phone" | "apps" | "messages"; size?: number }) {
  const shared = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...shared}>
      {kind === "device" && <><rect x="6.5" y="2.5" width="11" height="19" rx="2.4"/><path d="M10.5 18.5h3"/></>}
      {kind === "contacts" && <><rect x="4" y="3" width="16" height="18" rx="2.8"/><circle cx="12" cy="9" r="2.3"/><path d="M7.7 16.2c.7-2.7 7.9-2.7 8.6 0M2 7h2M2 12h2M2 17h2"/></>}
      {kind === "phone" && <path d="M7.1 3.4 4.8 5.7c-1.1 1.1-.4 4.6 3.7 8.7s7.6 4.8 8.7 3.7l2.3-2.3a1.5 1.5 0 0 0-.3-2.3l-3.2-1.7a1.5 1.5 0 0 0-1.8.3l-1.1 1.1a13.9 13.9 0 0 1-5.2-5.2l1.1-1.1a1.5 1.5 0 0 0 .3-1.8L9.4 3.7a1.5 1.5 0 0 0-2.3-.3Z"/>}
      {kind === "apps" && <><rect x="3" y="3" width="7" height="7" rx="1.7"/><rect x="14" y="3" width="7" height="7" rx="1.7"/><rect x="3" y="14" width="7" height="7" rx="1.7"/><rect x="14" y="14" width="7" height="7" rx="1.7"/></>}
      {kind === "messages" && <path d="M5 4h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3Z"/>}
    </svg>
  );
}

export function TrainingPhoneIcon() {
  return <Glyph kind="device" size={23} />;
}

/**
 * 모의 휴대전화. 첫 화면에서 정답이나 신원 확인 동작을 직접 노출하지 않는다.
 * 기능을 연 뒤 실제 연락처/번호/앱을 고른 행동만 서버에 기록한다.
 */
export default function TrainingPhonePanel({ topic, onClose, onAction, onStop, busy }: Props) {
  const [screen, setScreen] = useState<Screen>("home");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const locked = busy || working;

  async function act(choice: ActionChoice, method: PhoneMethod) {
    if (locked) return;
    setWorking(true);
    setError("");
    try {
      const response = await onAction(choice, method);
      if (!response) throw new Error("기능 실행 결과를 확인하지 못했습니다.");
      setNotice(response);
      setScreen("outcome");
    } catch (e) {
      setError(e instanceof Error ? e.message : "동작을 처리하지 못했어요.");
    } finally {
      setWorking(false);
    }
  }

  function openInstalledApp(app: "bank_app" | "delivery_app") {
    if ((app === "bank_app" && topic !== "bank") || (app === "delivery_app" && topic !== "delivery")) {
      setNotice("이 앱에서는 현재 메시지에 해당하는 내용을 찾을 수 없어요.");
      setScreen("outcome");
      return;
    }
    void act("verify", app);
  }

  const tile = (kind: "contacts" | "phone" | "apps" | "messages", title: string, caption: string, action: () => void) => (
    <button type="button" className="rt-device-tile" key={kind} onClick={action} disabled={locked}>
      <span className="rt-device-tile-icon"><Glyph kind={kind} /></span>
      <strong>{title}</strong>
      <small>{caption}</small>
    </button>
  );
  const option = (key: string, title: string, description: string, action: () => void) => (
    <button key={key} type="button" className="rt-device-option" onClick={action} disabled={locked}>
      <span><strong>{title}</strong><small>{description}</small></span><span aria-hidden="true">›</span>
    </button>
  );

  const title = screen === "contacts" ? "연락처" : screen === "phone" ? "전화" :
    screen === "apps" ? "앱" : screen === "outcome" ? "기능 사용 결과" : "내 휴대전화";

  return (
    <BottomSheet onClose={locked ? undefined : onClose}>
      <div className="rt-device" aria-label="모의 휴대전화">
        <div className="rt-device-heading">
          {screen !== "home" ? (
            <button type="button" className="rt-device-back" onClick={() => { setError(""); setScreen("home"); }} disabled={locked} aria-label="휴대전화 홈으로">‹</button>
          ) : <span className="rt-device-head-icon"><Glyph kind="device" size={20} /></span>}
          <div><span className="rt-device-eyebrow">모의 휴대전화</span><h2>{title}</h2></div>
          <button type="button" className="rt-device-close" onClick={onClose} disabled={locked} aria-label="휴대전화 닫기">×</button>
        </div>

        {screen === "home" && (
          <>
            <p className="rt-device-description">필요한 기능을 직접 골라 사용할 수 있어요.</p>
            <div className="rt-device-grid">
              {tile("contacts", "연락처", "저장된 사람들", () => setScreen("contacts"))}
              {tile("phone", "전화", "최근 통화와 번호", () => setScreen("phone"))}
              {tile("apps", "앱", "설치된 앱", () => setScreen("apps"))}
              {tile("messages", "메시지", "현재 대화", onClose)}
            </div>
            <div className="rt-device-divider" />
            <button type="button" className="rt-device-stop" onClick={onStop} disabled={locked}>이 문자 대화 끝내기</button>
          </>
        )}
        {screen === "contacts" && (
          <div className="rt-device-options">
            {option("family", "저장된 가족 연락처", "평소 사용하던 연락처", () => void act("family_contact", "saved_family"))}
            {option("sender", "현재 문자 발신자", "이번에 메시지를 보낸 번호", () => void act("verify_sender", "recent_sender"))}
          </div>
        )}
        {screen === "phone" && (
          <div className="rt-device-options">
            {option("recent", "최근 문자 발신 번호", "지금 문자를 보낸 쪽으로 전화", () => void act("verify_sender", "recent_sender"))}
            {topic !== "family"
              ? option("official", "기관 번호 검색", "전화 앱의 연락처 검색", () => void act("verify", "official_directory"))
              : option("family", "기존 가족 연락처", "저장된 연락처로 전화", () => void act("family_contact", "saved_family"))}
          </div>
        )}
        {screen === "apps" && (
          <div className="rt-device-options">
            {option("bank", "은행 앱", "설치되어 있던 금융 앱", () => openInstalledApp("bank_app"))}
            {option("delivery", "택배 앱", "설치되어 있던 배송 앱", () => openInstalledApp("delivery_app"))}
            {option("message", "메시지", "지금 문자 대화로 이동", onClose)}
          </div>
        )}
        {screen === "outcome" && (
          <div className="rt-device-outcome" role="status">
            <p>{notice}</p>
            <div className="rt-device-outcome-actions">
              <button type="button" className="btn btn--primary" onClick={onClose}>문자로 돌아가기</button>
              <button type="button" className="btn btn--gray" onClick={() => setScreen("home")}>다른 기능 보기</button>
            </div>
          </div>
        )}
        {error && <p className="rt-device-error" role="alert">{error}</p>}
        <p className="rt-device-footnote">가상 화면입니다. 실제 전화나 앱 실행은 이루어지지 않습니다.</p>
      </div>
    </BottomSheet>
  );
}
