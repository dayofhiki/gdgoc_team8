"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header, Screen } from "@/components/ui";
import { familyOverview, setShareResults, type FamilyMemberSummary } from "@/lib/invite";

const day = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

export default function FamilyPractice() {
  const router = useRouter();
  const [members, setMembers] = useState<FamilyMemberSummary[] | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void familyOverview().then(setMembers); }, []);

  const self = members?.find(member => member.is_me);

  async function changeConsent(share: boolean) {
    if (!self || saving) return;
    setSaving(true);
    const ok = await setShareResults(share);
    if (ok) {
      setMembers(previous => previous?.map(member => member.is_me ? { ...member, share_results: share } : member));
    }
    setNotice(ok ? share ? "가족에게 연습 요약을 보여줘요." : "가족에게 연습 요약을 숨겼어요."
      : "설정을 저장하지 못했어요. 다시 시도해 주세요.");
    setSaving(false);
  }

  return (
    <Screen>
      <Header title="가족 연습 기록" back={() => router.replace("/home")} />
      <section className="screen__body family-practice">
        <p className="fb-note">가족이 공유를 켜면 최근 연습 주제와 대응 요약을 함께 볼 수 있어요. 대화 원문과 가족 확인 질문·답은 이 화면에서 공유되지 않아요.</p>
        {members === undefined && <p role="status">연습 기록을 불러오는 중이에요…</p>}
        {members === null && (
          <div className="fb-subcard">
            <p>가족에 연결한 뒤 연습 기록을 볼 수 있어요. 이미 연결했다면 잠시 후 다시 열어 주세요.</p>
            <Link href="/invite" className="btn btn--primary">가족 초대하기</Link>
          </div>
        )}
        {self && (
          <label className="list-row">
            <span className="list-row__text">
              <span className="list-row__title">가족에게 내 연습 결과 보여주기</span>
              <span className="list-row__desc">이전에 저장한 기록과 앞으로의 기록에 함께 적용돼요.</span>
            </span>
            <input type="checkbox" checked={self.share_results} disabled={saving}
              onChange={event => void changeConsent(event.target.checked)} />
          </label>
        )}
        {notice && <p role="status">{notice}</p>}
        {members?.map(member => (
          <section key={member.user_id} className="fb-subcard family-practice__member">
            <h2>{member.nickname || "가족"}{member.is_me ? " (나)" : ""}</h2>
            {member.record_count === null ? <p>연습 결과를 공유하지 않았어요.</p> :
              member.record_count === 0 ? <p>아직 연습 기록이 없어요.</p> : <>
                <p>총 {member.record_count}회 연습</p>
                <ul>
                  {member.recent?.map((record, index) => (
                    <li key={index}>
                      <strong>{record.title || (record.kind === "training" ? "실전 대응 훈련" : "퀴즈")}</strong>
                      <span>{day.format(new Date(record.created_at))} · {record.kind === "training"
                        ? record.safe === true ? "안전 행동 실천" : record.safe === false ? "복습할 행동 있음" : "연습 완료"
                        : record.score !== null && record.total !== null ? record.score + "/" + record.total : "연습 완료"}</span>
                    </li>
                  ))}
                </ul>
              </>}
          </section>
        ))}
        {members && members.length === 1 && <Link href="/invite" className="btn btn--secondary">가족 초대하기</Link>}
      </section>
    </Screen>
  );
}
