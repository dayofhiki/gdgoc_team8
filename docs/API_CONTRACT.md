# API 문서

> 프론트가 부르는 API 전부. 응답 예시는 배포된 프로젝트(`pedmhdnmhmzsezerrzvk`)에 실제로 호출해 받은 값입니다 (2026-11-03).
> 타입 원본: `supabase/functions/_shared/types.ts` (FE는 `@shared/types`) · 설계: [BE_FLOW](BE_FLOW.md)

## 목차
1. [기본 정보](#1-기본-정보)
2. [화면별 호출 순서](#2-화면별-호출-순서)
3. [Edge Functions](#3-edge-functions) — `invite-join` · `chat-turn` · `session-end`
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
| `used_fallback` | AI가 8초 안에 답하지 못해 기본 대사를 썼으면 `true` (오류 아님, 대화는 계속) |

| 오류 | 상태 | 언제 | FE 처리 |
|---|---|---|---|
| `PII_BLOCKED` | 422 | 전화·주민/외국인번호·카드·계좌·이메일·링크·생일(키워드 동반) 입력. **저장 안 됨** | 입력 유지 + 경고 |

`PII_BLOCKED`는 걸린 종류를 `types`로 함께 보냅니다 (경고 문구용, 선택 필드):
```json
{ "error": { "code": "PII_BLOCKED", "message": "전화번호·계좌번호 같은 실제 정보는 입력하지 마세요", "types": ["phone"] } }
```
`types` 값: `rrn` 주민·외국인번호 · `phone` · `card` · `account` · `email` · `url` · `birth` · `number`(은행명 없는 10자리 이상 숫자). 못 잡는 것: 한글 숫자("공일공")·이름·주소·비밀번호.
| `SESSION_ENDED` | 409 | 이미 끝난 세션 | 결과 화면으로 |
| `TURN_CONFLICT` | 409 | 같은 턴을 동시에 두 번 보냄 (연타). 먼저 온 요청만 저장 | 무시 (먼저 보낸 요청의 응답을 씀) |
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
| `feedback` | 결과별 안내 문구 2줄 |

| 오류 | 상태 | 언제 |
|---|---|---|
| `NOT_FOUND` | 404 | 없는 세션 또는 남의 세션 |

---

## 4. DB 직접 호출

권한(RLS)으로 **본인 데이터만** 보이고, **정해진 컬럼만** 쓸 수 있습니다. 삭제는 모든 테이블에서 불가합니다.
실패 시 supabase-js는 `{ data: null, error }`를 돌려줍니다 (권한 위반은 `error.code = "42501"`).

### `invites` — 초대 링크 생성 (보호자)

```ts
const { data, error } = await sb().from("invites")
  .insert({ senior_name: "어머니", difficulty: "normal" })
  .select("token").single();
const link = `${location.origin}/?invite=${data.token}`;
```

| 쓸 수 있는 컬럼 | 값 | 기본값 |
|---|---|---|
| `senior_name` | 시니어 호칭 (자유 입력, 실명 넣지 않기) | `""` |
| `difficulty` | `easy` · `normal` · `hard` | `normal` |
| `max_participants` | 1~200. 익명 로그인이라 같은 사람도 브라우저가 바뀌면 새 참여자로 세므로 보통 생략 | `200` |

`token`(64자)·`created_by`·`expires_at`(7일 후)은 서버가 채웁니다. 조회는 본인이 만든 초대만 가능합니다.

전체 행 예시:
```json
{
  "id": "3f24d06e-8fdf-43f4-9d03-6385e740b85e",
  "token": "6fcd987491504593bec47dbc60de786f4aff723226a34261b0111d9974975fb8",
  "created_by": "0161728e-3827-4e67-94e9-34738dff8bad",
  "senior_name": "어머니",
  "difficulty": "normal",
  "max_participants": 200,
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
| `PII_BLOCKED` | 422 | chat-turn | 입력 유지 + 경고 (`types`로 종류 표시 가능) |
| `SESSION_ENDED` | 409 | chat-turn | 결과 화면으로 |
| `TURN_CONFLICT` | 409 | chat-turn | 무시 |
| `NOT_FOUND` | 404 | chat-turn · session-end | 처음으로 |
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

---

**관련**: 전체 호출과 오류 케이스가 실제로 동작하는 코드는 `supabase/tests/e2e.mjs` (`npm run test:e2e`), 화면 구현 예시는 `src/app/page.tsx`.
Supabase 대시보드의 Data API → Docs 탭은 테이블만 다루고, "자동 노출"을 꺼 둔 설정 때문에 내용이 거의 비어 보입니다. 이 문서를 기준으로 봐 주세요.
