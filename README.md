# 미끼주의보 · GDGoC Team 8
뻐끄미와 함께 AI 보이스피싱 대처법을 연습하고, 가족과 퀴즈·가족 암호로 함께 대비하는 **모바일 웹 서비스**입니다.

## 실행
Node.js 20 이상 권장.
1. git clone https://github.com/dayofhiki/gdgoc_team8.git
2. cd gdgoc_team8
3. npm install
4. npm run dev
5. http://localhost:3000 접속

PC에서는 Chrome 개발자 도구(F12 → Ctrl+Shift+M)에서 **iPhone 16 Pro (402×874)** 로 보면 Figma 시안과 같은 크기입니다.

## 현재 구현 (Figma "만든화면 - 피드백 반영" 기준)
| 경로 | 화면 |
|---|---|
| `/onboarding` | 온보딩 1~3 → 별명 입력 (혼자 / 가족과 함께 시작) |
| `/home` | 홈: 오늘의 추천 미션, 혼자 연습하기, 가족과 함께하기 |
| `/quiz` | OX 퀴즈 10문제 (힌트, 정답/오답, 결과, 틀린 문제 다시 풀기) |
| `/roleplay` → `/roleplay/mode` | AI 상황극 시작 전 확인 → 채팅/전화 방식 선택 |
| `/roleplay/chat` → `/review` | 관찰형 채팅 연습 (자동 진행, 잠깐 멈추기, 위험 순간, 중단 확인, 리뷰) |
| `/roleplay/phone` → `/done` | 전화 연습 (현재는 모의 통화 + 통화 시간 측정) |
| `/family-code/*` | 가족 암호: 인트로 → 소개 → 질문 고르기 → 답 정하기 → 완료 |
| `/invite` | 가족 초대·공유 (공유 시트 / 링크 복사) |
| `/challenge?from=별명` | 초대 링크로 들어온 가족이 가입 없이 푸는 3문제 도전 |
| `/error/link`, `/error/network` | 초대 링크 오류, 연결 불안정 |

- 공통 UI: `src/components/ui.tsx`, 아이콘: `src/components/Icons.tsx`, 디자인 토큰: `src/app/globals.css`
- 콘텐츠 데이터: `src/lib/quiz.ts`(OX 문제), `src/lib/chatScript.ts`(채팅 시나리오)
- 이미지 에셋: `public/images` (Figma에서 내보냄)

## 중요한 제한
**아직 Gemini·Firebase·카카오 SDK·실제 ARS 전화는 연동되지 않았습니다.**
- 별명과 가족 암호 질문은 브라우저 localStorage에만 저장합니다. 가족 암호 답은 기획대로 저장하지 않습니다.
- 채팅 상황극은 고정 시나리오이며 실제 AI 호출이 아닙니다.
- "카카오톡 공유하기"는 카카오 JavaScript 키 발급 전까지 기기 공유 시트(또는 링크 복사)로 동작합니다.
- 전화 연습의 "대화 중단 / 다른 번호로 확인" 결과는 AI 통화 분석 연동 전까지 고정 문구입니다.

## 연결 자료
- [전체 화면 기능 명세](docs/SCREEN_FLOW.md)
- [API 계약 초안](docs/API_CONTRACT.md)
- [Git 협업 규칙](docs/COLLABORATION.md)
- Figma Design: https://www.figma.com/design/N0cMsK4GaxHGvCahJURbin
- FigJam: https://www.figma.com/board/CKjLATOtuQVCTifOT6Lbqf

공개 저장소에 API 키, Firebase Admin 키, 실제 피해자 정보, 실계좌번호를 절대 올리지 마세요.
개발 담당자 배정은 화면 흐름 승인 후 진행합니다.
