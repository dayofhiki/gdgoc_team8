# 미끼주의보 · GDGoC Team 8
뻐끄미와 함께 AI 보이스피싱 대처법을 연습하고, 가족과 퀴즈·가족 암호로 함께 대비하는 **모바일 웹 서비스**입니다.

## 실행
Node.js 20 이상 권장. 백엔드는 팀 공용 Supabase 클라우드 프로젝트 1개를 씁니다 (Docker 불필요).
1. git clone https://github.com/dayofhiki/gdgoc_team8.git && cd gdgoc_team8
2. npm install
3. `.env.example`을 `.env.local`로 복사하고 Supabase URL·anon key 입력
4. npm run dev → http://localhost:3000

백엔드 담당 (최초 1회 / 변경 시):
- `npx supabase login` → `npx supabase link --project-ref <ref>`
- 대시보드 Authentication > Sign In / Providers에서 **Anonymous sign-ins 활성화**
- `npx supabase db push --remote --include-seed` (마이그레이션 + 미션 시드. CLI v3는 `--remote` 없으면 로컬로 감)
- `npx supabase functions deploy invite-join chat-turn session-end --use-api` (Docker 불필요)
- 클라우드 E2E: `npm run test:e2e` (`.env.local` 필요)
- 백엔드 검사 (Supabase 없이 실행): `npm run test:backend` — 마이그레이션·RLS·입장 규칙 20개 + 판정 로직 테스트

PC에서는 Chrome 개발자 도구(F12 → Ctrl+Shift+M)에서 **iPhone 16 Pro (402×874)** 로 보면 Figma 시안과 같은 크기입니다.

## 현재 화면 (Figma "만든화면 - 피드백 반영" 기준)
| 경로 | 화면 |
|---|---|
| `/onboarding` | 온보딩 1~3 → 별명 입력 (혼자 / 가족과 함께 시작) |
| `/home` | 홈: 오늘의 추천 미션, 혼자 연습하기, 가족과 함께하기 |
| `/quiz` | OX 퀴즈 10문제 (힌트, 정답/오답, 결과, 틀린 문제 다시 풀기) |
| `/roleplay` → `/roleplay/mode` | AI 상황극 시작 전 확인 → 채팅/전화 방식 선택 |
| `/roleplay/chat` → `/review` | 채팅 연습: Gemini 상대와 직접 답장(글자 또는 녹음 후 확인), 답장 읽어주기, 모의 링크 → 실제 대화 기반 리포트 |
| `/roleplay/phone` → `/done` | 전화 연습 (현재는 모의 통화 + 통화 시간 측정) |
| `/family-code/*` | 가족 암호: 인트로 → 소개 → 질문 고르기 → 답 정하기 → 완료 |
| `/invite` | 가족 초대·공유 (공유 시트 / 링크 복사) |
| `/challenge?from=별명` | 초대 링크로 들어온 가족이 가입 없이 푸는 3문제 도전 |
| `/error/link`, `/error/network` | 초대 링크 오류, 연결 불안정 |

- 공통 UI: `src/components/ui.tsx`, 아이콘: `src/components/Icons.tsx`, 디자인 토큰: `src/app/globals.css`
- 콘텐츠 데이터: `src/lib/quiz.ts`(OX 문제), `src/lib/chatScript.ts`(예전 관찰형 채팅 시나리오, 현재는 안내 문구만 사용)
- 이미지 에셋: `public/images` (Figma에서 내보냄)

## 중요한 제한
**Supabase는 가족 초대(`invite-join`)와 채팅 연습(`practice-chat`·`transcribe`)만 연결돼 있습니다. 카카오 SDK·실제 ARS 전화는 미연동입니다.**
- 별명과 가족 암호 질문은 브라우저 localStorage에만 저장합니다. 가족 암호 답은 기획대로 저장하지 않습니다.
- 채팅 연습은 대화를 저장하지 않습니다. 리포트는 이 탭에서만 잠시 보관되어(sessionStorage) 새로고침은 되지만 다른 탭·기기에서는 볼 수 없습니다.
- 음성 입력은 녹음 후 글자로 바꿔 확인·수정한 뒤 보내는 방식입니다 (실시간 음성 대화 아님). 답장 읽어주기는 브라우저 내장 음성이라 기기마다 소리가 다릅니다. 실제 마이크·음성 인식은 아직 검증 전입니다.
- "카카오톡 공유하기"는 카카오 JavaScript 키 발급 전까지 기기 공유 시트(또는 링크 복사)로 동작합니다.
- 전화 연습의 "대화 중단 / 다른 번호로 확인" 결과는 AI 통화 분석 연동 전까지 고정 문구입니다.

## 백엔드 (Supabase)
- Next.js App Router 웹 (레포 루트 `src/`)
- Supabase: 테이블 6개 + RLS (`supabase/migrations`), Edge Functions `invite-join`·`chat-turn`·`session-end`·`practice-chat`·`transcribe`
- 보호자 초대 링크 생성 → 시니어 익명 입장 → 미션 선택 → 채팅 상황극 → 결과 저장 (E2E로 검증, 화면은 `chat-turn`·`session-end` 미연결)
- AI (`supabase/functions/_shared/ai.ts`): Gemini가 대사 생성 + 학습자 발화 판정. 키가 없거나 실패하면 미션별 기본 대사 + 키워드 판정
- 혼자 연습은 종료 이유·근거·AI 피드백 리포트까지 연결, DB 세션(`session-end`) 결과는 아직 키워드 방식. 현황: [HANDOFF 2-1](docs/HANDOFF.md#2-1-ai-흐름-현황)

**보호자 진행 현황(Realtime)·안전 약속 저장은 아직 없습니다** (BE_FLOW Phase 3). 안전 약속은 화면에서만 보입니다.

## 연결 자료
- [전체 화면 기능 명세](docs/SCREEN_FLOW.md)
- [백엔드 인수인계 (현재 상태·다음 할 일)](docs/HANDOFF.md)
- [역할별 개발 시작 가이드 (FE·AI·BE)](docs/ONBOARDING.md)
- [백엔드 설계](docs/BE_FLOW.md)
- [API 계약](docs/API_CONTRACT.md)
- [Git 협업 규칙](docs/COLLABORATION.md)
- Figma Design: https://www.figma.com/design/N0cMsK4GaxHGvCahJURbin
- FigJam: https://www.figma.com/board/CKjLATOtuQVCTifOT6Lbqf

공개 저장소에 API 키, Supabase service role 키, 실제 피해자 정보, 실계좌번호를 절대 올리지 마세요.
개발 담당자 배정은 화면 흐름 승인 후 진행합니다.
