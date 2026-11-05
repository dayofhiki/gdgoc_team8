"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header, Screen } from "@/components/ui";
import { TRAINING_TOPICS } from "@/lib/trainingCatalog";
import { familyOverview, setShareResults, type FamilyMemberSummary } from "@/lib/invite";

const day = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

const legacyTopics = { "택배 주소 확인 연락": "delivery", "부고 문자": "obituary" } as const;

function practiceLink(record: NonNullable<FamilyMemberSummary["recent"]>[number]) {
  if (record.kind !== "training") return "/quiz";
  const topic = TRAINING_TOPICS.find(item => item.title === record.title)?.id
    ?? legacyTopics[record.title as keyof typeof legacyTopics];
  return topic ? `/roleplay?topic=${topic}` : "/roleplay/select";
}

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
      <Header title="우리 가족 연습 리포트" back={() => router.replace("/home")} />
      <section className="screen__body family-practice">
        <section className="family-report__hero">
          <p className="hero__chip">가족과 함께하기</p>
          <h2>한 번 연습한 상황, 가족과 다시</h2>
          <p>가족이 공유한 최근 연습을 살펴보고, 같은 상황에 어떻게 대응할지 함께 이야기해 보세요.</p>
          {members && members.length > 0 && <strong>연결된 가족 {members.length}명</strong>}
        </section>
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
            <div className="family-report__member-head">
              <h2>{member.nickname || "가족"}{member.is_me ? " (나)" : ""}</h2>
              {member.record_count !== null && <span>연습 {member.record_count}회</span>}
            </div>
            {member.record_count === null ? <p>이 가족은 연습 기록을 비공개로 두었어요.</p> :
              member.record_count === 0 ? <p>아직 연습 기록이 없어요.</p> : <>
                <h3>최근 연습</h3>
                <ul>
                  {member.recent?.map((record, index) => (
                    <li key={index}>
                      <div className="family-report__record">
                        <strong>{record.title || (record.kind === "training" ? "실전 대응 훈련" : "OX 퀴즈")}</strong>
                        <time dateTime={record.created_at}>{day.format(new Date(record.created_at))}</time>
                      </div>
                      <div className="family-report__record">
                        <span className={"family-report__badge" + (record.safe === false ? " family-report__badge--review" : "")}>
                          {record.kind === "training"
                            ? record.safe === true ? "안전 행동 실천" : record.safe === false ? "함께 복습해요" : "연습 완료"
                            : record.score !== null && record.total !== null ? `${record.total}문제 중 ${record.score}개 정답` : "연습 완료"}
                        </span>
                        <Link className="family-report__link" href={practiceLink(record)}
                          aria-label={`${record.title || "훈련"} 함께 연습하기`}>함께 연습하기</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </>}
          </section>
        ))}
        {members && members.length > 0 && (
          <section className="fb-subcard family-report__actions">
            <h2>우리 가족의 대응 약속</h2>
            <p>갑자기 돈을 보내 달라는 연락이 오면, 평소 쓰던 번호로 먼저 전화하기로 약속해요.</p>
            <Link href="/family-code/guide" className="btn btn--secondary">가족 확인 질문 정하기</Link>
            <Link href="/invite" className="btn btn--gray">가족에게 연습 초대 보내기</Link>
          </section>
        )}
        <p className="fb-note">공개 설정은 저장된 기록과 앞으로의 기록에 적용돼요. 가족에게는 연습 주제와 결과 요약만 보여요.</p>
      </section>
    </Screen>
  );
}
