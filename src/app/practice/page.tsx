import Link from "next/link";
import { ChevronRight } from "@/components/Icons";
import { Header, Screen } from "@/components/ui";
import { TRAINING_TOPICS } from "@/lib/trainingCatalog";

const shortcuts = [
  { title: "실전 훈련", description: "어떤 연락이 올지 모르는 상태에서 대응해요", href: "/roleplay?mode=live" },
  { title: "상황별 연습", description: `가족·택배·금융 등 ${TRAINING_TOPICS.length}가지 상황 중 골라 연습해요`, href: "/roleplay/select" },
  { title: "사례로 배우기", description: "실제 사건을 되감으며 배워요", href: "/roleplay/case" },
  { title: "OX 퀴즈", description: "50문제은행에서 10문제씩 풀어요", href: "/quiz" },
];

export default function PracticeCatalog() {
  return (
    <Screen>
      <Header title="모든 연습" back="/home" />
      <section className="screen__body rt-select-page">
        <div className="rt-select-heading">
          <h2>오늘은 어떤 연습을 해볼까요?</h2>
          <p>문자·채팅 대응 훈련을 시작하거나 원하는 학습 방식을 선택하세요.</p>
        </div>
        <div className="list">
          {shortcuts.map(item => (
            <Link key={item.href} className="list-row" href={item.href}>
              <span className="list-row__text">
                <strong className="list-row__title">{item.title}</strong>
                <span className="list-row__desc">{item.description}</span>
              </span>
              <ChevronRight />
            </Link>
          ))}
        </div>
      </section>
    </Screen>
  );
}
