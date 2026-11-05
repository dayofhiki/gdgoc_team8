# 백엔드 인수인계 (Handoff)

> 2026-11-05 Supabase → Firebase 전환 기준. 설계: [BE_FLOW](BE_FLOW.md) · 호출: [API_CONTRACT](API_CONTRACT.md)

## 한눈에 보기
| 항목 | 상태 |
|---|---|
| Firebase 프로젝트 | `gdgoc-team8` (Blaze), 익명 로그인 켬, Firestore Standard `asia-northeast3` |
| Cloud Function `backend` | 배포됨 (`asia-northeast3`), 컨테이너 이미지 1일 정리 정책 |
| Firestore Rules | 배포됨 (브라우저 직접 접근 전부 거부) |
| 화면 코드 | 전환 때 수정 없음 (`src/lib` 함수 형태 그대로) |

## 1. 지금 동작하는 흐름
가족 만들기 → 초대 링크 → 가족 입장 → 가족 암호 질문 공유 → 연습 기록 저장 → 공유 켜기 → 보호자 화면 요약.
실제 Firebase에서 `src/lib` 함수로 끝까지 확인했습니다.

## 2. 검증
| 항목 | 명령 |
|---|---|
| 타입 | `npm run typecheck` · `npm run build --prefix functions` |
| 판정·PII·LLM 전환 로직 | `npm run test:backend` |
| 가족 백엔드 (권한·트랜잭션·입력 검증) | `npm run test:firebase` (Firestore emulator, Java 11+) |
| 문자 훈련 | `npm run test:training` |

CI(`verify-build.yml`)가 위를 모두 돌립니다.
Windows에서는 `test:firebase`가 끝나도 emulator(java)가 남아 다음 실행 때 "port taken"이 날 수 있습니다. 작업 관리자에서 해당 java를 끄세요.

## 3. 다음에 할 일
- [ ] Dokploy env에 `NEXT_PUBLIC_FIREBASE_*` 4개 (빌드 단계에도 보이게)
- [ ] Google Cloud 예산 알림 (Blaze는 상한 없음)
- [ ] 콘솔에서 `invites.expiresAt` TTL 정책 (선택)
- [ ] App Check (남용 방지, 선택)
- [ ] `functions/` 자동 배포 (선택, 지금은 수동)
- [ ] 예전 Supabase 프로젝트 정리 (Secrets의 AI 키 포함)

## 4. 결정 (이유 포함)
| 결정 | 이유 |
|---|---|
| 화면은 Dokploy 유지, Supabase가 하던 부분만 Firebase | 배포 파이프라인 그대로, 서버 키 관리 없음 |
| 서버 로직은 Cloud Function, Rules는 전부 거부 | Firestore에는 SQL 함수·RLS가 없음. 권한을 한 파일에 모아 테스트 가능하게 |
| 입장·가족 생성은 트랜잭션 | 동시 입장해도 정원 초과 없음, 동시 호출해도 가족 1개 |
| 초대 정원 기본 200 | 익명 로그인이라 브라우저를 바꾸면 새 참여자 → 정원이 작으면 본인도 못 들어옴 |
| 쓰이지 않던 채팅 세션 백엔드(chat-turn 등) 삭제 | 화면이 부르지 않았음 |
| 기존 데이터 이전 안 함 | 실사용 데이터 없음. 기기 캐시 키 버전을 올려 예전 id는 버림 |

## 5. 알려진 한계
| 한계 | 영향 |
|---|---|
| 기기는 가족 하나만 기억 | 여러 가족에 속해도 최근 하나만 보임 (`invite.ts` shortcut) |
| 퀴즈 결과는 브라우저가 직접 기록 | 조작 가능 (속는 건 자기 가족뿐) |
| 개인정보 탐지는 ko-pii 규칙 이식 | 한글 숫자·이름·주소는 통과 |

## 6. 파일 지도
```
functions/
├─ src/index.ts        Cloud Function `backend` (토큰 확인·오류 형식)
├─ src/family.ts       가족·초대·기록 로직 + 권한 검사
└─ src/family_test.ts  emulator 테스트
firestore.rules        전부 거부
firebase.json          functions · rules · emulator 설정
src/lib/
├─ firebase.ts         익명 로그인 · callFn
├─ invite.ts           가족·초대 (화면용)
└─ records.ts          연습 기록 (화면용)
src/server/            Next 서버 전용: ai.ts · llm.ts · pii.ts · decide.ts · missions.ts · types.ts
```
