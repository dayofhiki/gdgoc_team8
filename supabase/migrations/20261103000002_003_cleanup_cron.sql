-- 003: 최소 데이터 정리 (매일 03:00 KST = 18:00 UTC). 대화·결과는 지우지 않음 — 보관 기간은 팀 결정 후 별도 작업.
-- PGlite 테스트에는 pg_cron이 없어 db_check.mjs는 이 파일을 로드하지 않음.
create extension if not exists pg_cron with schema pg_catalog;

-- 하루 넘게 active인 세션 → abandoned (상태만 바꿈, 행은 그대로)
select cron.schedule('mark-abandoned-sessions', '0 18 * * *', $$
  update public.sessions set status = 'abandoned'
  where status = 'active' and started_at < now() - interval '1 day'
$$);

-- 30일 지난 익명 계정 중 아무 데이터도 없는 것만 삭제 (초대·참여 기록이 있으면 남김 → cascade로 지워지는 데이터 없음)
select cron.schedule('delete-empty-anon-users', '0 18 * * *', $$
  delete from auth.users u
  where u.is_anonymous and u.created_at < now() - interval '30 days'
    and not exists (select 1 from public.invites i where i.created_by = u.id)
    and not exists (select 1 from public.participants p where p.user_id = u.id)
$$);
