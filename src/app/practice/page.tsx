import Link from "next/link";
import { ChevronRight } from "@/components/Icons";
import { Header, Screen } from "@/components/ui";

const shortcuts = [
  { title: "AI 상황극", description: "문자·채팅 또는 AI 피싱범 전화로 대응을 연습해요", href: "/roleplay" },
  { title: "OX 퀴즈", description: "50문제은행에서 10문제씩 풀어요", href: "/quiz" },
  { title: "사례로 배우기", description: "실제 사건을 되감으며 배워요", href: "/roleplay/case" },
];

export default function PracticeCatalog() {
  return (
    <Screen>
      <Header title="모든 연습" back="/home" />
      <section className="screen__body rt-select-page">
        <div className="rt-select-heading">
          <h2>오늘은 어떤 연습을 해볼까요?</h2>
          <p>AI 상황극에 참여하거나 OX 퀴즈와 실제 사례를 학습해 보세요.</p>
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
