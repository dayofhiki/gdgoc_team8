# Git 작업 방식 (팀원 배정 전)
main은 항상 실행 가능한 통합본.
작업: git switch main && git pull origin main && git switch -c feat/invite-flow
변경 커밋: git add . && git commit -m "feat: build invitation flow"
서버 푸시: git push -u origin feat/invite-flow
그다음 GitHub에서 Pull Request 생성 → 팀원 1명 리뷰 → Squash and merge → 모두 main pull.
기능 단위 브랜치를 권장합니다. API 또는 공통 타입 수정 전 담당자끼리 형식을 합의하세요. 강제 push 및 비밀키 커밋 금지.
