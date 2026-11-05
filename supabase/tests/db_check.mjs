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
-- 기본 권한을 주지 않음 = 대시보드 "Automatically expose new tables" 꺼짐. 마이그레이션의 명시 grant만으로 동작해야 함
`);
await db.exec(readFileSync(root + "/supabase/migrations/20261103000000_001_init.sql", "utf8"));
await db.exec(readFileSync(root + "/supabase/migrations/20261103000001_002_turn_lock_open_seats.sql", "utf8")); // 003(pg_cron)은 PGlite에 없어 제외
await db.exec(readFileSync(root + "/supabase/migrations/20261104000000_004_families.sql", "utf8")); // 005도 pg_cron이라 제외
await db.exec(readFileSync(root + "/supabase/seed.sql", "utf8"));
const G = "00000000-0000-0000-0000-00000000000a", A = "00000000-0000-0000-0000-00000000000b", B = "00000000-0000-0000-0000-00000000000c", C = "00000000-0000-0000-0000-00000000000d";
await db.exec(`insert into auth.users values ('${G}'),('${A}'),('${B}'),('${C}')`);
const as = async (uid, sql, params) => { await db.exec(`set role authenticated; set request.jwt.claim.sub='${uid}'`); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role; reset request.jwt.claim.sub"); } };
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const err = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

const [fam] = await as(G, "insert into invites (senior_name) values ('어머니') returning token, max_participants");
ok(fam.token.length === 64 && fam.max_participants === 200, "보호자 초대 생성, 64자 토큰, 기본 정원 200");
const [org] = await as(G, "insert into invites (senior_name, max_participants) values ('복지관', 2) returning token");
ok(!!(await err(as(G, "insert into invites (max_participants) values (500)"))), "인원 상한 200 초과 거부");
ok(!!(await err(as(A, "insert into invites (created_by) values ($1)", [G]))), "남의 이름으로 초대 생성 불가");

// invite-join Edge Function과 같은 service_role로 호출
const join = async (tok, u, nick = "") => { await db.exec("set role service_role"); try { return (await db.query("select * from join_invite($1,$2,$3)", [tok, u, nick])).rows[0]; } finally { await db.exec("reset role"); } };
const pa = await join(fam.token, A);
ok((await join(fam.token, A)).participant_id === pa.participant_id, "같은 사용자 재입장 → 같은 참여자");
ok((await join(fam.token, B)).participant_id !== pa.participant_id, "기본 링크는 다른 브라우저(새 익명 사용자)도 입장");
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
await db.query("insert into messages (session_id, role, text, stage, turn) values ($1,'senior','a','approach',1)", [s.id]);
ok(!!(await err(db.query("insert into messages (session_id, role, text, stage, turn) values ($1,'senior','b','approach',1)", [s.id]))), "같은 턴·역할 메시지 중복 저장 불가 (연타 방지)");
await db.query("delete from messages where turn = 1");
ok((await as(B, "select * from messages")).length === 0 && (await as(B, "select * from results")).length === 0, "다른 사용자는 메시지·결과 0행");
await as(A, "update results set share_consent = true");
ok((await db.query("select share_consent from results")).rows[0].share_consent === true, "본인 공유 동의 변경 가능");
ok(!!(await err(as(A, "update results set outcome = 'unsafe'"))), "판정(outcome) 수정 불가");
ok((await as(A, "select id from missions")).length === 3, "미션 3개 조회");

// 가족 키: 링크를 타고 타고 들어와도 한 가족, 질문 여러 개, 남은 못 봄
const [{ create_family: F }] = await as(G, "select create_family('보호자')");
const [fi] = await as(G, "insert into invites (family_id, inviter_name) values ($1, '보호자') returning token", [F]);
ok(!!(await err(as(A, "insert into invites (family_id) values ($1)", [F]))), "구성원 아니면 그 가족 링크 생성 불가");
const ja = await join(fi.token, A, "엄마");
ok(ja.family_id === F && ja.inviter_name === "보호자", "가족 링크 입장 → family_id·보낸 사람 이름 반환");
const [fi2] = await as(A, "insert into invites (family_id, inviter_name) values ($1, '엄마') returning token", [F]);
await join(fi2.token, B, "아빠");
const mem = await as(G, "select nickname from family_members where family_id = $1 order by joined_at", [F]);
ok(mem.length === 3 && mem.map((m) => m.nickname).join() === "보호자,엄마,아빠", "받은 사람이 다시 공유 → 같은 가족 3명");
await join(fi.token, A, "엄마");
ok((await as(G, "select 1 from family_members")).length === 3, "같은 사람 재입장 → 구성원 중복 없음");
ok((await as(C, "select 1 from family_members")).length === 0 && (await as(C, "select 1 from families")).length === 0, "가족 아닌 사람은 가족·구성원 0행");
await as(G, "insert into family_questions (family_id, question) values ($1, '첫 반려동물 이름은?')", [F]);
await as(A, "insert into family_questions (family_id, question) values ($1, '처음 간 가족 여행지는?')", [F]);
ok((await as(B, "select question from family_questions")).length === 2, "구성원은 가족 질문 여러 개 조회");
await as(B, "update family_questions set question = '바뀐 질문' where question = '첫 반려동물 이름은?'");
ok((await as(G, "select 1 from family_questions where question = '바뀐 질문'")).length === 1, "구성원은 질문 변경 가능");
ok(!!(await err(as(C, "insert into family_questions (family_id, question) values ($1, 'x')", [F]))), "남의 가족 질문 추가 불가");
ok((await as(C, "select 1 from family_questions")).length === 0, "남의 가족 질문 조회 0행");
const [{ create_family: F2 }] = await as(A, "select create_family('엄마')");
ok((await as(A, "select family_id from family_members where user_id = $1", [A])).length === 2 && F2 !== F, "한 사람이 여러 가족에 속할 수 있음");
await as(A, "update family_members set nickname = 'x' where user_id = $1", [G]);
ok((await as(G, "select nickname from family_members where user_id = $1 and family_id = $2", [G, F]))[0].nickname === "보호자", "남의 별명 변경 불가");
await as(B, "update family_members set nickname = '아빠2' where family_id = $1 and user_id = $2", [F, B]);
ok((await as(G, "select nickname from family_members where user_id = $1 and family_id = $2", [B, F]))[0]?.nickname === "아빠2", "자기 별명 변경 가능 (가족 목록 이름 맞추기)");
await as(B, "update family_members set nickname = '아빠' where family_id = $1 and user_id = $2", [F, B]);

// 연습 기록 + 가족 공유 (가족 F = G보호자, A엄마, B아빠 / C는 남)
await as(A, "insert into practice_records (kind, title, safe) values ('training', '가족의 급한 연락', true)");
await as(A, "insert into practice_records (kind, score, total) values ('challenge', 2, 3)");
ok(!!(await err(as(A, "insert into practice_records (user_id, kind) values ($1, 'quiz')", [B]))), "남의 이름으로 기록 불가");
ok(!!(await err(as(A, "insert into practice_records (kind, score, total) values ('quiz', 5, 3)"))), "맞힌 수 > 전체 거부");
ok((await as(A, "select 1 from practice_records")).length === 2, "본인 기록 조회");
ok((await as(G, "select 1 from practice_records")).length === 0, "공유 꺼짐(기본) → 가족도 기록 0행");
let ov = await as(G, "select * from family_overview($1)", [F]);
const ovA = () => ov.find((r) => r.user_id === A);
ok(ov.length === 3 && ovA().record_count === null && ovA().nickname === "엄마", "공유 꺼짐 → 요약에 이름만, 결과 null");
await as(A, "update family_members set share_results = true where family_id = $1 and user_id = $2", [F, A]);
ok((await as(G, "select 1 from practice_records")).length === 2 && (await as(B, "select 1 from practice_records")).length === 2, "공유 켜면 같은 가족(G·B)이 기록 조회");
ok((await as(C, "select 1 from practice_records")).length === 0, "가족 아닌 사람은 공유해도 0행");
ov = await as(G, "select * from family_overview($1)", [F]);
ok(ovA().record_count === 2 && ovA().safe_count === 1 && ovA().recent.length === 2 && ovA().recent[0].kind === "challenge", "요약: 횟수·안전 횟수·최근 기록(최신순)");
ok(ov.find((r) => r.user_id === G).is_me === true && ov.find((r) => r.user_id === G).record_count === 0, "요약: 본인 표시, 본인은 공유 꺼도 보임");
ok((await err(as(C, "select * from family_overview($1)", [F]))) === "FORBIDDEN", "남의 가족 요약 → FORBIDDEN");
ok((await as(G, "select 1 from practice_records where user_id = $1", [A])).length === 2 && ((await as(G, "delete from practice_records where user_id = $1 returning id", [A])).length === 0), "가족은 남의 기록 삭제 불가");
await as(A, "update family_members set share_results = false where family_id = $1 and user_id = $2", [F, A]);
ok((await as(G, "select 1 from practice_records")).length === 0, "공유 끄면 즉시 안 보임");
ok((await as(A, "delete from practice_records returning id")).length === 2, "본인은 기록 삭제 가능");
