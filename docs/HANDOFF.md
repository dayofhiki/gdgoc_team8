# 백엔드 인수인계 (Handoff)

> 2026-11-03 · 브랜치 `jaeyun/be-pipeline` · 기준 문서 [BE_FLOW](BE_FLOW.md)

## 한눈에 보기

| | 상태 |
|---|---|
| **Phase 0** Setup | ✅ 완료 · Supabase 프로젝트 `pedmhdnmhmzsezerrzvk` 연결 |
| **Phase 1** E2E | ✅ 완료 · 클라우드에서 `npm run test:e2e` 20개 통과 |
| **Phase 2** AI | ⬜ 시작 전 (현재 mock) |
| **Phase 3** 보호자 | ⬜ 시작 전 |
| **Phase 4** 시연 | ⬜ 시작 전 |

**한 줄 요약**: 초대 → 입장 → 채팅 → 결과가 **실제 Supabase 클라우드에서 동작**합니다. 다음은 AI(Gemini)와 보호자 화면입니다.

---

## 1. 지금 동작하는 흐름

```
보호자                      시니어
  │ 초대 링크 생성 (인원 1~200명)
  │ ─── /?invite=<token> ───▶ │ 링크 입장 (익명 로그인)
                              │ 미션 선택 (가족 사칭·기관 사칭·금융 사기)
                              │ 채팅 N턴 (사기범 역할 mock AI)
                              │ 결과 (위험 신호·피드백)
                              │ 안전 약속 (화면에만, 저장 안 됨)
```

## 2. 검증 현황

| 확인 항목 | 결과 | 방법 |
|---|---|---|
| FE 타입·빌드 | ✅ 통과 | `npm run typecheck` · `npm run build` |
| DB·권한 규칙 21개 | ✅ 통과 | `npm run test:backend` (PGlite, Supabase 불필요) |
| 판정·개인정보 로직 4개 | ✅ 통과 | 같은 명령 |
| Edge Function 타입 | ✅ 통과 | `npx deno check supabase/functions/*/index.ts` |
| Edge Function 실제 실행 | ✅ 통과 | `npm run test:e2e` (클라우드) |
| 동시 입장 경합 (잠금) | ✅ 통과 (3회 반복) | 정원 2 링크에 3명 동시 → 2명 성공·1명 `INVITE_FULL`, 다른 링크끼리는 서로 안 막음 |
| Phase 1 완료 기준 (3턴 → messages 7행, results 1행) | ✅ 통과 | 같은 명령. 브라우저 화면 확인은 아직 |

## 3. 다음에 할 일

### BE — 바로 다음
- [x] Supabase 클라우드 프로젝트 생성, 익명 로그인 활성화
- [x] 마이그레이션·시드 push, Edge Function 3개 배포
- [x] E2E 스크립트 (`npm run test:e2e`): 입장·동시 입장·3턴 7행·결과 1행·권한 20개 통과
- [ ] URL·anon key 팀 공유 (팀원은 `.env.local`에 입력)
- [ ] 브라우저 2개로 화면 흐름 직접 확인
- [ ] 클라우드 대시보드 Auth > Rate Limits: 익명 로그인 시간당 한도를 최대로 (기본 30이면 복지관 31번째부터 입장 실패)

### 이슈 (Phase 2 전후로 처리)
| # | 문제 | 해결 방향 | 시점 |
|---|---|---|---|
| E | `session-end`가 키워드(`classify`)로 결과를 다시 계산 → Gemini 판정과 결과 화면이 달라짐 | `chat-turn`이 턴마다 판정을 저장, `session-end`는 모으기만 | Phase 2 |
| F | `withTimeout`은 기다림만 멈추고 Gemini 요청은 계속됨 (비용) | `AbortController` signal을 fetch에 전달 | Phase 2 |
| G | ~~`maskPii`가 숫자만 가림 → AI 답변의 URL·링크 통과~~ | ✅ ko-pii 규칙 이식으로 URL·이메일 가림 | 완료 |

