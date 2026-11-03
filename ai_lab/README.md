# ai_lab · 자녀 사칭 사기 예방 훈련 AI 로컬 실험

Gemini가 자녀를 사칭하는 가상의 상대를 연기하고, 사용자 발화를 해석해 훈련 종료를 판단한 뒤 피드백을 만드는 **독립 실행 실험**입니다.
웹 UI, 서버, DB는 없습니다. 기준 문서는 [docs/AI_MVP_기획_및_Claude_Code_지시.md](../docs/AI_MVP_기획_및_Claude_Code_지시.md)입니다.

## 구조

| 파일 | 역할 | Gemini 필요 |
| --- | --- | --- |
| `scenarios/child_phone_broken.json` | 시나리오 설정 (역할, 배경, 금지사항, 링크 토큰, 최대 답변 수, 기본 피드백) | - |
| `baitlab/models.py` | 의도·이벤트·종료 사유·세션 데이터 구조 | 아니오 |
| `baitlab/engine.py` | 분석 검증, 상태 전이, 종료 판단, 링크 제시 시점 | 아니오 |
| `baitlab/safety.py` | 생성 메시지의 URL·번호 제거, 피드백 사실 검증, 기본 문구 | 아니오 |
| `baitlab/gemini.py` | 공식 `google-genai` SDK 호출, 재시도, 오류 정리 | 예 |
| `baitlab/ai.py` | 대화 생성 / 발화 해석 / 피드백 프롬프트 | 예 |
| `baitlab/trainer.py` | 위 기능을 잇는 실행기 (CLI·평가기 공용) | 주입식 |
| `baitlab/cli.py` | 대화형·스크립트 실행기 | 예 |
| `baitlab/evaluate.py` + `eval/cases.json` | 기대 판단 vs 실제 결과 비교 | 예 |
| `tests/test_offline.py` | 가짜 AI로 상태 전이·이벤트·검증 테스트 | 아니오 |

### 판단 흐름

1. Gemini가 사용자 발화를 `refuse / verify_independent / comply / continue / stop / unclear` 중 하나로 **제안**합니다 (확신도, 근거 인용, 클릭 의사 여부, 상대가 준 연락처 사용 여부 포함).
2. `engine.validate_analysis`가 검증합니다. 종료로 이어지는 의도(거절·직접 확인·중단)는 아래 경우 `unclear`로 낮춥니다.
   - 확신도가 `BAITLAB_MIN_CONFIDENCE`(기본 0.6) 미만
   - 근거 인용이 실제 발화에 없음
   - 직접 확인인데 상대가 보내준 번호를 쓰려 함 (모델 플래그 또는 "보내준/이 번호/새 번호" 등 표현)
3. 종료 규칙 (애플리케이션이 결정)

| 입력 | 결과 |
| --- | --- |
| `/click` 이벤트 (링크가 제시된 뒤에만 허용) | `link_clicked` |
| 검증된 `refuse` | `refused` |
| 검증된 `verify_independent` | `verified_independently` |
| `stop` 발화 또는 `/stop` 이벤트 | `user_stopped` |
| 답변 6회 후에도 위에 해당 없음 | `inconclusive` |
| "눌러볼게" (`comply` + 클릭 의사) | 계속. 실제 클릭으로 기록하지 않음 |

4. 링크는 실제 URL이 아닌 `[[MOCK_LINK]]` 토큰입니다. 사용자 답변 2회 전에는 토큰을 지우고, 2회 이후 모델이 링크를 빠뜨리면 앱이 붙입니다. 생성 메시지 속 URL·전화번호·계좌형 숫자는 `[삭제됨]`으로 바꿉니다.
5. 피드백은 Gemini가 기록된 사실(종료 사유, 이벤트, 적용된 의도, 대화)만 받아 생성합니다. 이벤트 없이 "링크를 여셨어요", 확인 완료 단정, 기록 없는 직접 확인 칭찬 등이 있으면 버리고 시나리오의 기본 문구를 씁니다 (`feedback_source: fallback`).

## 실행 환경

