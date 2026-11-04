-- 004: 가족 키. 초대 링크(7일)는 입장권일 뿐이고, 가족 묶음은 families로 영구 관리.
-- 구성원 누구나 자기 가족 링크를 만들 수 있음 → 받은 사람이 다시 공유해도 같은 가족으로 묶임.
-- 한 사람이 여러 가족에 속할 수 있음 (family_members가 다대다).

create table families (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid() references auth.users on delete set null, -- 만든 사람 계정이 지워져도 가족은 유지
  created_at timestamptz not null default now()
);

create table family_members (
  family_id uuid not null references families on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  nickname text not null default '' check (char_length(nickname) <= 20),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index family_members_user on family_members (user_id);

-- 가족 암호 질문 (여러 개·추가·수정 가능). 답은 저장하지 않음.
create table family_questions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families on delete cascade,
  question text not null check (char_length(question) between 1 and 60),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

alter table invites add column family_id uuid references families on delete cascade;
alter table invites add column inviter_name text not null default '' check (char_length(inviter_name) <= 20);

-- RLS 정책에서 family_members를 다시 조회하면 재귀가 되므로 definer 함수로 확인
create function is_family_member(p_family uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = p_family and user_id = auth.uid())
$$;

alter table families enable row level security;
alter table family_members enable row level security;
alter table family_questions enable row level security;

revoke all on families, family_members, family_questions from anon, authenticated;
grant select on families, family_members, family_questions to authenticated;
grant all on families, family_members, family_questions to service_role;
grant update (nickname) on family_members to authenticated;
grant insert (family_id, question) on family_questions to authenticated;
grant update (question) on family_questions to authenticated;
grant delete on family_questions to authenticated;
grant insert (family_id, inviter_name) on invites to authenticated;

create policy families_member on families for select to authenticated using (is_family_member(id));
create policy family_members_member on family_members for select to authenticated using (is_family_member(family_id));
create policy family_members_self on family_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy family_questions_read on family_questions for select to authenticated using (is_family_member(family_id));
create policy family_questions_create on family_questions for insert to authenticated
  with check (is_family_member(family_id) and created_by = auth.uid());
create policy family_questions_edit on family_questions for update to authenticated
  using (is_family_member(family_id)) with check (is_family_member(family_id));
create policy family_questions_delete on family_questions for delete to authenticated using (is_family_member(family_id));

-- 남의 가족 링크는 못 만듦
drop policy invites_create on invites;
create policy invites_create on invites for insert to authenticated with check (
  created_by = auth.uid() and (family_id is null or is_family_member(family_id))
);

-- 가족 만들기: 가족 행 + 본인 구성원 등록을 한 번에
create function create_family(p_nickname text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  insert into families (created_by) values (auth.uid()) returning id into fid;
  insert into family_members (family_id, user_id, nickname) values (fid, auth.uid(), left(coalesce(p_nickname, ''), 20));
  return fid;
end $$;
revoke execute on function create_family(text) from public, anon;
grant execute on function create_family(text) to authenticated;

-- 입장: 001과 같고, 가족 링크면 가족 구성원으로도 등록 (이미 구성원이면 그대로)
drop function join_invite(text, uuid);
create function join_invite(p_token text, p_user uuid, p_nickname text default '')
returns table (participant_id uuid, senior_name text, difficulty text, family_id uuid, inviter_name text)
language plpgsql security definer set search_path = public as $$
declare
  inv invites;
  pid uuid;
begin
  select * into inv from invites where token = p_token for update;
  if not found then raise exception 'INVITE_INVALID'; end if;
  if inv.expires_at < now() then raise exception 'INVITE_EXPIRED'; end if;

  select p.id into pid from participants p where p.invite_id = inv.id and p.user_id = p_user;
  if pid is null then
    if (select count(*) from participants p where p.invite_id = inv.id) >= inv.max_participants then
      raise exception 'INVITE_FULL';
    end if;
    insert into participants (invite_id, user_id) values (inv.id, p_user) returning id into pid;
  end if;

  if inv.family_id is not null then
    insert into family_members (family_id, user_id, nickname)
    values (inv.family_id, p_user, left(coalesce(p_nickname, ''), 20))
    on conflict do nothing;
  end if;

  return query select pid, inv.senior_name, inv.difficulty, inv.family_id, inv.inviter_name;
end $$;
revoke execute on function join_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function join_invite(text, uuid, text) to service_role;

-- ── 연습 결과 기록 + 가족 공유 ──────────────────────────────────────────────
-- 결과 요약만 저장 (대화 원문은 저장·공유하지 않음).
-- 가족에게는 본인이 그 가족에 공유를 켰을 때만 보임 (가족별 동의, 기본 꺼짐).
alter table family_members add column share_results boolean not null default false;
grant update (share_results) on family_members to authenticated;

create table practice_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('quiz', 'challenge', 'training')), -- challenge = 초대 링크로 푼 퀴즈
  title text not null default '' check (char_length(title) <= 60),
  safe boolean,                                   -- 훈련: 위험 행동 없이 끝냈는지
  score int check (score >= 0),                   -- 퀴즈: 맞힌 수
  total int check (total > 0),
  detail jsonb not null default '{}' check (pg_column_size(detail) <= 2000),
  created_at timestamptz not null default now(),
  check (score is null or total is null or score <= total)
);
create index practice_records_user on practice_records (user_id, created_at desc);

-- 본인이거나, 같은 가족이고 그 사람이 그 가족에 공유를 켰으면 볼 수 있음
create function can_view_records(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid() or exists (
    select 1 from family_members o join family_members me on me.family_id = o.family_id
    where o.user_id = p_owner and o.share_results and me.user_id = auth.uid()
  )
$$;

alter table practice_records enable row level security;
revoke all on practice_records from anon, authenticated;
grant select, delete on practice_records to authenticated;
grant insert (kind, title, safe, score, total, detail) on practice_records to authenticated;
grant all on practice_records to service_role;

create policy practice_records_read on practice_records for select to authenticated using (can_view_records(user_id));
create policy practice_records_create on practice_records for insert to authenticated with check (user_id = auth.uid());
create policy practice_records_delete on practice_records for delete to authenticated using (user_id = auth.uid());

-- 보호자 화면용: 가족 구성원별 요약. 공유를 끈 사람은 이름만 (record_count 등 null)
create function family_overview(p_family uuid)
returns table (
  user_id uuid, nickname text, is_me boolean, share_results boolean, joined_at timestamptz,
  record_count int, safe_count int, last_at timestamptz, recent jsonb
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_family_member(p_family) then raise exception 'FORBIDDEN'; end if;
  return query
  select m.user_id, m.nickname, m.user_id = auth.uid(), m.share_results, m.joined_at,
         s.record_count, s.safe_count, s.last_at, s.recent
  from family_members m
  left join lateral (
    select count(*)::int as record_count,
           count(*) filter (where r.safe)::int as safe_count,
           max(r.created_at) as last_at,
           coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
             select r2.kind, r2.title, r2.safe, r2.score, r2.total, r2.created_at
             from practice_records r2 where r2.user_id = m.user_id
             order by r2.created_at desc limit 5
           ) x), '[]'::jsonb) as recent
    from practice_records r where r.user_id = m.user_id
  ) s on (m.share_results or m.user_id = auth.uid())
  where m.family_id = p_family
  order by m.joined_at;
end $$;
revoke execute on function family_overview(uuid) from public, anon;
grant execute on function family_overview(uuid) to authenticated;
