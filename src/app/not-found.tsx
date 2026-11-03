import Link from "next/link";

export default function NotFound() {
  return (
    <main className="screen">
      <section className="screen__body">
        <div className="center">
          <h2 className="center__title">{"페이지를\n찾을 수 없어요."}</h2>
          <p className="center__desc">주소를 다시 확인해 주세요.</p>
        </div>
      </section>
      <div className="cta">
        <Link href="/" className="btn btn--primary">처음 화면으로</Link>
      </div>
    </main>
  );
}
