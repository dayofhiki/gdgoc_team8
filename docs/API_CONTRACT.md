# FE·BE·AI 계약

설계 배경: [BE_FLOW.md](BE_FLOW.md). 타입 원본: `supabase/functions/_shared/types.ts` (FE는 `@shared/types`로 import). 필드는 optional로만 추가, union 값 삭제 금지.

## 인증
첫 방문 시 `signInAnonymously()` (`src/lib/supabase.ts`의 `ensureAnon`). 이후 모든 DB·Edge Function 호출에 SDK가 JWT를 자동 첨부.

## Edge Functions
POST + JSON. FE는 `callFn(name, body)` 사용. 성공 200, 실패 `{ error: { code, message } }` (`callFn`은 `Error.message = code`로 던짐).

| 함수 | 요청 | 응답 | 오류 |
|---|---|---|---|
| `invite-join` (여러 명 동시 입장 가능, DB 함수 `join_invite`가 행 잠금으로 인원 초과 방지) | `{ token }` | `{ participant_id, invite: { senior_name, difficulty } }` | 404 `INVITE_INVALID`, 410 `INVITE_EXPIRED`, 409 `INVITE_FULL` |
| `chat-turn` | `{ session_id, text? }` — `text` 없으면 오프닝 대사 | `{ reply: Message, stage, ended, used_fallback }` | 422 `PII_BLOCKED` (저장 안 함), 409 `SESSION_ENDED`, 404 `NOT_FOUND` |
| `session-end` | `{ session_id }` | `{ result: Result }` (재호출 시 같은 결과) | 404 `NOT_FOUND` |

FE는 `chat-turn` 응답의 `ended`가 true면 `session-end`를 호출해 결과를 받는다. 종료 판정을 FE가 직접 하지 않는다.

## DB 직접 접근 (RLS로 본인 데이터만)

| 기능 | 호출 |
|---|---|
| 초대 링크 생성 (G03) | `invites.insert({ senior_name, difficulty, max_participants? }).select("token")` → 링크 `/?invite=<token>`. 인원: 가족 1(기본), 기관 최대 200 |
| 미션 목록 (S02) | `missions.select().order("sort")` |
| 훈련 시작 (S04) | `sessions.insert({ participant_id, mission_id, mode? }).select("id")` |
| 결과 공유 동의 (S07) | `results.update({ share_consent }).eq("session_id", …)` |

보호자 열람·진행 현황 Realtime·안전 약속(`pledges`)은 Phase 3 (마이그레이션 002)에서 추가.

## 보안
랜덤 64자 초대 토큰, 기본 7일 만료. Gemini 키는 Supabase Secrets에만. 실제 개인·금융 정보는 입력 단계에서 차단(`PII_BLOCKED`).