### AI — Phase 2
- [ ] `supabase/functions/_shared/ai.ts`만 Gemini로 교체 ([ONBOARDING](ONBOARDING.md#ai-담당))
- [ ] `test:backend`를 deno로 전환 (Gemini 코드가 `Deno.env`를 쓰면 Node 실행이 깨짐)
- [ ] 키 제거 시 `used_fallback: true` 확인

### FE
- [ ] `page.tsx` 화면별 분리
- [ ] E01(링크 오류)·S06(종료)·S07(결과) 화면을 Figma v6 기준으로
- [ ] **결과 공유 동의 UI** (DB는 준비됨: `results.share_consent`)
- [ ] SCREEN_FLOW의 옛 화면 ID(S03·S04·F03·I01) Figma와 대조

### Phase 3 (마이그레이션 `002`)
- [ ] 보호자 열람 권한 (공유 동의한 결과만)
- [ ] `pledges` 테이블 + `approve_pledge` RPC
- [ ] Realtime 진행 현황 구독

## 4. 팀에서 정해야 할 것

| 질문 | 현재 임시값 | 어디서 바꾸나 |
|---|---|---|
| 대화 종료 판정: AI vs 서버 규칙 | 서버 규칙 (`decideNext`) + AI의 `ended` | `chat-turn/decide.ts` |
| 최대 대화 턴 수 | 8턴 | `chat-turn/decide.ts` `MAX_TURNS` |
| 링크 유효기간 | 7일 | 마이그레이션 `invites.expires_at` 기본값 |
| 이탈 기준 시간 | 시작 후 1일 지나면 `abandoned` (매일 03:00 KST) | 마이그레이션 `003` |
| 대화 기록 보관 기간 | 무기한 | 미정 |

## 5. 내가 내린 결정 (이유 포함)

| 결정 | 이유 |
|---|---|
| Next.js는 레포 루트 유지 (`/web` 안 만듦) | 파일 이동 없이 바로 작업 |
| Supabase 클라우드 프로젝트 1개 공유 | Docker 없이 팀 전원 같은 환경 |
| 입장은 DB 함수 `join_invite`로 처리 | 초대 행을 잠가서 동시 입장해도 인원 초과 안 됨 |
| `sessions`에 난이도 컬럼 없음 | 초대의 난이도를 따라서 클라이언트가 못 바꿈 |
| 개인정보가 보이면 저장 안 하고 `PII_BLOCKED` | 원본을 DB에 남기지 않기 위해 |
| 메시지에 `turn` + 유니크 `(session_id, turn, role)` | 보내기 연타·동시 요청이 와도 같은 턴은 1번만 저장 (`TURN_CONFLICT`) |
| 초대 정원 기본 200, 화면의 인원 선택 제거 | 익명 로그인이라 같은 사람이 카톡→크롬처럼 브라우저를 바꾸면 새 참여자 → 1명 정원이면 본인도 못 들어옴 |
| 자동 정리는 최소만 (003) | 하루 넘은 active 세션 → `abandoned`, 30일 지난 **데이터 없는** 익명 계정만 삭제. 대화·결과는 보관 기간 결정 전까지 안 지움 |
| 대화가 끝나면 `chat-turn`이 세션도 종료 | `session-end`가 안 불려도 대화가 계속되지 않게 |
| 클라이언트는 정해진 컬럼만 쓰기 가능 | 상태·턴 수·판정은 Edge Function만 변경 |

## 6. 알려진 한계

| 한계 | 영향 | 해결 시점 |
|---|---|---|
| 답변 판정이 키워드 기반 | "안 확인할래요" 같은 부정문 오판 | Phase 2 (Gemini) |
| 개인정보 탐지: ko-pii(MIT) 규칙 이식 (전화·주민/외국인번호·카드 Luhn·계좌·이메일·URL·전각/띄어쓴 숫자) | 한글 숫자("공일공…")·이름·주소는 통과 (ko-pii에도 없음) | 음성 모드 도입 시 재검토 |
| 안전 약속 저장 안 됨 | 새로고침하면 사라짐 | Phase 3 |
| 보호자가 진행 상황을 못 봄 | 대기 화면은 안내 문구만 | Phase 3 |
| 시니어 화면에 초대자 이름 없음 | "가족이 초대했어요"로 고정 | 필요 시 `invites`에 컬럼 추가 |

## 7. 파일 지도

```
supabase/
├─ migrations/…_001_init.sql   테이블 6개 · 권한(RLS) · join_invite
├─ migrations/…_002_…sql       메시지 turn 유니크 (연타 방지) · 정원 기본 200
├─ migrations/…_003_…sql       pg_cron 정리 작업 2개 (PGlite 테스트에서 제외)
├─ seed.sql                    미션 3개
├─ functions/
│  ├─ _shared/
│  │  ├─ types.ts              ★ FE·BE·AI 공통 계약
│  │  ├─ ai.ts                 AI 담당 영역 (지금은 mock)
│  │  ├─ pii.ts                개인정보 탐지·가리기
│  │  ├─ http.ts               공통 요청 처리 (인증·오류 형식)
│  │  └─ logic_test.ts         로직 테스트
│  ├─ invite-join/             링크 입장
│  ├─ chat-turn/               대화 1턴 (+ decide.ts 판정)
│  └─ session-end/             종료·결과
├─ tests/db_check.mjs          DB·권한 검사 21개 (Supabase 불필요)
└─ tests/e2e.mjs               클라우드 E2E 20개 (npm run test:e2e)
src/
├─ lib/supabase.ts             FE용 클라이언트 (ensureAnon · callFn)
└─ app/page.tsx                전체 화면 (분리 예정)
```

## 8. 관련 문서

| 문서 | 내용 |
|---|---|
| [BE_FLOW](BE_FLOW.md) | 백엔드 설계 원본 (ERD·상태·우선순위) |
| [API_CONTRACT](API_CONTRACT.md) | Edge Function·DB 호출 목록 |
| [ONBOARDING](ONBOARDING.md) | 역할별 시작 방법 |
| [COLLABORATION](COLLABORATION.md) | Git 작업 규칙 |
