import Link from "next/link";
import { ChevronRight } from "@/components/Icons";
import { Header, Screen } from "@/components/ui";
import { TRAINING_TOPICS } from "@/lib/trainingCatalog";

const shortcuts = [
  { title: "실전 훈련", description: "어떤 연락이 올지 모르는 상태에서 대응해요", href: "/roleplay?mode=live" },
  { title: "사례로 배우기", description: "사례 속 대화에서 대처 방법을 살펴봐요", href: "/roleplay/case" },
  { title: "OX 퀴즈", description: "10문제로 대처 방법을 확인해요", href: "/quiz" },
];
const categories = [...new Set(TRAINING_TOPICS.map(topic => topic.category))];

export default function PracticeCatalog() {
  return (
    <Screen>
      <Header title="모든 연습" back="/home" />
      <section className="screen__body rt-select-page">
        <div className="rt-select-heading">
          <h2>오늘은 어떤 연습을 해볼까요?</h2>
          <p>바로 실전에 들어가거나 연습할 상황을 골라 보세요.</p>
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
        <div className="rt-select-categories">
          <h2 className="sec__title">상황별 연습 · {TRAINING_TOPICS.length}가지</h2>
          {categories.map(category => (
            <section key={category} className="rt-select-category">
              <h3>{category}</h3>
              <div className="rt-select-list">
                {TRAINING_TOPICS.filter(topic => topic.category === category).map(topic => (
                  <Link key={topic.id} href={`/roleplay?topic=${topic.id}`} className="rt-select-item">
                    <span className="rt-select-copy"><strong>{topic.title}</strong><small>{topic.description}</small></span>
                    <ChevronRight />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </Screen>
  );
}
