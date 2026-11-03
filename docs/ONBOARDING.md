# 역할별 개발 시작 가이드

FE·AI 담당은 Supabase CLI·Docker·Deno 설치가 필요 없습니다. 세 영역은 **`supabase/functions/_shared/types.ts` 한 파일**로 연결되고, 각자 자기 파일만 수정합니다.

## 공통

| 항목 | 규칙 |
|---|---|
| 계약 | 요청·응답 모양은 `types.ts`가 원본. 필드는 optional로만 추가, 바꾸기 전 담당자끼리 합의 |
| 브랜치 | `feat/영역-내용` → PR → 1명 리뷰 → Squash and merge ([COLLABORATION](COLLABORATION.md)) |
| PR 전 확인 | `npm run typecheck` · `npm run test:backend` |
| 참고 | [BE_FLOW](BE_FLOW.md) (설계) · [API_CONTRACT](API_CONTRACT.md) (호출 목록) |

## FE 담당

**준비**
1. `npm install`
2. BE에게 Supabase **URL·anon key**를 받아 `.env.example` → `.env.local`로 복사 후 입력 (service role 키는 받지 않음)
3. `npm run dev` → http://localhost:3000

**수정 범위**: `src/app/page.tsx`와 그 아래 컴포넌트 (지금은 한 파일이라 화면별로 나눠도 됨)

**백엔드 호출** (`src/lib/supabase.ts`)

| 종류 | 사용법 |
|---|---|
| 로그인 | `await ensureAnon()` (첫 방문 시 익명 로그인) |
| DB 조회·저장 | `sb().from("missions").select().order("sort")` |
| Edge Function | `await callFn<ChatTurnResponse>("chat-turn", { session_id, text })` |
| 타입 | `import type { ... } from "@shared/types"` |

**규칙**
- 대화 종료는 `chat-turn` 응답의 `ended`만 보고 판단합니다. FE가 직접 판정하지 않습니다.
- `callFn`은 실패하면 `Error.message`에 오류 코드를 담아 던집니다.

| 오류 코드 | 화면 처리 |
|---|---|
| `INVITE_INVALID` · `INVITE_EXPIRED` · `INVITE_FULL` | E01 안내 |
| `PII_BLOCKED` | 입력 유지 + 경고 |
| `SESSION_ENDED` | 결과 화면으로 이동 |
| 그 외 | 재시도 안내 |

Supabase 연결 전에는 화면 레이아웃 작업만 가능하고, 백엔드 호출은 실패합니다.

## AI 담당

**수정 범위**: `supabase/functions/_shared/ai.ts` **한 파일만**. 다른 파일을 고치지 않고 mock을 Gemini로 바꾸는 것이 Phase 2 완료 기준입니다.

**이름·시그니처 유지할 export**

| export | 사용처 |
|---|---|
| `generateReply(input: AiInput): Promise<AiOutput>` | `chat-turn` 대화 1턴 |
| `classify(text): Outcome` | `session-end` 결과 판정 |
| `nextStage`, `STAGES` | `chat-turn` 실패 시 기본 대사 |

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

**처리하지 않아도 되는 것**: 8초 타임아웃, 실패 시 기본 대사, 개인정보 가리기는 `chat-turn`이 이미 합니다. 오류가 나면 그냥 throw하세요.

**LLM 호출 (공급자 자동 전환)**: `_shared/llm.ts`의 `complete()`를 쓰면 Gemini → Groq → OpenRouter 순으로 시도하고, 한도 초과(429)·5xx·시간 초과·형식 오류면 다음 공급자로 넘어갑니다. 키가 등록된 공급자만 씁니다. (현재 `ai.ts`는 Gemini를 직접 호출 중이며 아직 연결 전)
```ts
import { complete } from "./llm.ts";
const { value, provider } = await complete(messages, {
  temperature: 0.8,
  json: true,                                  // 프롬프트에 "JSON"이라는 단어가 있어야 Groq·OpenRouter가 받아줌
  parse: (t) => { const o = JSON.parse(t); if (!INTENTS.includes(o.intent)) throw new Error("bad"); return o; },
  budgetMs: 7000,                              // 전체 시간 예산 (chat-turn 8초 안)
});
```
- `messages`는 OpenAI 형식: `{ role: "system" | "user" | "assistant", content }`. Gemini의 `model` 역할은 `assistant`로.
- `parse`가 throw하면 그 공급자 응답은 버리고 다음으로. 전부 실패하면 throw → 지금처럼 mock 대사로 대체.
- 공급자마다 모델이 달라 말투·판정이 조금씩 다릅니다. `/api/lab`에서 Groq 응답도 확인하세요.
- 모델 변경: `GEMINI_MODEL` · `GROQ_MODEL` · `OPENROUTER_MODEL`. 키: 운영은 Supabase Secrets(아래 6번), 로컬은 `.env.local`.

## BE 담당

1. 클라우드 프로젝트 생성 → URL·anon key 팀 공유
2. 대시보드 Authentication에서 **Anonymous sign-ins 활성화**
3. `npx supabase login` → `npx supabase link --project-ref <ref>`
4. `npx supabase db push --remote --include-seed` → `npx supabase functions deploy invite-join chat-turn session-end --use-api` (CLI v3는 `--remote` 없으면 로컬 대상)
5. 확인: `npm run test:e2e`
6. Phase 2: `npx supabase secrets set GROQ_API_KEY=... GEMINI_API_KEY=... OPENROUTER_API_KEY=...` (있는 것만 등록. `_shared/llm.ts`가 Gemini → Groq → OpenRouter 순으로 자동 전환)

스키마 변경은 새 마이그레이션 파일로 `ADD COLUMN` · `CREATE TABLE`만 합니다 (기존 컬럼 rename·drop 금지).
