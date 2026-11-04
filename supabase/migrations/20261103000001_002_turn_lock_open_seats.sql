-- 002: 같은 턴 중복 저장 방지 + 링크 기본 정원 최대로.

-- 턴 번호(오프닝 0, 이후 1..). 같은 세션·턴·역할은 한 행만 → 연타·동시 요청이 와도 한 요청만 저장됨.
-- 기존 행은 null로 두어 유니크 검사에서 제외 (null끼리는 중복으로 안 봄).
alter table messages add column turn int;
create unique index messages_turn_uniq on messages (session_id, turn, role);

-- 익명 로그인이라 같은 사람이 다른 브라우저(카톡 → 크롬)로 열면 새 참여자가 됨 → 정원을 상한(200)으로.
alter table invites alter column max_participants set default 200;
