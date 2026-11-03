"""로컬 대화 실행기.

대화형:   uv run python -m baitlab.cli
스크립트: uv run python -m baitlab.cli --say "무슨 일이야?" --say "어떤 결제야?" --say /click
"""
from __future__ import annotations

import argparse
import json
import sys

from .ai import GeminiAI
from .config import Settings, load_scenario
from .engine import SessionEnded
from .gemini import GeminiClient, GeminiError
from .trainer import Trainer


def show_impostor(text: str, token: str, label: str) -> None:
    print(f"\n상대> {text.replace(token, f'[🔗 {label}]  (클릭하려면 /click)')}")


def show_record(record) -> None:
    raw = record.raw_analysis or {}
    print(f"   ↳ 해석: {record.applied_intent}"
          f" (모델 제안 {raw.get('intent', '-')}, 확신도 {raw.get('confidence', '-')}, 근거 \"{raw.get('evidence', '')}\")"
          + (f"  메모 {record.notes}" if record.notes else ""))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="자녀 사칭 사기 예방 훈련 로컬 실험")
    parser.add_argument("--say", action="append", help="가상 사용자 입력(반복 가능). /click, /stop 명령도 가능")
    parser.add_argument("--scenario", default="child_phone_broken")
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    scenario = load_scenario(args.scenario)
    token, label = scenario["link"]["token"], scenario["link"]["label"]
    print(f"모델: {settings.model}  |  최대 답변 {settings.max_user_turns or scenario['max_user_turns']}회")
    print(scenario["intro"])

    try:
        trainer = Trainer(scenario, GeminiAI(GeminiClient(settings), scenario), settings.min_confidence, settings.max_user_turns)
    except GeminiError as e:
        print(f"\n오류: {e}", file=sys.stderr)
        return 2

    scripted = iter(args.say) if args.say else None
    try:
        show_impostor(trainer.start(), token, label)
        while not trainer.session.ended:
            if scripted is not None:
                line = next(scripted, None)
                if line is None:
                    print("\n(스크립트 입력이 끝났지만 훈련이 종료되지 않았습니다.)")
                    break
                print(f"\n나> {line}")
            else:
                try:
                    line = input("\n나> ").strip()
                except (EOFError, KeyboardInterrupt):
                    line = "/stop"
            if not line:
                continue
            if line == "/state":
                print(json.dumps(trainer.session.to_dict(), ensure_ascii=False, indent=2))
                continue
            try:
                if line == "/click":
                    trainer.click_link()
                    print("   ↳ 이벤트: 모의 링크 클릭 (실제 외부 링크는 열리지 않습니다)")
                elif line == "/stop":
                    trainer.stop()
                    print("   ↳ 이벤트: 사용자 중단")
                else:
                    record, reply = trainer.user_says(line)
                    show_record(record)
                    if reply:
                        show_impostor(reply, token, label)
            except ValueError as e:  # 링크 제시 전 클릭 등
                print(f"   ↳ {e}")
    except GeminiError as e:
        print(f"\n오류: {e}", file=sys.stderr)
        print(f"중간 기록: {trainer.save('session-aborted')}", file=sys.stderr)
        return 2
    except SessionEnded:
        pass

    if trainer.session.ended:
        feedback = trainer.finish()
        print(f"\n===== 훈련 종료: {trainer.session.end_reason} (피드백 출처: {trainer.session.feedback_source}) =====")
        print(feedback.headline)
        print(feedback.what_happened)
        for p in feedback.good_points:
            print(f"  👍 {p}")
        for n in feedback.next_time:
            print(f"  → {n}")
    print(f"\n기록 저장: {trainer.save()}  (Gemini 호출 {trainer.ai.client.stats.calls}회, 평균 {trainer.ai.client.stats.total_ms / max(trainer.ai.client.stats.calls, 1):.0f}ms)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
