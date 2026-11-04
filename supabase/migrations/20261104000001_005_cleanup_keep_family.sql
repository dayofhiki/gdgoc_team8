-- 005: 003의 빈 익명 계정 정리에서 가족 구성원·연습 기록이 있는 계정은 제외 (안 그러면 30일 뒤 가족·기록이 지워짐).
-- pg_cron 필요 → PGlite 테스트(db_check.mjs)는 이 파일을 로드하지 않음. 같은 이름으로 schedule하면 기존 작업을 덮어씀.
select cron.schedule('delete-empty-anon-users', '0 18 * * *', $$
  delete from auth.users u
  where u.is_anonymous and u.created_at < now() - interval '30 days'
    and not exists (select 1 from public.invites i where i.created_by = u.id)
    and not exists (select 1 from public.participants p where p.user_id = u.id)
    and not exists (select 1 from public.family_members m where m.user_id = u.id)
    and not exists (select 1 from public.practice_records r where r.user_id = u.id)
$$);
