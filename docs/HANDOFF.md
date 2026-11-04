# 백엔드 인수인계 (Handoff)

> 2026-11-04 갱신 (최초 2026-11-03, 브랜치 `jaeyun/be-pipeline`) · 기준 문서 [BE_FLOW](BE_FLOW.md)

## 한눈에 보기

| | 상태 |
|---|---|
| **Phase 0** Setup | ✅ 완료 · Supabase 프로젝트 `pedmhdnmhmzsezerrzvk` 연결 |
| **Phase 1** E2E | ✅ 완료 · 클라우드에서 `npm run test:e2e` 18개 통과 |
| **Phase 2** AI | 🟡 진행 중 · 혼자 연습: 종료 이유·근거 리포트·AI 피드백·음성 입력/TTS까지 연결 (실키·배포 검증 전). DB 세션 결과는 아직 키워드 판정 ([2-1](#2-1-ai-흐름-현황)) |
| **Phase 3** 보호자 | ⬜ 시작 전 |
| **Phase 4** 시연 | ⬜ 시작 전 |

**한 줄 요약**: 초대 → 입장 → 채팅 → 결과가 **실제 Supabase 클라우드에서 동작**합니다. Gemini는 대화 생성·판정에 연결됐고, 화면에서는 '혼자 연습하기'(`practice-chat`)만 쓰고 있습니다. 혼자 연습은 종료 이유·근거·피드백 리포트와 음성 입력까지 코드로 연결됐고(**클라우드 배포·실제 Gemini 검증 전**), 다음은 배포 검증과 보호자 화면입니다.

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

**혼자 연습하기** (홈 → `/roleplay/chat`, 저장 안 함): 화면 → `practice-chat` 턴 반복 → 종료 → `practice-chat`(`action: "report"`) → 리포트를 이 탭의 sessionStorage에 보관 → `/roleplay/chat/review?id=…`. 음성 입력은 `transcribe`.

> 위 초대 흐름(`chat-turn`·`session-end`)은 E2E 스크립트로만 검증됐고, 현재 화면 중 이 두 함수를 부르는 곳은 없습니다.

## 2. 검증 현황

| 확인 항목 | 결과 | 방법 |
|---|---|---|
| FE 타입·빌드 | ✅ 통과 | `npm run typecheck` · `npm run build` |
| DB·권한 규칙 20개 | ✅ 통과 | `npm run test:backend` (PGlite, Supabase 불필요) |
| 판정·개인정보 로직 4개 | ✅ 통과 | 같은 명령 |
| Edge Function 타입 | ✅ 통과 | `npx deno check supabase/functions/*/index.ts` |
| Edge Function 실제 실행 | ✅ 통과 | `npm run test:e2e` (클라우드) |
| 동시 입장 경합 (잠금) | ✅ 통과 (3회 반복) | 정원 2 링크에 3명 동시 → 2명 성공·1명 `INVITE_FULL`, 다른 링크끼리는 서로 안 막음 |
| Phase 1 완료 기준 (3턴 → messages 7행, results 1행) | ✅ 통과 | 같은 명령. 브라우저 화면 확인은 아직 |
| 2026-11-04 재확인 | ✅ 통과 | `npm ci` 후 `npm run typecheck` · `npm run test:backend` (키 없음 → mock 경로). E2E·실제 Gemini 호출·`practice-chat` 배포 여부는 이번에 확인 안 함 |
| 2026-11-04 AI 훈련 개선 | ✅ 통과 | `npm run test:backend` (DB 20 + 단위 25: 종료 이유별·클릭 발화 vs 이벤트·반복·최대 턴·피드백 검증·초기화·늦은 응답·음성 요청 형식, Gemini는 fetch 모의) · `deno test supabase/functions` 20 · `deno check` · `typecheck` · `build`. **미검증**: 클라우드 배포·E2E·실제 Gemini/Transcribe·마이크·TTS·브라우저 화면 |

### 2-1. AI 흐름 현황

모든 대화 경로가 `_shared/ai.ts`의 `generateReply`를 공유합니다. Gemini 한 번 호출로 **사기범 대사 + 학습자 발화 intent·불확실 여부·해석·상대의 다음 행동**을 함께 받고, **종료 여부는 `_shared/judge.ts`의 앱 규칙**이 정합니다.

| 기능 | 구현 위치 | 상태 |
|---|---|---|
| 대사 생성 | `ai.ts` `generateReply` · `systemPrompt` | ✅ Gemini (`GEMINI_MODEL`, 기본 `gemini-3.6-flash`, 7초). 키 없음·실패 시 `fallback_lines` + `used_fallback: true` |
| 발화 판정 | `ai.ts` Gemini intent 9종 (+`uncertain`, `note`) | ✅ 응답 `analysis`로 전달, FE가 다음 요청 history에 `intent`로 돌려보냄. 키 없으면 키워드 mock |
| 종료 판단 | `judge.ts` `decideTurn` · `turnContext` · `isExplicitStop` | ✅ 종료 이유 9종 + `ended_by`. 중단은 AI 호출 없이 즉시, 불확실하면 종료 안 함, 행동 주장은 1회 재확인 후 종료, 같은 답 3회면 상대가 물러남 |
| 최대 턴 | `chat-turn/decide.ts` `decideNext` (`MAX_TURNS` 8) | ✅ `chat-turn`·`practice-chat`·`/api/lab` 공통. 도달 시 `inconclusive`. `practice-chat`은 FE가 보낸 history로 셈 |
| 발화와 실제 행동 구분 | `practice-chat` `events` · 화면의 모의 링크 카드 | ✅ 요구 단계에서 모의 링크 표시(`offer_link`), 누르면 `link_clicked` 이벤트로 즉시 종료. 말만으로는 클릭·송금으로 보지 않음. `transfer_sent`는 타입만 있고 화면 없음 |
| 리포트 근거·피드백 | `judge.ts` `observations` · `fallbackFeedback` · `checkFeedback`, `ai.ts` `generateFeedback` | ✅ 근거는 규칙으로, 피드백은 Gemini(검증 실패 시 기본 문구) |
| 리포트 화면 | `src/app/roleplay/chat/review` + `src/lib/practiceSession.ts` | ✅ 실제 대화·종료 이유·근거·AI 해석(불확실 표시)·피드백. sessionStorage 보관 (새로고침 유지, 다른 탭·직접 URL은 "결과 없음") |
| 새 훈련 초기화 | `chat/page.tsx` `start()` + `practiceSession` `runId` | ✅ 새로고침 없이 상태·리포트·녹음·TTS 정리, 이전 요청의 늦은 응답 무시 |
| 음성 입력 | `src/lib/voice.ts` `useRecorder` → `transcribe` → `_shared/transcribe.ts` | ✅ 코드·모의 테스트. **실제 마이크·Gemini 3.5 Transcribe 호출은 미검증** |
| TTS | `src/lib/voice.ts` `useSpeech` (브라우저 `speechSynthesis`) | ✅ 코드. 기기별 한국어 음성 품질 미검증 |
| DB 세션 결과 | `session-end` (키워드 `classify` + 고정 문구) | ⚠️ 그대로. `chat-turn` 응답에만 `end_reason` 추가, DB에는 intent·종료 이유 저장 안 함 |
| 로컬 테스트 | `src/app/api/lab/route.ts` + `/lab` | ✅ 턴 응답에 `end_reason`·`analysis`·`offer_link` 추가. end는 여전히 키워드 규칙 |

**Python 프로토타입** (`ai_lab/baitlab`): 종료 이유·이벤트·피드백 설계를 TS로 옮기며 참고했습니다. 판정 신뢰도 점수(`validate_analysis`의 min_confidence)는 TS에서 `uncertain` 불리언으로 단순화했습니다.

## 3. 다음에 할 일

### BE — 바로 다음
- [x] Supabase 클라우드 프로젝트 생성, 익명 로그인 활성화
- [x] 마이그레이션·시드 push, Edge Function 3개 배포
- [x] E2E 스크립트 (`npm run test:e2e`): 입장·동시 입장·3턴 7행·결과 1행·권한 18개 통과
- [ ] URL·anon key 팀 공유 (팀원은 `.env.local`에 입력)
- [ ] 브라우저 2개로 화면 흐름 직접 확인

### AI — Phase 2
- [x] `supabase/functions/_shared/ai.ts` Gemini 연결 (대사 생성 + intent 판정)
- [x] `test:backend` Node 실행 유지 — `ai.ts`가 `Deno.env`·`process.env`를 모두 읽도록 해서 deno 전환 불필요
- [x] 혼자 연습용 `practice-chat` 추가, `/roleplay/chat` 화면 연결
- [x] 종료 이유·`ended_by`·`analysis` 응답 추가 (`types.ts`에 optional로만 추가)
- [x] 발화(intent)와 화면 이벤트(모의 링크 클릭) 분리, 대화 근거 리포트·AI 피드백(검증·기본 문구)
- [x] 채팅 종료 → 리포트 화면 연결, 새 훈련 초기화, `practice-chat` 서버 턴 제한
- [x] 녹음형 음성 입력(`transcribe`)·TTS(브라우저) 코드
- [ ] **배포**: `npx supabase functions deploy practice-chat transcribe chat-turn` (이번 변경 미배포)
- [ ] 실제 Gemini로 가상 대화 실험: 종료 이유별 사례, "딸이 옆에 있는데?" 맥락, 장난·반복 대화 (지금은 모의 응답으로만 테스트)
- [ ] 실제 마이크·`gemini-3.5-transcribe` 호출 확인 (Chrome·Safari, 응답 텍스트 위치 `output_text`/`steps` 확인)
- [ ] 키 제거 시 `used_fallback: true`·`AI_NOT_CONFIGURED` 확인 (클라우드)
- [ ] DB 세션 경로: intent·종료 이유 저장(마이그레이션), `session-end`를 규칙·AI 피드백으로 교체

### FE
- [x] `page.tsx` 화면별 분리 (`src/app/*` 경로별)
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
| 대화 종료 판정: AI vs 서버 규칙 | AI intent → `ai.ts`가 `ended` 결정 + 서버 턴 제한 (`decideNext`) | `ai.ts` · `chat-turn/decide.ts` |
| 최대 대화 턴 수 | 학습자 발화 8회 (`chat-turn`·`practice-chat` 공통) — AI 기획안은 6회 | `chat-turn/decide.ts` `MAX_TURNS` |
| 반복 기준 | 같은(포함 관계 포함) 답 3번째면 상대가 물러남 | `_shared/judge.ts` `REPEAT_LIMIT` |
| 모의 링크를 언제·어떻게 보여줄지 | 요구 단계 답장 아래 카드 1회, 누르면 즉시 종료 | `ai.ts` `shouldOfferLink`, `chat/page.tsx` |
| 혼자 연습 리포트 보관 | 이 탭 sessionStorage (탭 닫으면 삭제) | `src/lib/practiceSession.ts` |
| 음성 녹음 최대 길이 | 30초 | `src/lib/voice.ts` `MAX_RECORD_MS` |
| 혼자 연습 결과를 저장할지 | 저장 안 함 | `practice-chat` |
| 링크 유효기간 | 7일 | 마이그레이션 `invites.expires_at` 기본값 |
| 이탈 기준 시간 | 없음 (`abandoned` 값만 정의) | 미정 |
| 대화 기록 보관 기간 | 무기한 | 미정 |

## 5. 내가 내린 결정 (이유 포함)

| 결정 | 이유 |
|---|---|
| Next.js는 레포 루트 유지 (`/web` 안 만듦) | 파일 이동 없이 바로 작업 |
| Supabase 클라우드 프로젝트 1개 공유 | Docker 없이 팀 전원 같은 환경 |
| 입장은 DB 함수 `join_invite`로 처리 | 초대 행을 잠가서 동시 입장해도 인원 초과 안 됨 |
| `sessions`에 난이도 컬럼 없음 | 초대의 난이도를 따라서 클라이언트가 못 바꿈 |
| 개인정보가 보이면 저장 안 하고 `PII_BLOCKED` | 원본을 DB에 남기지 않기 위해 |
| 대화가 끝나면 `chat-turn`이 세션도 종료 | `session-end`가 안 불려도 대화가 계속되지 않게 |
| 클라이언트는 정해진 컬럼만 쓰기 가능 | 상태·턴 수·판정은 Edge Function만 변경 |

## 6. 알려진 한계

| 한계 | 영향 | 해결 시점 |
|---|---|---|
| DB 세션 결과 판정이 키워드 기반 | `session-end`에서 "안 확인할래요" 같은 부정문 오판 (혼자 연습은 해당 없음) | 마이그레이션 시 |
| 키 없을 때 mock 판정이 키워드 | "딸이 옆에 있는데?" 같은 맥락은 못 잡고 계속 진행 | Gemini 사용 시 해소 |
| `practice-chat` 턴 수·이벤트는 FE가 보낸 기록 기준 | 기록을 조작하면 우회 가능 (저장 안 하는 연습용이라 허용) | 필요 시 DB 경로 |
| 모의 송금 화면 없음 | `transfer_sent` 이벤트는 타입·규칙만 있음 | 팀 결정 |
| 전화 연습(`/roleplay/phone`)은 여전히 모의 통화 | 음성 입력·TTS는 채팅 연습에만 붙음 | 팀 결정 |
| 개인정보 탐지가 숫자 정규식만 | "공일공…"처럼 한글 숫자는 통과 | 음성 모드 도입 시 |
| 안전 약속 저장 안 됨 | 새로고침하면 사라짐 | Phase 3 |
| 보호자가 진행 상황을 못 봄 | 대기 화면은 안내 문구만 | Phase 3 |
| 시니어 화면에 초대자 이름 없음 | "가족이 초대했어요"로 고정 | 필요 시 `invites`에 컬럼 추가 |

## 7. 파일 지도

```
supabase/
├─ migrations/…_001_init.sql   테이블 6개 · 권한(RLS) · join_invite
├─ seed.sql                    미션 3개
├─ functions/
│  ├─ _shared/
│  │  ├─ types.ts              ★ FE·BE·AI 공통 계약
│  │  ├─ ai.ts                 AI: Gemini 대사·판정·피드백 (키 없으면 mock)
│  │  ├─ judge.ts              종료 판단·반복·리포트 근거·기본 피드백 (순수 함수)
│  │  ├─ transcribe.ts         Gemini 3.5 Transcribe 호출
│  │  ├─ pii.ts                개인정보 탐지·가리기
│  │  ├─ http.ts               공통 요청 처리 (인증·오류 형식)
│  │  └─ logic_test.ts         로직 테스트
│  ├─ invite-join/             링크 입장
│  ├─ chat-turn/               대화 1턴 (+ decide.ts 판정)
│  ├─ practice-chat/           혼자 연습 대화 1턴 + 종료 리포트 (저장 안 함)
│  ├─ transcribe/              녹음 → 텍스트
│  └─ session-end/             종료·결과
├─ tests/db_check.mjs          DB·권한 검사 20개 (Supabase 불필요)
└─ tests/e2e.mjs               클라우드 E2E 18개 (npm run test:e2e)
src/
├─ lib/supabase.ts             FE용 클라이언트 (ensureAnon · callFn)
├─ app/roleplay/chat/          혼자 연습 채팅 (practice-chat·음성) · review/ 실제 대화 리포트
├─ lib/practiceSession.ts      연습 상태·늦은 응답 무시·리포트 임시 보관
├─ lib/voice.ts                녹음(MediaRecorder)·TTS(speechSynthesis)
├─ app/api/lab/ · app/lab/     로컬 AI 테스트 (개발 서버 전용)
└─ app/page.tsx                진입 화면
ai_lab/                        Python AI 프로토타입 (종료 이유·피드백 설계 참고)
```

## 8. 관련 문서

| 문서 | 내용 |
|---|---|
| [BE_FLOW](BE_FLOW.md) | 백엔드 설계 원본 (ERD·상태·우선순위) |
| [API_CONTRACT](API_CONTRACT.md) | Edge Function·DB 호출 목록 |
| [ONBOARDING](ONBOARDING.md) | 역할별 시작 방법 |
| [COLLABORATION](COLLABORATION.md) | Git 작업 규칙 |
