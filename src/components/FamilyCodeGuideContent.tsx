const STEPS = ["모르는 번호로 가족이 급하게 돈을 요청해요", "미리 정한 질문을 물어봐요", "답이 틀리면 끊고 원래 번호로 확인해요"];

export default function FamilyCodeGuideContent() {
  return (
    <div className="stack family-code-instructions">
      <div className="card">
        <p className="card__title card__title--bold">이렇게 써요</p>
        <ol className="steps" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {STEPS.map((s, i) => (
            <li className="step" key={s}>
              <span className="step__num">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>
      <div className="card card--blue">
        <p className="card__title">암호는 가족끼리만 공유해요</p>
        <p className="card__text">질문과 답을 믿을 수 있는 가족과 공유해 두세요. 의심되는 연락에서는 답을 먼저 알려주지 마세요.</p>
      </div>
    </div>
  );
}
