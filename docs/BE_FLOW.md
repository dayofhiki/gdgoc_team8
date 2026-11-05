# 미끼주의보 백엔드 설계

> 호출 목록: [API_CONTRACT](API_CONTRACT.md) · 2026-11 Supabase → Firebase 전환 후 기준

## 구성도
```
브라우저 ──▶ Dokploy: Next.js (화면, AI 문자 훈련 /api/real-training)
   │
   └──▶ Firebase (asia-northeast3)
          ├ Authentication: 익명 로그인
          ├ Cloud Function `backend` (functions/src) ── 가족·초대·연습 기록 로직 + 권한 검사
          └ Firestore (Standard): 데이터 저장. Rules는 브라우저 직접 접근 전부 거부
```
- AI(Gemini → Groq → OpenRouter 자동 전환, `src/server/llm.ts`)는 Next 서버에서 돌고, 키는 Dokploy env에 있습니다. Firebase에는 AI 키가 없습니다.
- Cloud Function은 Firebase 안에서 돌아서 서비스 계정 키가 필요 없습니다. Blaze 요금제 필수.

## 데이터 (Firestore)
```
families/{fid}                  { createdBy, createdAt }
families/{fid}/members/{uid}    { nickname, shareResults, joinedAt }
families/{fid}/questions/{qid}  { question, createdBy, createdAt }     ← 가족 암호 질문 (답은 저장 안 함)
invites/{token}                 { familyId, inviterName, seniorName, difficulty,
                                  maxParticipants, participants[], createdBy, createdAt, expiresAt }
users/{uid}                     { familyId }                           ← 처음 속한 가족
users/{uid}/records/{rid}       { kind, title, safe, score, total, detail, createdAt }  ← 연습 요약
```
- 한 사람이 여러 가족에 속할 수 있지만, 기기는 최근에 만들거나 들어간 가족 하나만 기억합니다 (`mikki:family:v2`).
- 초대 토큰은 64자리 hex. 7일 뒤 만료(서버가 검사), 정원 기본 200 — 익명 로그인이라 같은 사람이 브라우저를 바꾸면 새 참여자가 되기 때문.

## 권한
Rules는 전부 거부하고, 모든 검사는 `family.ts`에서 합니다.

| 데이터 | 누가 |
|---|---|
| 가족 정보·구성원·질문 | 그 가족 구성원만 읽기·쓰기 |
| 내 공유 설정·별명 | 본인만 |
| 연습 기록 | 본인은 항상, 같은 가족은 본인이 그 가족에 공유를 켰을 때만 (기본 꺼짐) |
| 초대 만들기 | 그 가족 구성원만 |

문서 id로 쓰이는 값(`familyId`, `token`)은 형식부터 확인해서 경로 조작을 막습니다.

## 핵심 흐름
**가족 만들기 → 초대**: 초대 화면 → `myFamily`(없으면 생성, 트랜잭션이라 동시 호출해도 1개) → `createInvite` → 링크 `/challenge?invite=<token>&from=<별명>` 공유. 같은 링크는 만료 하루 전까지 재사용합니다.

**입장**: 링크 → `joinInvite` 트랜잭션(만료 → 정원 → 참여 등록 → 구성원 등록) → 기기에 가족 id 저장. 오류면 링크 오류 화면, 연결 실패면 오프라인으로 계속.

**기록·공유**: 퀴즈·훈련이 끝나면 `saveRecord` → 보호자 화면은 `overview`로 구성원별 요약을 봅니다.

## 실패 처리
- Firebase 설정(`NEXT_PUBLIC_FIREBASE_*`)이 없거나 호출이 실패하면 `src/lib`는 null·`"offline"`을 돌려주고, 화면은 서버 없이 동작합니다.
- 익명 로그인은 동시에 여러 번 불려도 한 번만 합니다 (StrictMode 이중 effect 대비).
- 기기에 저장된 가족 id로 `FORBIDDEN`이 오면 저장값을 버리고, 가족을 만들 수 있는 호출(초대·질문 저장)은 한 번 더 시도합니다.

## 의도적으로 뺀 것
| 항목 | 이유 |
|---|---|
| 오래된 익명 계정 자동 삭제 (예전 pg_cron) | 비용이 거의 없음. 필요하면 예약 함수로 추가 |
| 만료 초대 자동 삭제 | 콘솔에서 `invites.expiresAt` TTL 정책만 켜면 됨 (코드 변경 없음) |
| 채팅 세션·메시지 저장 (예전 chat-turn·session-end) | 화면이 쓰지 않아 전환 때 삭제. 문자 훈련은 대화를 저장하지 않음 |
| App Check · 요청 제한 | 아직 없음. 남용 시 Blaze 과금 → 예산 알림 필수, 필요하면 App Check 추가 |

## 배포
```
npx firebase-tools@14 login
npx firebase-tools@14 deploy --only functions,firestore:rules --project gdgoc-team8
```
`functions/`를 바꿨다면 직접 배포해야 합니다 (자동 배포 없음).
