# API 문서

> 프론트가 부르는 API 전부. 응답 예시는 배포된 프로젝트(`pedmhdnmhmzsezerrzvk`)에 실제로 호출해 받은 값입니다 (2026-11-03).
> 타입 원본: `supabase/functions/_shared/types.ts` (FE는 `@shared/types`) · 설계: [BE_FLOW](BE_FLOW.md)

## 목차
1. [기본 정보](#1-기본-정보)
2. [화면별 호출 순서](#2-화면별-호출-순서)
3. [Edge Functions](#3-edge-functions) — `invite-join` · `chat-turn` · `session-end` · `practice-chat` · `transcribe`
4. [DB 직접 호출](#4-db-직접-호출) — `invites` · `missions` · `sessions` · `messages` · `results`
5. [오류 코드](#5-오류-코드)
6. [아직 없는 API](#6-아직-없는-api)

---

## 1. 기본 정보

| 항목 | 값 |
|---|---|
| Base URL | `https://pedmhdnmhmzsezerrzvk.supabase.co` |
| 테이블 API | `/rest/v1/<table>` (supabase-js `sb().from(...)`) |
| Edge Function | `POST /functions/v1/<name>` (`callFn(name, body)`) |
| 인증 | 익명 로그인 필수. `await ensureAnon()`을 첫 호출 전에 한 번 |
| 헤더 | `apikey: <anon key>`, `Authorization: Bearer <사용자 토큰>` — supabase-js가 자동으로 붙임 |
| 형식 | JSON, 필드명 snake_case, 값은 영어 소문자, ID는 uuid (미션만 slug), 시간은 ISO 문자열 |

프론트 도우미 (`src/lib/supabase.ts`):

```ts
import { ensureAnon, sb, callFn } from "@/lib/supabase";
await ensureAnon();                       // 익명 로그인 (이미 돼 있으면 그대로)
sb().from("missions").select();           // 테이블 API
await callFn<Res>("chat-turn", { ... });  // Edge Function. 실패 시 Error.message = 오류 코드
```

---

## 2. 화면별 호출 순서

| 화면 | 누가 | 호출 |
|---|---|---|
| G03 훈련 생성 | 보호자 | `invites` insert → 링크 `${origin}/?invite=<token>` |
| S01 링크 입장 | 시니어 | `invite-join` |
| S02 미션 선택 | 시니어 | `missions` select |
| S04 훈련 시작 | 시니어 | `sessions` insert → `chat-turn` (text 없이, 첫 대사) |
| S05 채팅 | 시니어 | `chat-turn` 반복. 응답 `ended: true`면 S06으로 |
| S06 종료 | 시니어 | `session-end` (중간에 "끝내기"를 눌러도 같은 호출) |
| S07 결과 | 시니어 | `session-end` 응답 표시, 공유 동의 시 `results` update |
| E01 링크 오류 | 시니어 | `invite-join` 오류 코드로 분기 |
| 혼자 연습하기 (`/roleplay/chat`) | 누구나 | `practice-chat` 반복 → 종료 시 `practice-chat`(`action: "report"`) → 리포트 화면. 음성 입력은 `transcribe` (세션·결과 저장 없음) |

> 2026-11-04 기준 화면 코드에서 실제로 부르는 함수는 `invite-join` · `practice-chat` · `transcribe`입니다. `chat-turn`·`session-end`는 E2E 스크립트로만 호출됩니다.

```
보호자: invites.insert ──token──▶ 시니어: invite-join ─▶ missions ─▶ sessions.insert
        ─▶ chat-turn(첫 대사) ─▶ chat-turn × N ─(ended)─▶ session-end ─▶ (results.update)
```

---

## 3. Edge Functions

모두 `POST`, JSON body. 성공 `200`, 실패 `4xx/5xx` + `{ "error": { "code", "message" } }`.

### 3-1. `invite-join` — 링크 확인·입장

같은 사람이 다시 누르면 기존 참여 기록을 돌려줍니다. 여러 명이 동시에 눌러도 정원을 넘지 않습니다.

**요청** `InviteJoinRequest`
```json
{ "token": "6fcd987491504593bec47dbc60de786f4aff723226a34261b0111d9974975fb8" }
```

**응답 200** `InviteJoinResponse`
```json
{
  "participant_id": "787c8538-6b7e-4151-b9ed-61290a94662d",
  "invite": { "senior_name": "어머니", "difficulty": "normal" }
}
```

| 오류 | 상태 | 언제 |
|---|---|---|
| `INVITE_INVALID` | 404 | 없는 토큰 |
| `INVITE_EXPIRED` | 410 | 만료 (기본 7일) |
| `INVITE_FULL` | 409 | 정원 초과 |
| `BAD_REQUEST` | 400 | token 없음 |

```ts
const r = await callFn<InviteJoinResponse>("invite-join", { token });
```

### 3-2. `chat-turn` — 대화 1턴

`text` 없이 부르면 첫 대사(오프닝)를 줍니다. 이미 대화가 있으면 마지막 메시지를 다시 줍니다 (새로고침 대비).
단계 전환과 종료 판정은 서버가 합니다. **FE는 `ended`만 보고 종료합니다.**

**요청** `ChatTurnRequest`
```json
{ "session_id": "87565d9f-f9e7-46e7-8fdf-2a52607501f1", "text": "누구세요?" }
```
- `text`: 선택, 최대 500자 (넘으면 잘림)

**응답 200** `ChatTurnResponse`
```json
{
  "reply": {
    "id": "b1333309-1edc-4f1b-a360-093c2a248691",
    "session_id": "87565d9f-f9e7-46e7-8fdf-2a52607501f1",
    "role": "scammer",
    "text": "수리 맡겨서 당분간 이 번호로만 연락돼. 전화는 못 받아.",
    "stage": "trust",
    "created_at": "2026-11-03T09:13:34.970539+00:00"
  },
  "stage": "trust",
  "ended": false,
  "used_fallback": false
}
```

마지막 턴 (시니어가 "직접 전화해서 확인할게"):
```json
{
  "reply": { "role": "scammer", "text": "...(상대방이 전화를 끊었습니다)", "stage": "pressure", "...": "..." },
  "stage": "pressure",
  "ended": true,
  "used_fallback": false
}
```

| 필드 | 의미 |
|---|---|
| `stage` | `approach` → `trust` → `pressure` → `demand` |
| `ended` | `true`면 대화 종료. 다음은 `session-end` |
| `used_fallback` | Gemini 키가 없거나, 호출이 실패하거나, 8초 안에 답하지 못해 기본 대사를 썼으면 `true` (오류 아님, 대화는 계속) |

종료 조건과 `end_reason`·`ended_by`는 [3-4의 표](#3-4-practice-chat--혼자-연습-저장-안-함)와 같습니다 (선택 필드, 종료 시에만). DB에는 종료 이유를 저장하지 않습니다. `mock_action`은 이 경로에서 생기지 않습니다.

| 오류 | 상태 | 언제 | FE 처리 |
|---|---|---|---|
| `PII_BLOCKED` | 422 | 전화번호·주민번호·계좌번호 입력. **저장 안 됨** | 입력 유지 + 경고 |
| `SESSION_ENDED` | 409 | 이미 끝난 세션 | 결과 화면으로 |
| `NOT_FOUND` | 404 | 없는 세션 또는 남의 세션 | 처음으로 |
| `BAD_REQUEST` | 400 | session_id 없음, text가 문자열 아님 | — |

```ts
const first = await callFn<ChatTurnResponse>("chat-turn", { session_id });
const turn  = await callFn<ChatTurnResponse>("chat-turn", { session_id, text });
if (turn.ended) { /* session-end 호출 */ }
```

### 3-3. `session-end` — 종료·결과

다시 불러도 같은 결과를 줍니다 (결과는 세션당 1행). 대화 도중에 불러도 됩니다.

**요청** `SessionEndRequest`
```json
{ "session_id": "87565d9f-f9e7-46e7-8fdf-2a52607501f1" }
```

**응답 200** `SessionEndResponse`
```json
{
  "result": {
    "id": "438b789f-8ec7-4168-a86e-2646a4f721e0",
    "session_id": "87565d9f-f9e7-46e7-8fdf-2a52607501f1",
    "user_id": "83f29152-fa75-4604-9688-b4543efda897",
    "outcome": "safe",
    "red_flags": [
      "낯선 번호·처음 보는 상대가 먼저 연락함",
      "그럴듯한 사연이나 신분을 내세워 믿게 만듦",
      "급하다며 생각할 시간을 주지 않음"
    ],
    "feedback": [
      "잘하셨어요! 요구에 응하지 않고 확인을 먼저 했습니다.",
      "앞으로도 평소 알던 번호로 직접 확인하세요."
    ],
    "share_consent": false,
    "created_at": "2026-11-03T09:13:37.967774+00:00"
  }
}
```

| 필드 | 값 |
|---|---|
| `outcome` | `safe` (확인·거절) · `unsafe` (요구에 응함) · `incomplete` (판단 전 종료) |
| `red_flags` | 대화에 나온 사기 단계별 위험 신호 |
| `feedback` | 결과별 안내 문구 2줄 (고정 문구) |

`outcome`은 저장된 시니어 답을 **키워드로 다시 판정**한 값입니다. 대화 중 종료를 결정한 Gemini 판정과 다를 수 있습니다.

| 오류 | 상태 | 언제 |
|---|---|---|
| `NOT_FOUND` | 404 | 없는 세션 또는 남의 세션 |

### 3-4. `practice-chat` — 혼자 연습 (저장 안 함)

홈의 '혼자 연습하기'용입니다. 초대·세션 없이 익명 로그인만 필요하고, **대화를 DB에 저장하지 않습니다.** 대화 기록은 FE가 들고 있다가 매번 보냅니다.
`action`으로 두 가지 요청을 받습니다. 생략하면 대화 1턴입니다 (기존 요청 그대로 동작).

#### (1) 대화 1턴 `PracticeTurnRequest` → `PracticeTurnResponse`

`text` 없이 부르면 첫 대사를 줍니다.

```json
{
  "mission_id": "family",
  "difficulty": "normal",
  "stage": "pressure",
  "history": [
    { "role": "scammer", "text": "엄마 나 폰 고장 나서 친구 폰으로 연락해", "stage": "approach" },
    { "role": "senior", "text": "누구니?", "stage": "approach", "intent": "continue" }
  ],
  "text": "링크 눌렀어",
  "link_offered": true
}
```
| 필드 | 필수 | 기본값 | 제한 |
|---|---|---|---|
| `mission_id` | — | `family` | 64자 이하, `missions`에 있는 id |
| `difficulty` | — | `normal` | `easy` · `normal` · `hard` |
| `stage` | — | `approach` | 직전 응답의 `stage`를 그대로 보냄 |
| `history` | — | `[]` | 최대 24개, 각 `text` 500자 이하, 개인정보 포함 시 거부. 학습자 말에는 직전 응답의 `analysis.intent`를 `intent`로 붙여 보냄 (반복·재확인 판단에 사용) |
| `text` | — | 없음(첫 대사) | 500자 이하 (넘으면 거부) |
| `link_offered` | — | `false` | 앞선 응답에서 `offer_link: true`를 받아 모의 링크를 보여줬으면 `true` |

**응답 200** (형식 설명용 예시)
```json
{
  "reply": "응? 아직 확인이 안 되는데. 다시 한번 봐줄래?",
  "stage": "pressure",
  "ended": false,
  "used_fallback": false,
  "ai_configured": true,
  "analysis": { "text": "링크 눌렀어", "intent": "claimed_action", "uncertain": false, "note": "클릭했다고 주장" },
  "turn_count": 3,
  "max_turns": 8
}
```
| 필드 | 의미 |
|---|---|
| `reply` | 사기범 답장 (개인정보 가림). **빈 문자열이면 표시하지 않음** (명시적 중단) |
| `stage` | 다음 요청에 보낼 단계. 상대가 재확인할 때는 단계가 오르지 않음 |
| `ended` | `true`면 대화 종료. 다음은 `action: "report"` |
| `end_reason` · `ended_by` | 종료 시에만. 아래 표 참고 |
| `analysis` | 학습자 이번 말의 해석. `text`는 실제 발화(사실), `intent`·`note`는 **AI 추정**, `uncertain`이면 종료 근거로 쓰지 않음 |
| `offer_link` | `true`면 이 답장 아래에 **모의 링크**를 표시. 요구(`demand`) 단계에서 한 번만 |
| `turn_count` · `max_turns` | 학습자 발화 수 / 한도 (`MAX_TURNS` 8) |
| `used_fallback` | Gemini 대신 기본 대사를 썼으면 `true` (8초 타임아웃 포함) |
| `ai_configured` | 서버에 `GEMINI_API_KEY`가 설정돼 있는지 |

**학습자 발화 `intent`** (AI 추정, 실제 행동 아님)

| 값 | 의미 |
|---|---|
| `refuse` | 요청을 분명히 거절 |
| `verify_independent` | 원래 알던 연락처 등으로 확인하겠다고 말함 (확인 완료 아님) |
| `verified_in_chat` | 가족에게 이미 확인했다고 말함 ("딸이 옆에 있는데?") |
| `comply` | 요청에 응하겠다는 의사 |
| `claimed_action` | 이미 했다고 말함 ("보냈어", "눌렀어"). 이벤트 없이는 사실로 보지 않음 |
| `suspect` | 상대를 사기로 의심하거나 놀림 |
| `continue` · `unclear` · `stop` | 질문·맞장구 / 판단 어려움 / 연습 중단 |

**종료 규칙과 `end_reason`** — 종료 여부는 AI가 아니라 `_shared/judge.ts`의 규칙이 정합니다.

| `end_reason` | `ended_by` | 언제 |
|---|---|---|
| `user_stopped` | learner | "그만할래" 등 명시적 중단 (**AI 호출 없이 즉시**) · 화면의 중단 버튼 |
| `refused` | learner | `refuse` |
| `verify_intent` | learner | `verify_independent` |
| `verified_claimed` | learner | `verified_in_chat` |
| `complied` | learner | `comply`이고 요구 단계이거나 모의 링크가 표시된 뒤 |
| `claimed_action` | learner | `claimed_action`이 두 번째 (첫 번째는 상대가 재확인) |
| `scammer_left` | scammer | 노골적 의심에 상대가 물러남 · 의심/행동 주장이 이미 있었는데 또 나옴 · 같은 답 세 번째. **연출이며 평가 근거 아님** |
| `inconclusive` | system | 학습자 발화가 `MAX_TURNS`(8)에 도달 |
| `mock_action` | learner | 화면에서 모의 링크를 누름 (FE가 기록, 턴 요청 없이 바로 종료) |

`uncertain: true`인 판정으로는 종료하지 않습니다 (중단 제외).

#### (2) 종료 후 리포트 `PracticeReportRequest` → `PracticeReportResponse`

```json
{
  "action": "report",
  "mission_id": "family",
  "end_reason": "mock_action",
  "history": [{ "role": "senior", "text": "왜?", "stage": "pressure", "intent": "continue" }],
  "events": [{ "type": "link_clicked", "at": "2026-11-04T05:00:00.000Z" }],
  "link_offered": true
}
```
- `events`: **화면에서 실제로 기록된 행동만**. `type`은 `link_clicked` · `transfer_sent`, 최대 5개. 현재 화면은 `link_clicked`만 기록합니다.

**응답 200**
```json
{
  "feedback": { "summary": "…", "points": ["…"], "next_step": "…" },
  "feedback_source": "ai",
  "observations": ["“왜?” — …", "훈련 화면에서 모의 링크를 열었어요."]
}
```
| 필드 | 의미 |
|---|---|
| `observations` | 기록만으로 만든 근거 문장 (서버 규칙, AI 아님). 말과 이벤트를 구분해서 씀 |
| `feedback` | Gemini 피드백. 형식이 틀리거나, **이벤트 없이 클릭·송금을 사실로 쓰거나**, 번호·URL이 있으면 버리고 기본 피드백 사용 |
| `feedback_source` | `ai` 또는 `fallback` (키 없음·실패·검증 탈락·8초 타임아웃) |

이 요청이 실패해도 FE는 같은 규칙(`judge.ts`)으로 근거·기본 피드백을 만들어 리포트를 보여줍니다.

| 오류 | 상태 | 언제 |
|---|---|---|
| `PII_BLOCKED` | 422 | `text`에 개인정보 |
| `SESSION_ENDED` | 409 | 학습자 발화가 이미 `MAX_TURNS`에 도달한 기록으로 턴 요청 |
| `NOT_FOUND` | 404 | 없는 미션 |
| `BAD_REQUEST` | 400 | 필드 형식·길이 위반, `history`·`events`·`end_reason` 이상 |

> 서버는 DB 없이 FE가 보낸 기록을 기준으로 턴 수를 셉니다. 기록을 조작하면 우회할 수 있으므로, 저장·집계가 필요한 경우에는 `chat-turn`(DB) 경로를 써야 합니다.

### 3-5. `transcribe` — 녹음 → 텍스트

녹음형 음성 입력용입니다. 결과는 바로 대화에 보내지 않고, 화면에서 사용자가 확인·수정한 뒤 `practice-chat`으로 보냅니다. 음성과 인식 결과는 저장하거나 로그에 남기지 않습니다.

**요청** `TranscribeRequest`
```json
{ "audio": "<base64>", "mime_type": "audio/webm;codecs=opus" }
```
- `audio`: base64, 최대 약 1.5MB (`MAX_AUDIO_B64` 2,000,000자). 화면은 최대 30초까지 녹음
- `mime_type`: `audio/webm` · `audio/ogg` · `audio/opus` · `audio/wav` · `audio/mpeg` · `audio/mp3` · `audio/aac` · `audio/m4a` · `audio/mp4`(→ m4a로 전송, 미검증)

**응답 200** `TranscribeResponse`
```json
{ "text": "원래 번호로 전화해 볼게" }
```
숫자로 된 전화번호·계좌번호는 가려서(`*`) 돌려줍니다.

| 오류 | 상태 | 언제 | FE 처리 |
|---|---|---|---|
| `AUDIO_INVALID` | 400 | 지원하지 않는 형식, 너무 큼, base64 아님 | 글자 입력 안내 |
| `TRANSCRIBE_EMPTY` | 422 | 녹음이 너무 짧거나 말소리 없음 | 다시 말하기 안내 |
| `AI_NOT_CONFIGURED` | 503 | `GEMINI_API_KEY` 미설정 | 글자 입력 안내 |
| `TRANSCRIBE_FAILED` | 502 | Gemini 오류·타임아웃(15초) | 재녹음 또는 글자 입력 |

모델: `GEMINI_TRANSCRIBE_MODEL` (기본 `gemini-3.5-transcribe`), Interactions API(`POST /v1beta/interactions`, `Api-Revision: 2026-05-20`), 언어 힌트 `ko-KR`.

---

## 4. DB 직접 호출

권한(RLS)으로 **본인 데이터만** 보이고, **정해진 컬럼만** 쓸 수 있습니다. 삭제는 모든 테이블에서 불가합니다.
실패 시 supabase-js는 `{ data: null, error }`를 돌려줍니다 (권한 위반은 `error.code = "42501"`).

### `invites` — 초대 링크 생성 (보호자)

```ts
const { data, error } = await sb().from("invites")
  .insert({ senior_name: "어머니", difficulty: "normal", max_participants: 1 })
  .select("token").single();
const link = `${location.origin}/?invite=${data.token}`;
```

| 쓸 수 있는 컬럼 | 값 | 기본값 |
|---|---|---|
| `senior_name` | 시니어 호칭 (자유 입력, 실명 넣지 않기) | `""` |
| `difficulty` | `easy` · `normal` · `hard` | `normal` |
| `max_participants` | 1~200 (가족 1, 기관 N) | `1` |

`token`(64자)·`created_by`·`expires_at`(7일 후)은 서버가 채웁니다. 조회는 본인이 만든 초대만 가능합니다.

전체 행 예시:
```json
{
  "id": "3f24d06e-8fdf-43f4-9d03-6385e740b85e",
  "token": "6fcd987491504593bec47dbc60de786f4aff723226a34261b0111d9974975fb8",
  "created_by": "0161728e-3827-4e67-94e9-34738dff8bad",
  "senior_name": "어머니",
  "difficulty": "normal",
  "max_participants": 1,
  "expires_at": "2026-11-10T09:13:29.807159+00:00",
  "created_at": "2026-11-03T09:13:29.807159+00:00"
}
```

### `missions` — 미션 목록 (읽기 전용)

```ts
const { data } = await sb().from("missions").select("id, title, scam_type, sort").order("sort");
```
```json
[
  { "id": "family",    "title": "가족·지인 사칭", "scam_type": "family",    "sort": 1 },
  { "id": "authority", "title": "기관 사칭",      "scam_type": "authority", "sort": 2 },
  { "id": "financial", "title": "금융·계좌 사기", "scam_type": "financial", "sort": 3 }
]
```
`persona`·`fallback_lines`(AI용)도 있지만 화면에는 필요 없습니다. 미션 id를 코드에 하드코딩하지 말고 이 목록을 쓰세요.

### `sessions` — 훈련 시작 (시니어)

```ts
const { data } = await sb().from("sessions")
  .insert({ participant_id, mission_id: "family" })   // mode는 선택: "chat"(기본) · "voice"
  .select("id").single();
```
```json
{
  "id": "87565d9f-f9e7-46e7-8fdf-2a52607501f1",
  "participant_id": "787c8538-6b7e-4151-b9ed-61290a94662d",
  "user_id": "83f29152-fa75-4604-9688-b4543efda897",
  "mission_id": "family",
  "mode": "chat",
  "stage": "approach",
  "status": "active",
  "turn_count": 0,
  "started_at": "2026-11-03T09:13:32.613004+00:00",
  "ended_at": null
}
```
쓸 수 있는 컬럼은 `participant_id`(본인 것만) · `mission_id` · `mode`. `stage`·`status`·`turn_count`는 서버만 바꿉니다.

### `messages` — 대화 기록 (읽기 전용)

```ts
const { data } = await sb().from("messages").select("role, text, stage").eq("session_id", id).order("created_at");
```
본인 세션만 보입니다. 저장은 `chat-turn`만 합니다. `text`는 개인정보를 가린 값입니다.

### `results` — 결과 조회·공유 동의

```ts
const { data } = await sb().from("results").select().eq("session_id", id).single();
await sb().from("results").update({ share_consent: true }).eq("session_id", id);
```
본인 결과만 보이고, 바꿀 수 있는 건 `share_consent` 하나뿐입니다.

---

## 5. 오류 코드

| 코드 | 상태 | 어디서 | FE 처리 |
|---|---|---|---|
| `INVITE_INVALID` | 404 | invite-join | E01 "유효하지 않은 링크" |
| `INVITE_EXPIRED` | 410 | invite-join | E01 "유효기간 지남" |
| `INVITE_FULL` | 409 | invite-join | E01 "인원 가득 참" |
| `PII_BLOCKED` | 422 | chat-turn · practice-chat | 입력 유지 + 경고 |
| `AUDIO_INVALID` · `TRANSCRIBE_EMPTY` · `TRANSCRIBE_FAILED` · `AI_NOT_CONFIGURED` | 400 · 422 · 502 · 503 | transcribe | 재녹음 또는 글자 입력 |
| `SESSION_ENDED` | 409 | chat-turn · practice-chat(턴 한도) | 결과 화면으로 |
| `NOT_FOUND` | 404 | chat-turn · session-end · practice-chat | 처음으로 |
| `BAD_REQUEST` | 400 | 전체 | 요청 형식 확인 (개발 중 버그) |
| `UNAUTHORIZED` | 401 | 전체 | `ensureAnon()` 후 재시도 |
| `INTERNAL` | 500 | 전체 | 재시도 안내 |

로그인 없이 부르면 Supabase 게이트웨이가 먼저 막고 형식이 다릅니다: `401 {"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}`. `callFn`은 이것도 `Error`로 던집니다.

`AI_TIMEOUT`은 응답으로 오지 않습니다. AI가 늦으면 기본 대사로 대화가 계속되고 `used_fallback: true`가 됩니다.

---

## 6. 아직 없는 API

| 기능 | 화면 | 예정 |
|---|---|---|
| 보호자가 자기 링크의 참여자·진행·결과 보기 (공유 동의한 것만) | G05 · G06 · G07 | Phase 3 (마이그레이션 002) |
| 안전 약속 저장·승인 | F01 · F02 | Phase 3 (`pledges`, `approve_pledge`) |
| 진행 현황 실시간 알림 | G05 · G06 | Phase 3 (Realtime) |
| 기관 집계 | I02 | 확장 |
| DB 세션(`chat-turn`·`session-end`)의 종료 이유·intent 저장, AI 피드백 | S07 | 마이그레이션 필요 (현재 `session-end`는 키워드 판정·고정 문구) |

---

**관련**: 전체 호출과 오류 케이스가 실제로 동작하는 코드는 `supabase/tests/e2e.mjs` (`npm run test:e2e`), 혼자 연습 화면 예시는 `src/app/roleplay/chat/page.tsx`.
Supabase 대시보드의 Data API → Docs 탭은 테이블만 다루고, "자동 노출"을 꺼 둔 설정 때문에 내용이 거의 비어 보입니다. 이 문서를 기준으로 봐 주세요.
