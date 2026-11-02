# 안심연습 · GDGoC Team 8
가족/교육기관이 초대하고 시니어가 가입 없이 링크로 참여하는 **모바일 웹 AI 사기 예방 훈련 서비스**의 협업 시작 프로젝트입니다.

## 실행
Node.js 20 이상 권장.
1. git clone https://github.com/dayofhiki/gdgoc_team8.git
2. cd gdgoc_team8
3. npm install
4. npm run dev
5. http://localhost:3000 접속

## 현재 구현
- Next.js App Router + React + TypeScript 웹 기본 프로젝트
- 모바일 반응형 UI, 보호자·기관 유형 선택
- 훈련 생성/초대 링크 복사/시니어 가입 없는 입장
- 교육용 고정 시나리오, 응답 선택, 피드백, 안전 약속 및 완료
- 팀 작업용 API 계약/스크린 흐름/Git 협업 문서

## 중요한 제한
**아직 Gemini·Firebase·실시간 공유 기능은 구현되지 않았습니다.** 현재 데이터는 브라우저 localStorage에만 저장됩니다. 따라서 만든 링크는 **같은 브라우저**에서만 정상 조회됩니다. 다른 기기에서 링크 입장하려면 세션 서버와 DB 연동이 우선입니다. 상황극은 고정 예제이며 실제 AI 호출이 아닙니다.

## 연결 자료
- [전체 화면 기능 명세](docs/SCREEN_FLOW.md)
- [API 계약 초안](docs/API_CONTRACT.md)
- [Git 협업 규칙](docs/COLLABORATION.md)
- Figma Design: https://www.figma.com/design/N0cMsK4GaxHGvCahJURbin
- FigJam: https://www.figma.com/board/CKjLATOtuQVCTifOT6Lbqf

공개 저장소에 API 키, Firebase Admin 키, 실제 피해자 정보, 실계좌번호를 절대 올리지 마세요.
개발 담당자 배정은 화면 흐름 승인 후 진행합니다.