- Python 3.11 이상 (확인: 3.14.5), [uv](https://docs.astral.sh/uv/)
- 공식 SDK `google-genai` (확인: 2.34.0), `pydantic` 2
- Gemini API 키 (Google AI Studio)

```powershell
cd ai_lab
uv sync              # .venv 생성 + 의존성 설치
```

### 키 설정

코드나 결과 파일에 키를 넣지 마세요. 아래 중 하나를 쓰면 됩니다.

```powershell
# 현재 터미널에만 설정
$env:GEMINI_API_KEY = "<AI Studio에서 발급한 키>"
# 또는 ai_lab/.env.example 을 ai_lab/.env 로 복사해 값 입력 (저장소 루트 .env 도 읽음, 둘 다 Git 제외)
```

### 모델 설정

기본값은 `gemini-3.6-flash`(Stable)입니다. 2026-11-03 공식 모델 문서는 신규 프로젝트에 `gemini-3.8-flash`와 `gemini-3.5-flash-lite`를 권장하지만, 같은 날 확인했을 때 `gemini-3.8-flash`는 수요 과다로 503/504 오류가 반복되어 실험 기본값에서 뺐습니다. 바꾸려면:

```powershell
$env:GEMINI_MODEL = "gemini-3.8-flash"       # 또는 gemini-3.5-flash-lite
```

사용 가능 여부·요금·한도는 실행 시점에 [모델 목록](https://ai.google.dev/gemini-api/docs/models), [요금](https://ai.google.dev/gemini-api/docs/pricing), [호출 제한](https://ai.google.dev/gemini-api/docs/rate-limits)에서 확인하세요.

## 실행 명령

```powershell
cd ai_lab

# 1) 모델 없이 테스트 (키 불필요)
uv run pytest -q

# 2) 대화형 실험: 자유롭게 답하고 /click, /stop, /state 명령 사용
uv run python -m baitlab.cli

# 3) 가상 답변 스크립트로 한 번에 실행
uv run python -m baitlab.cli --say "무슨 일이야?" --say "어떤 결제인데?" --say /click

# 4) 기대 판단 vs 실제 결과 비교
uv run python -m baitlab.evaluate                       # 발화 분류 14개 + 대화 7개
uv run python -m baitlab.evaluate --kind classify --repeat 3   # 같은 입력 3회 반복 (흔들림 확인)
uv run python -m baitlab.evaluate --only C03 D06
```

Windows 콘솔에서 한글·이모지가 깨지면 `$env:PYTHONIOENCODING = "utf-8"`을 먼저 설정하세요.
Git Bash에서는 `/click`이 `C:/Program Files/Git/click`으로 바뀌므로 `MSYS_NO_PATHCONV=1`을 앞에 붙이거나 PowerShell을 쓰세요.

### 무료 등급 한도

2026-11-03 실행 시 무료 등급 한도는 `gemini-3.6-flash` 기준 **분당 5회, 하루 20회**였습니다 (서버 오류 메시지 기준, 모델별로 따로 계산). 사용자 답변 1회에 해석+생성 2회, 종료 시 피드백 1회를 호출합니다.

- 분당 한도: `$env:BAITLAB_MIN_INTERVAL_S = "12"`로 호출 간격을 둡니다. 그래도 걸리면 서버가 알려준 시간(최대 `BAITLAB_RATE_LIMIT_MAX_WAIT_S`, 기본 70초)만큼 기다렸다 최대 2번 다시 시도합니다.
- 일일 한도: 기다리지 않고 바로 멈춥니다. 다른 모델로 바꾸거나 다음 날 실행합니다.
- 전체 평가(`evaluate` 기본)는 약 60회 호출이므로 무료 등급에서는 `--kind classify`(14회)와 `--only`로 나눠 실행하세요.

## 기대 판단과 실제 결과 비교 방법

`eval/cases.json`에 사람이 기대 결과를 미리 적어 둡니다.

- **classify 사례**: 상대 메시지 맥락(`context`, 생략 시 `default_context`) 뒤에 사용자 발화 1개를 넣고, 검증 후 의도와 종료 사유를 비교합니다.
  - `expect_intent`: 허용 의도 목록 / `forbid_intent`: 나오면 실패 / `expect_flags`: 예) `link_click_intent: true` / `expect_end`: 종료 사유 (`null` = 계속, 목록 = 그중 하나)
- **dialog 사례**: 실제 Gemini 대화를 가상 답변(`steps`, `/click` `/stop` 포함)으로 끝까지 진행하고 최종 종료 사유와 금지 이벤트(`forbid_events`)를 확인합니다. 피드백도 생성·검증합니다.

출력 예시 형식:

```
ID    기대                                   실제                                      통과    평균ms
C03   ≠['verify_independent']/continue       unclear/continue | continue/continue      2/2       850
C05   ['comply']/continue                    comply/continue                           1/1       790
      ✗ (실패 시 이유가 여기에 표시)
```

- 판정 기준은 **모델 원본이 아니라 검증 후 상태에 반영된 값**입니다. 원본 제안(`raw`)과 검증 메모(`notes`)는 `results/eval-*.json`에 함께 남습니다.
- `--repeat N`으로 같은 사례를 반복해 통과율과 평균 응답 시간을 봅니다.
- 대화 사례의 전체 대화·피드백은 `results/dialog-*.json`에 저장되므로 사람이 교육적 적절성을 따로 검수합니다. 자동 통과가 대화 품질을 보장하지는 않습니다.
- 종료 코드: 0 전부 통과, 1 일부 실패, 2 API 오류로 중단.

## 오류 표시

| 상황 | 표시 | 동작 |
| --- | --- | --- |
| 키 없음 | `[Gemini missing_key]` | 즉시 종료 |
| 401/403 | `[Gemini auth]` 키·권한 확인 안내 | 즉시 종료 |
| 429 분당 | `… 분당 사용 한도 도달. N초 기다린 뒤 다시 시도합니다.` | 서버 안내 시간만큼 대기 후 최대 2번 재시도, 그래도 실패하면 `[Gemini quota]`로 종료 |
| 429 일일·요금제 | `[Gemini quota]` 한도 종류 + 한도 문서 링크 + 서버 메시지 | 즉시 종료, 중간 기록 `results/session-aborted-*.json` 저장 |
| 404 | `[Gemini model]` GEMINI_MODEL 확인 안내 | 즉시 종료 |
| 5xx, 네트워크 | `[Gemini server/network]` | 재시도 후 발화 해석이면 `unclear`, 상대 메시지면 기본 문장 |
| JSON 형식 오류 | `[Gemini invalid_output]` | 발화 해석이면 `unclear`, 피드백이면 기본 문구 |

## 검증 현황 (2026-11-03)

| 항목 | 결과 |
| --- | --- |
| 오프라인 테스트 (`pytest`) | 24개 통과 |
| 발화 분류 14개 (`gemini-3.5-flash-lite`, 1회씩) | 14/14 통과 |
| 대화 D01·D02 (`gemini-3.5-flash-lite`) | 2/2 통과. 단 D01 피드백에 "상대방에게 직접 전화" 조언이 있어 검증 규칙을 추가함 (추가 후 재실행 안 함) |
| 대화 D03~D07, 반복 실행(`--repeat`) | 일일 한도로 미실행 |
| `gemini-3.6-flash` 전체 대화 | 하루 20회 한도 초과로 중단 |
| `gemini-3.8-flash` | 503/504 수요 과다로 미실행 |

## 알려진 한계

- 직접 확인 표현 필터는 한국어 패턴 몇 개라 우회 표현을 다 잡지 못합니다. 모델 플래그와 함께 씁니다.
- 피드백 사실 검증은 정규식 기반이라 과하게 버리거나 놓칠 수 있습니다. 버린 원문은 세션 `notes`에 남습니다.
- 최대 답변 6회, 링크 제시 시점(2회 후), 확신도 0.6은 잠정값입니다.
- 결과 파일에는 가상 대화만 저장됩니다. 실제 개인정보를 입력하지 마세요.

## 향후 FE/BE 연결 지점 (초안, 팀 합의 전)

- `Trainer.start() / user_says(text) / click_link() / stop() / finish()`가 API의 한 턴에 대응합니다.
- `Session.to_dict()`가 상태 저장·전송 형식 후보입니다. 서버는 세션을 저장했다가 요청마다 복원하면 됩니다.
- FE는 `[[MOCK_LINK]]`를 모의 링크 UI로 바꾸고, 실제 클릭 시 `link_clicked` 이벤트를 보냅니다.
- 클릭 직후 보여줄 모의 화면, 재도전 UX, 결과 공유 범위는 미결입니다.
