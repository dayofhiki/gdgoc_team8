// shortcut: PGlite는 연결 1개라 진짜 동시 접속 경합은 재현 못 함 (join_invite의 FOR UPDATE 잠금은 Supabase 연결 후 E2E로 확인).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Supabase·Docker 없이 실제 Postgres 엔진(PGlite)에 마이그레이션·시드를 올려 RLS·입장 규칙을 검사.
// auth 스키마·역할은 Supabase와 같은 이름으로 흉내 냄. 실행: npm run test:backend
const root = fileURLToPath(new URL("../..", import.meta.url));
const db = new PGlite();
await db.exec(`
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create role anon; create role authenticated; create role service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);
await db.exec(readFileSync(root + "/supabase/migrations/20261103000000_001_init.sql", "utf8"));
await db.exec(readFileSync(root + "/supabase/seed.sql", "utf8"));
const G = "00000000-0000-0000-0000-00000000000a", A = "00000000-0000-0000-0000-00000000000b", B = "00000000-0000-0000-0000-00000000000c";
await db.exec(`insert into auth.users values ('${G}'),('${A}'),('${B}')`);
const as = async (uid, sql, params) => { await db.exec(`set role authenticated; set request.jwt.claim.sub='${uid}'`); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role; reset request.jwt.claim.sub"); } };
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const err = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

const [fam] = await as(G, "insert into invites (senior_name) values ('어머니') returning token, max_participants");
ok(fam.token.length === 64 && fam.max_participants === 1, "보호자 초대 생성, 64자 토큰, 기본 1명");
const [org] = await as(G, "insert into invites (senior_name, max_participants) values ('복지관', 2) returning token");
ok(!!(await err(as(G, "insert into invites (max_participants) values (500)"))), "인원 상한 200 초과 거부");
ok(!!(await err(as(A, "insert into invites (created_by) values ($1)", [G]))), "남의 이름으로 초대 생성 불가");

const join = (tok, u) => db.query("select * from join_invite($1,$2)", [tok, u]).then(r => r.rows[0]);
const pa = await join(fam.token, A);
ok((await join(fam.token, A)).participant_id === pa.participant_id, "같은 사용자 재입장 → 같은 참여자");
ok((await err(join(fam.token, B))) === "INVITE_FULL", "가족 링크 2번째 사용자 → INVITE_FULL");
ok((await err(join("nope", A))) === "INVITE_INVALID", "없는 토큰 → INVITE_INVALID");
await join(org.token, A); await join(org.token, B);
ok((await err(join(org.token, G))) === "INVITE_FULL", "기관 링크 2명까지 입장, 3번째 → INVITE_FULL");
await db.exec(`update invites set expires_at = now() - interval '1 day' where token = '${org.token}'`);
ok((await err(join(org.token, A))) === "INVITE_EXPIRED", "만료 토큰 → INVITE_EXPIRED");
ok(!!(await err(as(A, "select join_invite('x', $1)", [A]))), "사용자는 join_invite 직접 호출 불가");

ok((await as(A, "select id from invites")).length === 0, "시니어는 초대 테이블 조회 불가");
ok(!!(await err(as(B, "insert into sessions (participant_id, mission_id) values ($1,'family')", [pa.participant_id]))), "남의 participant로 세션 생성 불가");
const [s] = await as(A, "insert into sessions (participant_id, mission_id) values ($1,'family') returning id, stage, status", [pa.participant_id]);
ok(s.stage === "approach" && s.status === "active", "본인 세션 생성 (stage/status 기본값)");
ok(!!(await err(as(A, "insert into sessions (participant_id, mission_id, status) values ($1,'family','ended')", [pa.participant_id]))), "클라이언트가 status 지정 불가");
ok(!!(await err(as(A, "update sessions set turn_count = 99"))), "클라이언트가 세션 수정 불가");
ok(!!(await err(as(A, "insert into messages (session_id, role, text, stage) values ($1,'senior','x','approach')", [s.id]))), "클라이언트가 메시지 직접 저장 불가");
await db.query("insert into messages (session_id, role, text, stage) values ($1,'scammer','hi','approach')", [s.id]);
await db.query("insert into results (session_id, user_id, outcome) values ($1,$2,'safe')", [s.id, A]);
ok((await as(A, "select * from messages")).length === 1, "본인 메시지 조회");
ok((await as(B, "select * from messages")).length === 0 && (await as(B, "select * from results")).length === 0, "다른 사용자는 메시지·결과 0행");
await as(A, "update results set share_consent = true");
ok((await db.query("select share_consent from results")).rows[0].share_consent === true, "본인 공유 동의 변경 가능");
ok(!!(await err(as(A, "update results set outcome = 'unsafe'"))), "판정(outcome) 수정 불가");
ok((await as(A, "select id from missions")).length === 3, "미션 3개 조회");
