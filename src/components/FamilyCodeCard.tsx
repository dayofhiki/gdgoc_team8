"use client";

import { useState } from "react";

export default function FamilyCodeCard({ question, answer }: { question: string; answer?: string }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="card">
      <p className="card__title card__title--bold">우리 가족 암호</p>
      <div className="kv">
        <span className="kv__k">질문</span>
        <span className="kv__v kv__v--semi" style={{ overflowWrap: "anywhere" }}>{question}</span>
      </div>
      {answer && (
        <div className="kv">
          <span className="kv__k">답</span>
          <button type="button" className="reveal" onClick={() => setReveal(value => !value)} aria-pressed={reveal}>
            {reveal ? answer : "●●●●●●"}
            <u>{reveal ? "숨기기" : "보기"}</u>
          </button>
        </div>
      )}
    </div>
  );
}
