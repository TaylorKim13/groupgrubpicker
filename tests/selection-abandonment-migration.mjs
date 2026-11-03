import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
await db.exec(
  await readFile(
    "supabase/migrations/20260928205834_a0bf1b67-c956-4e98-94f6-63e09ee73397.sql",
    "utf8",
  ),
);
const room = (await db.query("INSERT INTO rooms(code) VALUES ('ABC234') RETURNING id")).rows[0].id;
const otherRoom = (await db.query("INSERT INTO rooms(code) VALUES ('DEF567') RETURNING id")).rows[0]
  .id;
async function member() {
  return (
    await db.query(
      "INSERT INTO members(room_id,nickname,avatar,token_hash) VALUES ($1,'Guest','pizza','hash') RETURNING id",
      [room],
    )
  ).rows[0].id;
}
async function event(id, kind) {
  await db.query("SELECT record_selection_activity($1,$2,$3)", [room, id, kind]);
}
async function vote(id) {
  await db.query(
    "INSERT INTO votes(room_id,member_id,want_id,could_id) VALUES ($1,$2,'r1','r2') ON CONFLICT(member_id) DO UPDATE SET want_id='r1'",
    [room, id],
  );
}
async function metric() {
  return (await db.query("SELECT * FROM selection_abandonment_metrics")).rows[0];
}
async function usage(id) {
  return (await db.query("SELECT * FROM room_selection_usage WHERE member_id=$1", [id])).rows[0];
}
async function inactive(id) {
  await db.query(
    "UPDATE room_selection_usage SET last_seen_at=statement_timestamp()-INTERVAL '16 minutes' WHERE member_id=$1",
    [id],
  );
}
const historical = await member();
await vote(historical);
await db.exec(await readFile("drizzle/migrations/0005_selection_abandonment.sql", "utf8"));
assert.equal(Number((await metric()).entered_users), 0);
assert.equal((await metric()).abandonment_rate_percent, null);
assert.equal((await metric()).target_met, null);
const ids = [];
for (let i = 0; i < 5; i++) {
  const id = await member();
  ids.push(id);
  await event(id, "enter");
}
await event(ids[0], "enter");
await event(ids[0], "heartbeat");
assert.equal(Number((await metric()).entered_users), 5);
assert.equal(Number((await metric()).pending_users), 5);
const entered = (await usage(ids[0])).entered_at;
await event(ids[0], "leave");
assert.ok((await usage(ids[0])).left_at);
assert.equal(Number((await metric()).abandoned_users), 0); // still inside the grace period
await event(ids[0], "enter");
assert.equal((await usage(ids[0])).left_at, null);
assert.deepEqual((await usage(ids[0])).entered_at, entered);
for (const id of ids.slice(0, 4)) await vote(id);
await inactive(ids[4]); // lost tab-close signal still becomes abandonment
assert.equal(Number((await metric()).selected_users), 4);
assert.equal(Number((await metric()).abandoned_users), 1);
assert.equal(Number((await metric()).abandonment_rate_percent), 20);
assert.equal((await metric()).target_met, false); // target is strictly less than 20%
const selected = (await usage(ids[0])).selected_at;
await vote(ids[0]);
await event(ids[0], "leave");
await inactive(ids[0]);
assert.deepEqual((await usage(ids[0])).selected_at, selected);
assert.equal(Number((await metric()).abandoned_users), 1); // completed users never abandon
await event(ids[4], "heartbeat");
assert.equal(Number((await metric()).entered_users), 5);
assert.equal(Number((await metric()).abandoned_users), 0);
await vote(ids[4]);
assert.equal(Number((await metric()).selected_users), 5);
assert.equal((await metric()).target_met, true);

const pending = await member();
await event(pending, "enter");
await assert.rejects(
  db.query("INSERT INTO votes(room_id,member_id,want_id,could_id) VALUES ($1,$2,'same','same')", [
    room,
    pending,
  ]),
);
assert.equal((await usage(pending)).selected_at, null);
await db.exec("BEGIN");
await vote(pending);
await db.exec("ROLLBACK");
assert.equal((await usage(pending)).selected_at, null);
await event(pending, "leave");
await inactive(pending);
assert.equal(Number((await metric()).entered_users), 6);
assert.equal(Number((await metric()).abandonment_rate_percent), 16.7);
assert.equal((await metric()).target_met, true);

const noEntry = await member();
await event(noEntry, "leave");
assert.equal(await usage(noEntry), undefined);
await vote(noEntry); // successful submission proves entry if client telemetry was lost
assert.ok((await usage(noEntry)).selected_at);
await assert.rejects(
  db.query("SELECT record_selection_activity($1,$2,'enter')", [otherRoom, noEntry]),
  /Not a member/,
);
await assert.rejects(event(noEntry, "fake"), /Invalid selection activity/);
const beforeDelete = await metric();
await db.query("DELETE FROM rooms WHERE id=$1", [room]);
assert.deepEqual(await metric(), beforeDelete); // anonymous counts survive room/member cleanup
for (const role of ["anon", "authenticated"]) {
  await db.exec(`SET ROLE ${role}`);
  await assert.rejects(
    db.query("SELECT * FROM selection_abandonment_metrics"),
    /permission denied/,
  );
  await assert.rejects(db.query("SELECT * FROM room_selection_usage"), /permission denied/);
  await assert.rejects(
    db.query("SELECT record_selection_activity($1,$2,'enter')", [otherRoom, noEntry]),
    /permission denied/,
  );
  await db.exec("RESET ROLE");
}
await db.exec("SET ROLE service_role");
assert.equal(Number((await metric()).entered_users), 7);
await db.exec("RESET ROLE");
await db.close();
console.log(
  "PASS: entry deduplication, successful-vote completion, exit grace, missing exits, return recovery, failed/rolled-back votes, strict under-20% target, retained anonymous counts, and private permissions",
);
