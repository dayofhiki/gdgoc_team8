# FE·BE·AI 계약 (제안, 아직 구현 전)

POST /api/sessions: 훈련 생성 → 초대 코드/관리자 토큰
POST /api/sessions/:code/join: 시니어 참가 동의 → 참가 토큰
GET /api/sessions/:code: 권한 있는 사용자의 상태 조회
POST /api/sessions/:code/turns: 사용자 답변 → 다음 상황과 교육 피드백
GET /api/sessions/:code/results: 결과 (시니어 동의 범위 준수)
PUT /api/sessions/:code/pledge: 가족 약속 작성·확인
GET /api/sessions/:code/events: 대기실 실시간 상태 (Firestore 등)

상태: invited → ready → training → review → pledge → completed.
보안: 랜덤 초대 토큰, 만료 시간, 읽기/수정 권한 분리. Gemini 키는 서버에서만 사용. 진짜 개인·금융 정보 수집 금지.
