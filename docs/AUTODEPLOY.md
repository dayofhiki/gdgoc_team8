# 검증된 main 자동 배포

GitHub Actions Verify Next.js build 성공 시 Deploy verified main to Dokploy 워크플로가 Dokploy API에 배포를 요청합니다.

## GitHub Repository Actions Secrets 일회성 등록
Settings → Secrets and variables → Actions → New repository secret:

- DOKPLOY_URL: Dokploy 패널의 HTTPS 주소. 마지막에 /api를 붙이지 마세요.
- DOKPLOY_API_KEY: Dokploy Profile에서 생성한 API 토큰.
- DOKPLOY_APPLICATION_ID: Dokploy 패널 또는 project.all API에서 확인한 배포 대상 Application ID.

설정 전에는 경고만 기록하고 배포하지 않습니다. 서버 API 키를 코드에 넣지 마세요.
Dokploy 애플리케이션 소스 브랜치는 main이어야 합니다. 이 방식 이용 시 Dokploy 자체 Push Auto Deploy를 꺼서 중복 배포를 방지하세요.
별도로 Dokploy Runtime Environment에 Gemini와 Groq API 키를 등록해야 모델 자동 전환이 작동합니다. 권장: TRAINING_SESSION_SECRET을 안정적으로 고정.
