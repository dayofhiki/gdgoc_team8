# API 계약 (가족 · 초대 · 연습 기록)

> 구현: `functions/src/family.ts` (Cloud Function `backend`) · 화면용 도우미: `src/lib/invite.ts`, `src/lib/records.ts` · 설계: [BE_FLOW](BE_FLOW.md)

화면은 아래 엔드포인트를 직접 부르지 않고 `src/lib`의 함수만 씁니다. 이 문서는 그 함수들이 부르는 서버 계약입니다.

## 1. 공통

| 항목 | 값 |
|---|---|
| 주소 | `POST https://asia-northeast3-<projectId>.cloudfunctions.net/backend` |
| 본문 | `{ "action": "<이름>", ...인자 }` (JSON) |
| 인증 | `Authorization: Bearer <Firebase ID 토큰>` (익명 로그인) |
| 성공 | `200` + 결과 JSON |
| 실패 | `{ "error": { "code": "<코드>", "message": "..." } }` |

`src/lib/firebase.ts`의 `callFn(action, body)`가 익명 로그인·토큰·주소를 처리하고, 실패하면 `Error.message = code`로 던집니다.

| 코드 | HTTP | 뜻 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 토큰 없음·만료 |
| `BAD_REQUEST` | 400 | 형식 오류, 모르는 action |
| `FORBIDDEN` | 403 | 그 가족 구성원이 아님 (`src/lib`는 이때 기기에 저장된 가족 id를 버림) |
| `INVITE_INVALID` | 404 | 없는 초대 토큰 |
| `INVITE_EXPIRED` | 410 | 만료된 초대 (발급 후 7일) |
| `INVITE_FULL` | 409 | 정원 초과 |
| `INTERNAL` | 500 | 서버 오류 |

## 2. action 목록

`familyId`가 필요한 action은 모두 **호출한 사람이 그 가족 구성원일 때만** 동작합니다 (아니면 `FORBIDDEN`).

| action | 인자 | 결과 | `src/lib` 함수 |
|---|---|---|---|
| `myFamily` | `nickname?` | `{ familyId }` — 내 가족, 없으면 새로 만들고 나를 첫 구성원으로 | (내부) `myFamilyId` |
| `createInvite` | `familyId`, `nickname?`, `maxParticipants?` (1~200, 기본 200) | `{ token, expires_at, family_id }` | `getInviteToken`, `familyShareUrl` |
| `joinInvite` | `token`, `nickname?` | `{ participant_id, invite: { senior_name, difficulty, family_id, inviter_name } }` | `joinInvite` |
| `saveQuestion` | `familyId`, `question` (1~60자) | `{}` — 같은 질문이 있으면 그대로 | `saveFamilyQuestion` |
| `questions` | `familyId` | `[{ id, question, created_at }]` 최신순 | `familyQuestions` |
| `familySize` | `familyId` | `{ count }` (나 포함) | `familySize` |
| `setShare` | `familyId`, `share: boolean` | `{ share_results }` | `setShareResults` |
| `syncNickname` | `familyId`, `nickname` (1~20자) | `{}` | `syncFamilyNickname` |
| `overview` | `familyId` | `FamilyMemberSummary[]` 입장순 | `familyOverview` |
| `saveRecord` | `kind`, `title?`, `safe?`, `score?`, `total?`, `detail?` | `{}` | `saveRecord` |

### 규칙
- **joinInvite**: 만료 → 정원 → 참여 등록 → 가족 구성원 등록을 한 트랜잭션으로 처리. 같은 사람이 다시 들어오면 정원을 쓰지 않고 그대로 통과합니다. `participant_id`는 사용자 uid입니다.
- **overview**: 공유를 끈 구성원은 이름만 보이고 `record_count`·`safe_count`·`last_at`·`recent`가 `null`. 내 기록은 항상 보입니다. `recent`는 최근 5개.
- **saveRecord**: `kind`는 `quiz` · `challenge` · `training`. `score ≥ 0`, `total ≥ 1`, `score ≤ total`, `detail`은 JSON 2000자 이하. 대화 원문은 저장하지 않습니다.
- 문자열은 앞뒤 공백을 지우고 길이 상한(별명 20, 제목·질문 60)으로 자릅니다.

### FamilyMemberSummary
```ts
{
  user_id: string; nickname: string; is_me: boolean; share_results: boolean; joined_at: string;
  record_count: number | null; safe_count: number | null; last_at: string | null;
  recent: { kind; title; safe; score; total; created_at }[] | null;
}
```
타입 원본은 `src/server/types.ts`(화면)와 `functions/src/family.ts`(서버) 두 곳에 있습니다. 함수는 따로 배포돼서 서로 import할 수 없으니, 바꿀 때는 둘 다 맞춰 주세요.

## 3. 확인 방법
- 서버 로직: `npm run test:firebase` (Firestore emulator, Java 11+ 필요)
- 실제 호출 예: `curl -X POST <주소> -H "Authorization: Bearer <ID 토큰>" -H "Content-Type: application/json" -d '{"action":"myFamily"}'`
