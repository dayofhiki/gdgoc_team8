"""테스트 사례별 기대 판단과 실제 Gemini 결과 비교.

uv run python -m baitlab.evaluate                  # 전체 (발화 분류 + 대화)
uv run python -m baitlab.evaluate --kind classify --repeat 3
uv run python -m baitlab.evaluate --only C03 D06
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime

from . import engine
from .ai import GeminiAI
from .config import LAB_DIR, RESULTS_DIR, Settings, load_scenario
from .gemini import GeminiClient, GeminiError
from .models import Message
from .trainer import Trainer


def end_matches(expected, actual) -> bool:
    if isinstance(expected, list):
        return actual in expected
    return actual == expected


def run_classify(case: dict, ai: GeminiAI, scenario: dict, settings: Settings, default_context: list[str]) -> dict:
    session = engine.new_session(scenario, settings.max_user_turns)
    for text in case.get("context", default_context):
        session.messages.append(Message("impostor", text, 0))
        session.link_offered |= scenario["link"]["token"] in text

    started, waited = time.perf_counter(), ai.client.stats.wait_ms
    analysis, error = None, None
    try:
        analysis = ai.classify(session, case["utterance"])
    except GeminiError as e:
        if e.fatal:
            raise
        error = str(e)
    ms = (time.perf_counter() - started) * 1000 - (ai.client.stats.wait_ms - waited)
    record = engine.apply_user_turn(session, case["utterance"], analysis, settings.min_confidence, error)

    fails = []
    if "expect_intent" in case and record.applied_intent not in case["expect_intent"]:
        fails.append(f"intent {record.applied_intent} ∉ {case['expect_intent']}")
    if record.applied_intent in case.get("forbid_intent", []):
        fails.append(f"forbidden intent {record.applied_intent}")
    for flag, value in case.get("expect_flags", {}).items():
        if (record.raw_analysis or {}).get(flag) != value:
            fails.append(f"{flag}≠{value}")
    if "expect_end" in case and not end_matches(case["expect_end"], session.end_reason):
        fails.append(f"end {session.end_reason} ≠ {case['expect_end']}")
    if error:
        fails.append(error)
    return {
        "actual": f"{record.applied_intent}/{session.end_reason or 'continue'}",
        "raw": record.raw_analysis,
        "notes": record.notes,
        "ms": round(ms),
        "fails": fails,
    }


def run_dialog(case: dict, ai: GeminiAI, scenario: dict, settings: Settings) -> dict:
    trainer = Trainer(scenario, ai, settings.min_confidence, settings.max_user_turns)
    started, waited = time.perf_counter(), ai.client.stats.wait_ms
    trainer.start()
    for step in case["steps"]:
        if trainer.session.ended:
            break
        if step == "/click":
            try:
                trainer.click_link()
            except ValueError as e:
                trainer.session.notes.append(f"click_rejected: {e}")
        elif step == "/stop":
            trainer.stop()
        else:
            trainer.user_says(step)
    if trainer.session.ended:
        trainer.finish()
    ms = (time.perf_counter() - started) * 1000 - (ai.client.stats.wait_ms - waited)

    s = trainer.session
    fails = []
    if not end_matches(case["expect_end"], s.end_reason):
        fails.append(f"end {s.end_reason} ≠ {case['expect_end']}")
    for ev in case.get("forbid_events", []):
        if any(e.type == ev for e in s.events):
            fails.append(f"forbidden event {ev}")
    path = trainer.save(f"dialog-{case['id']}")
    return {
        "actual": f"{s.end_reason or 'continue'} (intents {[t.applied_intent for t in s.turns]}, feedback {s.feedback_source})",
        "notes": s.notes,
        "ms": round(ms),
        "fails": fails,
        "transcript_file": path,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="기대 판단 vs 실제 결과 비교")
    parser.add_argument("--kind", choices=["classify", "dialog", "all"], default="all")
    parser.add_argument("--repeat", type=int, default=1, help="같은 사례 반복 횟수 (결과 흔들림 확인)")
    parser.add_argument("--only", nargs="*", help="실행할 사례 ID")
    parser.add_argument("--cases", default=str(LAB_DIR / "eval" / "cases.json"))
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    scenario = load_scenario()
    cases = json.loads(open(args.cases, encoding="utf-8").read())
    try:
        ai = GeminiAI(GeminiClient(settings), scenario)
    except GeminiError as e:
        print(f"오류: {e}", file=sys.stderr)
        return 2

    plan = []
    if args.kind in ("classify", "all"):
        plan += [("classify", c) for c in cases["classify"]]
    if args.kind in ("dialog", "all"):
        plan += [("dialog", c) for c in cases["dialog"]]
    if args.only:
        plan = [(k, c) for k, c in plan if c["id"] in args.only]

    print(f"모델: {settings.model} | 사례 {len(plan)}개 × 반복 {args.repeat}회\n")
    print(f"{'ID':<5} {'기대':<38} {'실제':<55} {'통과':<6} {'평균ms':>7}")
    print("-" * 115)
    report, aborted = [], None
    for kind, case in plan:
        runs = []
        for _ in range(args.repeat):
            try:
                runs.append(run_classify(case, ai, scenario, settings, cases["default_context"]) if kind == "classify" else run_dialog(case, ai, scenario, settings))
            except GeminiError as e:
                aborted = str(e)
                break
        if aborted:
            break
        passed = sum(not r["fails"] for r in runs)
        expected = (f"{case.get('expect_intent') or ('≠' + str(case.get('forbid_intent')))}/" if kind == "classify" else "") + str(case.get("expect_end") or "continue")
        actual = " | ".join(r["actual"] for r in runs)
        print(f"{case['id']:<5} {expected[:38]:<38} {actual[:55]:<55} {passed}/{len(runs):<4} {sum(r['ms'] for r in runs) / len(runs):>7.0f}")
        for r in runs:
            for f in r["fails"]:
                print(f"      ✗ {f}")
        report.append({"id": case["id"], "kind": kind, "case": case, "passed": passed, "runs": runs})

    total_runs = sum(len(r["runs"]) for r in report)
    total_pass = sum(r["passed"] for r in report)
    print("-" * 115)
    print(f"통과 {total_pass}/{total_runs} 실행, 완전 통과 사례 {sum(r['passed'] == len(r['runs']) for r in report)}/{len(report)}")
    if aborted:
        print(f"\n중단됨: {aborted}", file=sys.stderr)

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"eval-{datetime.now():%Y%m%d-%H%M%S}.json"
    out.write_text(json.dumps({"model": settings.model, "repeat": args.repeat, "aborted": aborted, "results": report}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"상세 결과: {out}")
    return 2 if aborted else (0 if total_pass == total_runs else 1)


if __name__ == "__main__":
    sys.exit(main())
