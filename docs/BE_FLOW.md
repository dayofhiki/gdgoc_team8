[구현 플랜](#plan)[공통 규약](#common)[우선순위](#prio)[ERD](#erd)[API](#api)[권한](#auth)[핵심 흐름](#seq)[세션 상태](#state)[구성도](#arch)

BACKEND DESIGN · v6 기준

# 미끼주의보 백엔드 설계

2026-11-03

SupabasePostgres + RLSRealtimeEdge FunctionsGemini

## 구현 플랜

**목표**: 초대 토큰 → 입장 → 채팅 N턴 → 결과 저장까지 E2E 1개 경로를 먼저 확보. 이후 기능은 마이그레이션 추가와 모듈 교체로만 붙여 기존 코드·인터페이스 수정을 막음.

| Phase | 목적 | 산출물 | 완료 기준 (검증 방법) |
| --- | --- | --- | --- |
| 0 Setup | 팀원 4명이 같은 타입·환경에서 병렬 개발 시작 | 레포 구조, Supabase 프로젝트, `types.ts`, mock `generateReply` | FE에서 `signInAnonymously()` 성공, mock 호출 시 `AiOutput` 반환 |
| 1 E2E | 핵심 경로 동작 확인, 이후 모든 작업의 기준선 | 마이그레이션 001 (테이블 6개 + RLS 본인 접근만), `invite-join` · `chat-turn` · `session-end`, FE S01→S02→S05→S07 연동 | 새 토큰으로 입장 후 3턴 대화 → `messages` 7행, `results` 1행 생성 |
| 2 AI | mock을 실제 Gemini로 교체 | `_shared/ai.ts` 구현, 8초 타임아웃 시 `fallback_lines` | `ai.ts` 외 diff 없이 Phase 1 시나리오 통과, 키 제거 시 `used_fallback: true` |
| 3 Guardian | 보호자 화면을 실제 데이터에 연결 | 마이그레이션 002 (보호자 RLS, `pledges`, `approve_pledge` RPC), Realtime 구독 | 두 브라우저에서 입장·진행·승인 반영 2초 이내, 동의 전 보호자 쿼리가 `messages` 0행 |
| 4 Demo | 시연 당일 장애 없이 시연 | 시연용 미션 시드, 배포 URL, 녹화 백업 | 배포 환경에서 전체 경로 3회 연속 성공 |

### 확장 대비 규칙

| 대상 | 규칙 |
| --- | --- |
| 마이그레이션 | `ADD COLUMN` · `CREATE TABLE`만. 기존 컬럼·값 rename/drop 금지 |
| `types.ts` | 필드는 optional로만 추가. union 값 삭제 금지 |
| 판정·단계 전환 | `chat-turn` 내부 한 함수에만 둠. FE는 응답의 `ended`만 보고 판단하지 않음 |
| 미션 | `missions` INSERT로 추가. 코드에 미션 id 하드코딩 금지 |

### 확장 지점

| 기능 | 현재 상태 | 추가 작업 |
| --- | --- | --- |
| 가족 확인 훈련 | FE 목업 | `sessions.verify_requested_at`, `guardian_reply` 추가 + Realtime 구독 |
| 실시간 음성 | `mode: voice` + 브라우저 TTS/STT | 스트리밍용 Edge Function 신규, `chat-turn` 유지 |
| 판정 고도화 | mock 키워드 판정 | `ai.ts` 내부만 교체 |
| 기관 다중 참여 | 초대 생성 시 `max_participants` 지정 (1~200), `join_invite` 잠금으로 동시 입장 안전 | 집계 뷰 |
| 보호자 계정 | 익명 사용자 | `linkIdentity`로 같은 uid 유지 |

## 공통 규약

타입 정의는 `supabase/functions/_shared/types.ts` 한 파일. FE·BE·AI 모두 이 파일을 import합니다.

| 항목 | 규칙 |
| --- | --- |
| 언어 | TypeScript (FE, Edge Functions 공통) |
| 필드명 | DB·JSON·TS 모두 `snake_case`. 변환 없음 |
| 값 | 영어 소문자 (`chat`, `easy`, `ended`). 한글 표기는 FE에서만 |
| ID · 시간 | uuid, 미션만 slug(`family`) · ISO 문자열 |
| 로그인 | 첫 방문 시 Supabase 익명 로그인. 토큰은 SDK가 자동 전달 |
| Edge Function | POST + JSON. 성공 200, 실패 4xx/5xx + `{ error: { code, message } }` |
| AI 연결 | AI 담당이 `generateReply(input)` 하나를 `_shared/ai.ts`에 구현, BE가 호출. 8초 초과·실패 시 미션의 기본 대사 |
| 전화 모드 | 브라우저 음성 읽기·인식 + 같은 `chat-turn`. 실시간 음성 스트리밍은 MVP 제외 |
| 대화 단계 | `approach` → `trust` → `pressure` → `demand` (모든 미션 공통) |

| 레포 | 내용 |
| --- | --- |
| 레포 루트 (`src/`) | 프론트엔드 (Next.js) |
| `/supabase/migrations` | 스키마·RLS SQL |
| `/supabase/functions` | `invite-join` · `chat-turn` · `session-end` |
| `/supabase/functions/_shared` | `types.ts` · `ai.ts` · `pii.ts` · `http.ts` |
| `/supabase/seed.sql` | 미션 (Phase 1: 3개 `family`·`authority`·`financial`, Phase 4: 8개) |

| 환경변수 | 위치 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` | FE `.env.local` (공개돼도 됨) |
| `GEMINI_API_KEY` | Supabase Secrets만. 레포에 올리지 않음 |

브랜치: `main` 보호, 작업은 `feat/영역-내용` → PR → 팀원 1명 리뷰 → Squash and merge ([COLLABORATION](COLLABORATION.md)).

## 우선순위

**1순위 · 시연 필수**테이블·RLS, 초대·입장, 채팅 대화, 결과

**2순위**진행 현황 동기화, 공유 동의, 안전 약속

**3순위**실시간 음성, 기관 집계, 링크 만료

**어려운 곳** · 전화 모드 실시간 음성(지연), 대화 종료 판정(부정문 오판), 음성 속 개인정보 가리기. AI 담당과 함께 정해야 합니다.

### 팀에서 정할 것

- 종료 판정: AI vs 서버 규칙
- 이탈 기준 시간, 링크 유효기간
- 대화 기록 보관 기간

## ERD

| 설계 결정 | 이유 |
| --- | --- |
| 초대와 참여자 분리 | 기관 링크 하나로 여러 명 입장. 정원 기본 200 (익명 로그인이라 브라우저가 바뀌면 새 참여자로 셈) |
| invites에 미션 없음 | 미션은 시니어가 입장 후 선택 |
| 긴 토큰 | 6자리 코드는 추측 가능 |
| messages는 가린 텍스트만 | 개인정보·음성 원본 미저장 |

| 테이블 | 컬럼 |
| --- | --- |
| `missions` | `id` text pk (slug), `title`, `scam_type`, `persona`, `fallback_lines` jsonb (단계별 기본 대사), `sort` |
| `invites` | `id`, `token` unique (32바이트 랜덤 hex), `created_by` (보호자 uid), `senior_name`, `difficulty` (`easy`·`normal`·`hard`), `max_participants` default 200, `expires_at`, `created_at` |
| `participants` | `id`, `invite_id`, `user_id` (시니어 uid), `joined_at`, unique(`invite_id`, `user_id`) |
| `sessions` | `id`, `participant_id`, `user_id`, `mission_id`, `mode` (`chat`·`voice`), `stage`, `status`, `turn_count`, `started_at`, `ended_at` |
| `messages` | `id`, `session_id`, `role` (`scammer`·`senior`), `text`, `stage`, `created_at` |
| `results` | `id`, `session_id` unique, `user_id`, `outcome` (`safe`·`unsafe`·`incomplete`), `red_flags` jsonb, `feedback` jsonb, `share_consent` default false, `created_at` |

난이도는 `invites.difficulty`를 따름 (세션에 복사하지 않아 클라이언트가 바꿀 수 없음). 원본: `supabase/migrations/*_001_init.sql`. `pledges`는 Phase 3 (`002`).

## API

| 기능 | 방식 | 호출 | 화면 |
| --- | --- | --- | --- |
| 대화 1턴 | EF | `chat-turn` | S05 |
| 훈련 종료·판정 | EF | `session-end` | S06 |
| 링크 확인·입장 | EF | `invite-join` | S01 |
| 초대 링크 생성 | DB | `invites` insert | G03 |
| 미션 목록 | DB | `missions` select | S02 |
| 훈련 시작 | DB | `sessions` insert | S04 |
| 결과·공유 동의 | DB | `results` | S07, G07 |
| 진행 현황 | RT | 세션 상태 구독 | G05, G06 |
| 약속 제출·승인 | RT | `pledges` | F01, F02 |
| 기관 집계 | DB | 집계 뷰 | I02 |

| 오류 | 처리 |
| --- | --- |
| `AI_TIMEOUT` | 기본 대사로 계속 |
| `PII_BLOCKED` | 사용자 입력에 전화번호·계좌·주민번호가 있으면 저장하지 않고 422 반환. FE는 입력 유지 + 경고. AI 출력은 마스킹 후 저장 |
| `INVITE_EXPIRED` · `INVALID` · `FULL` | E01 안내 |

## 권한

| 데이터 | 시니어 | 보호자 | 기관 |
| --- | --- | --- | --- |
| 대화·결과 | 조회 | **공유 동의 시만** | 불가 |
| 진행 상태 | 조회 | 조회 | 인원수만 |
| 안전 약속 | 작성 | 조회·승인 | 불가 |
| 초대 링크 | 입장 | 생성·조회 | 생성·조회 |

공유 동의는 화면이 아니라 RLS에서 걸러야 합니다.

## 핵심 흐름

#### 대화 1턴

1. 시니어 → chat-turn답장 전송
2. chat-turn개인정보 가리기
3. chat-turn → Gemini시나리오 + 대화
4. Gemini → chat-turn답장 + 판정
5. chat-turn → DB저장
6. chat-turn → 시니어사기범 답장

#### 초대 → 입장

1. 보호자 → DB초대 생성
2. 보호자 → 시니어링크 공유
3. 시니어 → invite-join링크 열기
4. invite-join → DB검증 + 참여자 등록
5. Realtime → 보호자입장 알림

#### 약속 제출 → 승인

1. 시니어 → DB약속 제출
2. Realtime → 보호자도착 알림
3. 보호자 → DB승인
4. Realtime → 시니어승인 완료

## 세션 상태

| `status` | 의미 | 전환 |
| --- | --- | --- |
| `active` | 대화 중 | `sessions` insert 시 |
| `ended` | 종료·판정 완료 | `chat-turn`이 `ended: true`를 낼 때, 또는 `session-end` (중도 종료) |
| `abandoned` | 이탈 | 기준 시간 팀 결정 후 (Phase 1은 값만 정의) |

`stage`는 `approach` → `trust` → `pressure` → `demand`. 전환·종료 판정은 `chat-turn`의 `decideNext()` 한 곳. 첫 대사는 `text` 없이 `chat-turn` 호출 → 3턴 = 메시지 7행.

## 구성도

**웹**

보호자·기관

시니어

→

**Supabase**

DB + RLS

Realtime상태 → 상대 화면

Edge Functionsinvite-join · chat-turn · session-end

→

**AI**

Geminichat-turn에서만 호출