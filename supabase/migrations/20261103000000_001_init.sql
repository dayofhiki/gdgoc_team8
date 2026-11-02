-- 001: Phase 1 테이블 6개 + RLS(본인 접근만). 이후 변경은 ADD COLUMN / CREATE TABLE 마이그레이션으로만.

create table missions (
  id text primary key,                       -- slug
  title text not null,
  scam_type text not null,
  persona text not null,                     -- AI 프롬프트용 시나리오
  fallback_lines jsonb not null,             -- { approach, trust, pressure, demand }
  sort int not null default 0
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  senior_name text not null default '',
  difficulty text not null default 'normal' check (difficulty in ('easy', 'normal', 'hard')),
  max_participants int not null default 1 check (max_participants between 1 and 200), -- 가족 1, 기관 N
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references invites on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  unique (invite_id, user_id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mission_id text not null references missions,
  mode text not null default 'chat' check (mode in ('chat', 'voice')),
  stage text not null default 'approach' check (stage in ('approach', 'trust', 'pressure', 'demand')),
  status text not null default 'active' check (status in ('active', 'ended', 'abandoned')),
  turn_count int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  role text not null check (role in ('scammer', 'senior')),
  text text not null,                        -- 개인정보 가린 텍스트만
  stage text not null,
  created_at timestamptz not null default now()
);
create index messages_session_idx on messages (session_id, created_at);

create table results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  outcome text not null check (outcome in ('safe', 'unsafe', 'incomplete')),
  red_flags jsonb not null default '[]',
  feedback jsonb not null default '[]',
  share_consent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table missions enable row level security;
alter table invites enable row level security;
alter table participants enable row level security;
alter table sessions enable row level security;
alter table messages enable row level security;
alter table results enable row level security;

-- 쓰기 가능한 컬럼을 좁힘 (상태·카운터·판정은 Edge Function만 변경)
revoke insert, update, delete on invites, participants, sessions, messages, results, missions from anon, authenticated;
grant insert (senior_name, difficulty, max_participants) on invites to authenticated;
grant insert (participant_id, mission_id, mode) on sessions to authenticated;
grant update (share_consent) on results to authenticated;

create policy missions_read on missions for select to authenticated using (true);

create policy invites_own on invites for select to authenticated using (created_by = auth.uid());
create policy invites_create on invites for insert to authenticated with check (created_by = auth.uid());

create policy participants_own on participants for select to authenticated using (user_id = auth.uid());

create policy sessions_own on sessions for select to authenticated using (user_id = auth.uid());
create policy sessions_create on sessions for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from participants p where p.id = participant_id and p.user_id = auth.uid())
);

create policy messages_own on messages for select to authenticated using (
  exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid())
);

create policy results_own on results for select to authenticated using (user_id = auth.uid());
create policy results_consent on results for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 입장: 초대 행을 잠그고 인원 확인 + 등록을 한 트랜잭션에서 처리 → 동시 입장해도 max_participants를 넘지 않음.
-- invite-join Edge Function(service role)만 호출. 오류는 코드 문자열로 raise.
create function join_invite(p_token text, p_user uuid)
returns table (participant_id uuid, senior_name text, difficulty text)
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

  return query select pid, inv.senior_name, inv.difficulty;
end $$;
revoke execute on function join_invite(text, uuid) from public, anon, authenticated;
