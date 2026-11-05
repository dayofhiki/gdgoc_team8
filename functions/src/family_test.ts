// Firestore emulator에서 가족 백엔드 권한·흐름 확인. 실행: npm run test:firebase (Java 필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { runAction } from "./family.ts";

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "emulator 안에서만 실행 (실제 DB 보호)");
const db = getFirestore(initializeApp({ projectId: "demo-test" }));
const run = (uid: string, action: string, body: Record<string, unknown> = {}) => runAction(db, uid, action, body) as Promise<any>;
const code = (p: Promise<unknown>, c: string) => assert.rejects(p, (e: any) => e.code === c);

test("가족 생성 → 초대 → 입장 → 공유 → 요약", async () => {
  const { familyId } = await run("mom", "myFamily", { nickname: "엄마" });
  assert.deepEqual(await run("mom", "myFamily", {}), { familyId }, "두 번째 호출은 같은 가족");

  const inv = await run("mom", "createInvite", { familyId, nickname: "엄마", maxParticipants: 2 });
  assert.match(inv.token, /^[0-9a-f]{64}$/);
  const joined = await run("kid", "joinInvite", { token: inv.token, nickname: "아들" });
  assert.equal(joined.invite.family_id, familyId);
  assert.equal(joined.invite.inviter_name, "엄마");
  await run("kid", "joinInvite", { token: inv.token }); // 재입장은 정원 안 씀
  await run("dad", "joinInvite", { token: inv.token });
  await code(run("aunt", "joinInvite", { token: inv.token }), "INVITE_FULL");
  assert.equal((await run("kid", "familySize", { familyId })).count, 3);
  assert.deepEqual(await run("kid", "myFamily", {}), { familyId }, "링크로 들어온 사람의 가족");

  await run("mom", "saveQuestion", { familyId, question: "첫 강아지 이름은?" });
  await run("kid", "saveQuestion", { familyId, question: "첫 강아지 이름은?" });
  assert.equal((await run("dad", "questions", { familyId })).length, 1, "같은 질문은 한 번만");

  await run("kid", "saveRecord", { kind: "quiz", title: "OX", score: 3, total: 5, safe: true });
  await run("kid", "syncNickname", { familyId, nickname: "막내" });
  let kid = (await run("mom", "overview", { familyId })).find((m: any) => m.user_id === "kid");
  assert.equal(kid.nickname, "막내");
  assert.equal(kid.record_count, null, "공유 꺼짐 → 기록 안 보임");
  assert.equal((await run("kid", "overview", { familyId })).find((m: any) => m.is_me).record_count, 1, "내 기록은 보임");

  assert.deepEqual(await run("kid", "setShare", { familyId, share: true }), { share_results: true });
  kid = (await run("mom", "overview", { familyId })).find((m: any) => m.user_id === "kid");
  assert.equal(kid.record_count, 1);
  assert.equal(kid.safe_count, 1);
  assert.equal(kid.recent[0].score, 3);
  assert.ok(kid.last_at);

  // 남의 가족은 전부 막힘
  for (const a of ["questions", "familySize", "overview", "createInvite", "saveQuestion"]) {
    await code(run("stranger", a, { familyId, question: "x" }), "FORBIDDEN");
  }
  await code(run("stranger", "setShare", { familyId, share: true }), "FORBIDDEN");
  await code(run("mom", "overview", { familyId: "../users/kid" }), "FORBIDDEN");
});

test("같은 사람이 동시에 myFamily를 불러도 가족은 하나", async () => {
  const ids = await Promise.all(Array.from({ length: 5 }, () => run("racer", "myFamily", {})));
  assert.equal(new Set(ids.map((r) => r.familyId)).size, 1);
  assert.equal((await db.collection("families").where("createdBy", "==", "racer").get()).size, 1);
});

test("초대 토큰 오류·만료", async () => {
  await code(run("a", "joinInvite", { token: "nope" }), "INVITE_INVALID");
  await code(run("a", "joinInvite", { token: "f".repeat(64) }), "INVITE_INVALID");
  const { familyId } = await run("b", "myFamily", {});
  const { token } = await run("b", "createInvite", { familyId });
  await db.doc(`invites/${token}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await code(run("a", "joinInvite", { token }), "INVITE_EXPIRED");
});

test("연습 기록 입력 검증", async () => {
  await code(run("a", "saveRecord", { kind: "hack" }), "BAD_REQUEST");
  await code(run("a", "saveRecord", { kind: "quiz", score: 6, total: 5 }), "BAD_REQUEST");
  await code(run("a", "saveRecord", { kind: "quiz", score: -1 }), "BAD_REQUEST");
  await code(run("a", "saveRecord", { kind: "quiz", detail: { x: "y".repeat(3000) } }), "BAD_REQUEST");
  await code(run("a", "nope"), "BAD_REQUEST");
});
