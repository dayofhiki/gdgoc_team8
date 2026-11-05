# 역할별 개발 시작 가이드

FE·AI 담당은 Firebase CLI·Java 설치가 필요 없습니다. 화면은 `src/lib`의 함수만 부르고, 공통 타입은 `src/server/types.ts`에 있습니다. 각자 자기 파일만 수정합니다.

## 공통

| 항목 | 규칙 |
|---|---|
| 계약 | 요청·응답 모양은 `types.ts`가 원본. 필드는 optional로만 추가, 바꾸기 전 담당자끼리 합의 |
| 브랜치 | `feat/영역-내용` → PR → 1명 리뷰 → Squash and merge ([COLLABORATION](COLLABORATION.md)) |
| PR 전 확인 | `npm run typecheck` · `npm run test:backend` (BE는 `npm run test:firebase`도) |
| 참고 | [BE_FLOW](BE_FLOW.md) (설계) · [API_CONTRACT](API_CONTRACT.md) (호출 목록) |

## FE 담당

**준비**
1. `npm install`
2. BE에게 Firebase **웹 앱 설정값 4개**(`NEXT_PUBLIC_FIREBASE_*`)를 받아 `.env.example` → `.env.local`로 복사 후 입력 (비공개 키는 필요 없음)
3. `npm run dev` → http://localhost:3000

**수정 범위**: `src/app/` 아래 화면과 `src/components/`

**백엔드 호출**: `src/lib/invite.ts`(가족·초대·질문·공유·요약)와 `src/lib/records.ts`(`saveRecord`)의 함수만 씁니다. 로그인·토큰은 함수가 알아서 처리합니다. 목록은 [API_CONTRACT](API_CONTRACT.md).

**규칙**
- 함수는 실패해도 던지지 않고 `null` · `false` · `"offline"`을 돌려줍니다. 화면은 이 값으로 오프라인 안내를 보여 주면 됩니다.
- `joinInvite`가 `"invalid"`면 링크 오류 화면(E01), `"offline"`이면 그대로 계속합니다.

Firebase 설정이 없으면 가족·기록 기능은 오프라인 모드로 동작하고, 나머지 화면은 그대로 작업할 수 있습니다.

## AI 담당

**수정 범위**: `src/server/ai.ts` · `src/server/llm.ts` (Next 서버 전용). 문자 훈련은 `/api/real-training`, 실험 페이지는 `/lab`(`/api/lab`, 개발 서버 전용)에서 씁니다.

**이름·시그니처 유지할 export**

| export | 사용처 |
|---|---|
| `generateReply(input: AiInput): Promise<AiOutput>` | `/api/lab` 대화 1턴 |
| `classify(text): Outcome` | `/api/lab` 결과 판정 |
| `nextStage`, `STAGES` | 실패 시 기본 대사 |

**입력 `AiInput`**

| 필드 | 내용 |
|---|---|
| `mission.persona` | 사기범 역할 설명 |
| `mission.fallback_lines` | 단계별 기본 대사 |
| `difficulty` | `easy` · `normal` · `hard` |
| `stage` | `approach` → `trust` → `pressure` → `demand` |
| `history` | 이전 대화 (`role`, `text`, `stage`) |
| `user_text` | 시니어의 이번 답 (없으면 첫 대사 요청) |

**출력 `AiOutput`**: `reply` (사기범 답장) · `next_stage` · `ended` · `red_flags?` · `used_fallback`

**처리하지 않아도 되는 것**: 8초 타임아웃, 실패 시 기본 대사, 개인정보 가리기는 `/api/lab` 라우트가 이미 합니다. 오류가 나면 그냥 throw하세요.

**LLM 호출 (공급자 자동 전환)**: `src/server/llm.ts`의 `complete()`를 쓰면 Gemini → Groq → OpenRouter 순으로 시도하고, 한도 초과(429)·5xx·시간 초과·형식 오류면 다음 공급자로 넘어갑니다. 키가 등록된 공급자만 씁니다. `ai.ts`의 `generateReply`가 이걸로 호출합니다.
```ts
import { complete } from "./llm.ts";
const { value, provider } = await complete(messages, {
  temperature: 0.8,
  json: true,                                  // 프롬프트에 "JSON"이라는 단어가 있어야 Groq·OpenRouter가 받아줌
  schema: OUT_SCHEMA,                          // 지원 공급자(Gemini·Groq gpt-oss)는 이 스키마로 형식 강제
  parse: (t) => { const o = JSON.parse(t); if (!INTENTS.includes(o.intent)) throw new Error("bad"); return o; },
  budgetMs: 7000,                              // 전체 시간 예산 (라우트 타임아웃 8초 안)
});
```
- `messages`는 OpenAI 형식: `{ role: "system" | "user" | "assistant", content }`. Gemini의 `model` 역할은 `assistant`로.
- `parse`가 throw하면 그 공급자 응답은 버리고 다음으로. 전부 실패하면 throw → 지금처럼 mock 대사로 대체.
- 공급자마다 모델이 달라 말투·판정이 조금씩 다릅니다. `/api/lab`에서 Groq 응답도 확인하세요.
- 모델 변경: `GEMINI_MODEL`(기본 `gemini-3.6-flash`) · `GROQ_MODEL`(기본 `openai/gpt-oss-120b`, 더 빠르게는 `openai/gpt-oss-20b`) · `OPENROUTER_MODEL`. 키: 운영은 Dokploy env, 로컬은 `.env.local`.
- 공급자 고르기·순서 바꾸기: env `LLM_PROVIDERS=groq` (Groq만) · `groq,gemini` (순서 변경). 없으면 Gemini → Groq → OpenRouter.
- 어느 공급자가 답했는지는 Next 서버 로그의 `llm: <공급자> → <intent>`.

## BE 담당

1. Firebase 프로젝트 `gdgoc-team8`(Blaze) 웹 앱 설정값 4개를 팀에 공유 (공개값)
2. 콘솔 Authentication에서 **익명 로그인 사용 설정**, Firestore Standard `asia-northeast3`
3. `npx firebase-tools@14 login` (별도 터미널에서)
4. `functions/` 변경 시: `npx firebase-tools@14 deploy --only functions,firestore:rules --project gdgoc-team8`
5. 확인: `npm run test:firebase` (emulator) · `npm run build --prefix functions`

Firestore 문서에는 필드를 추가만 합니다 (기존 필드 rename·삭제 금지). 응답 모양을 바꾸면 `src/server/types.ts`와 `functions/src/family.ts`의 타입을 같이 맞춥니다.
