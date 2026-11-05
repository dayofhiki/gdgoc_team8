"use client";

import { useState } from "react";
import { copyText } from "@/lib/share";
import { BottomSheet } from "./ui";

export default function ShareMessageSheet({ message, onClose }: { message: string; onClose: () => void }) {
  const [status, setStatus] = useState("");
  return (
    <BottomSheet onClose={onClose}>
      <div className="stack" style={{ gap: 14 }}>
        <h2 className="title">공유할 문구</h2>
        <p className="desc">아래 문구를 복사한 뒤 카카오톡 등 가족과 쓰는 대화창에 붙여넣으세요.</p>
        <textarea className="field__input" aria-label="복사할 공유 문구" rows={5} style={{ height: "auto", lineHeight: 1.5, paddingBlock: 10 }} readOnly value={message} />
        <button type="button" className="btn btn--primary" onClick={async () => {
          const copied = await copyText(message);
          setStatus(copied ? "문구와 링크를 복사했어요." : "복사가 안 되면 위 문구를 길게 눌러 복사해 주세요.");
        }}>공유 문구 복사</button>
        <button type="button" className="btn btn--gray" onClick={onClose}>닫기</button>
        <p className="desc" role="status">{status}</p>
      </div>
    </BottomSheet>
  );
}
