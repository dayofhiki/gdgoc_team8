# 안심연습 · GDGoC Team 8
가족/교육기관이 초대하고 시니어가 가입 없이 링크로 참여하는 **모바일 웹 AI 사기 예방 훈련 서비스**의 협업 시작 프로젝트입니다.

## 실행
Node.js 20 이상 권장. 백엔드는 팀 공용 Supabase 클라우드 프로젝트 1개를 씁니다 (Docker 불필요).
1. git clone https://github.com/dayofhiki/gdgoc_team8.git && cd gdgoc_team8
2. npm install
3. `.env.example`을 `.env.local`로 복사하고 Supabase URL·anon key 입력
4. npm run dev → http://localhost:3000

백엔드 담당 (최초 1회 / 변경 시):
- `npx supabase login` → `npx supabase link --project-ref <ref>`
- 대시보드 Authentication > Sign In / Providers에서 **Anonymous sign-ins 활성화**
- `npx supabase db push --include-seed` (마이그레이션 + 미션 시드)
- `npx supabase functions deploy invite-join chat-turn session-end`
- 백엔드 검사 (Supabase 없이 실행): `npm run test:backend` — 마이그레이션·RLS·입장 규칙 20개 + 판정 로직 테스트

## 현재 구현
- Next.js App Router 웹 (레포 루트 `src/`)
- Supabase: 테이블 6개 + RLS (`supabase/migrations`), Edge Functions `invite-join`·`chat-turn`·`session-end`
- 보호자 초대 링크 생성 → 시니어 익명 입장 → 미션 선택 → 채팅 상황극 → 결과 저장
- AI는 mock (`supabase/functions/_shared/ai.ts`, 미션별 기본 대사 + 키워드 판정)

## 중요한 제한
**Gemini 연동·보호자 진행 현황(Realtime)·안전 약속 저장은 아직 없습니다** (BE_FLOW Phase 2·3). 안전 약속은 화면에서만 보입니다.

## 연결 자료
- [전체 화면 기능 명세](docs/SCREEN_FLOW.md)
- [백엔드 설계](docs/BE_FLOW.md)
- [API 계약](docs/API_CONTRACT.md)
- [Git 협업 규칙](docs/COLLABORATION.md)
- Figma Design: https://www.figma.com/design/N0cMsK4GaxHGvCahJURbin
- FigJam: https://www.figma.com/board/CKjLATOtuQVCTifOT6Lbqf

공개 저장소에 API 키, Supabase service role 키, 실제 피해자 정보, 실계좌번호를 절대 올리지 마세요.
개발 담당자 배정은 화면 흐름 승인 후 진행합니다.
