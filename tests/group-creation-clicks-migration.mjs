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
async function host(code, isHost = true) {
  const room = (await db.query("INSERT INTO rooms(code) VALUES($1) RETURNING id", [code])).rows[0]
    .id;
  const member = (
    await db.query(
      "INSERT INTO members(room_id,nickname,avatar,token_hash,is_host) VALUES($1,'Host','pizza','hash',$2) RETURNING id",
      [room, isHost],
    )
  ).rows[0].id;
  return { room, member };
}
await host("OLD123");
await db.exec(await readFile("drizzle/migrations/0006_group_creation_clicks.sql", "utf8"));
async function metric() {
  return (await db.query("SELECT * FROM group_creation_click_metrics")).rows[0];
}
async function record(person, clicks) {
  await db.query(
    "UPDATE group_creation_usage SET click_count=$1, journey_id=gen_random_uuid() WHERE room_id=$2 AND host_member_id=$3 AND click_count IS NULL",
    [clicks, person.room, person.member],
  );
}
assert.equal(Number((await metric()).created_groups), 0);
assert.equal((await metric()).average_clicks, null);
assert.equal((await metric()).target_met, null);
await host("GUEST1", false);
assert.equal(Number((await metric()).created_groups), 0);
await db.exec("BEGIN");
await host("ROLLBK");
await db.exec("ROLLBACK");
assert.equal(Number((await metric()).created_groups), 0);
const first = await host("ROOM01");
assert.equal(Number((await metric()).unmeasured_groups), 1);
assert.equal((await metric()).average_clicks, null);
await record(first, 2);
assert.equal(Number((await metric()).average_clicks), 2);
assert.equal((await metric()).target_met, true);
await record(first, 0); // retry cannot overwrite an accepted count
assert.equal(Number((await metric()).average_clicks), 2);
const second = await host("ROOM02");
await record(second, 4);
assert.equal(Number((await metric()).average_clicks), 3);
assert.equal((await metric()).target_met, true);
const third = await host("ROOM03");
await record(third, 4);
assert.equal(Number((await metric()).average_clicks), 3.33);
assert.equal((await metric()).target_met, false);
const fourth = await host("ROOM04");
assert.equal(Number((await metric()).average_clicks), 3.33);
assert.equal(Number((await metric()).measurement_coverage_percent), 75);
assert.equal((await metric()).target_met, null);
await assert.rejects(record(fourth, -1));
await assert.rejects(record(fourth, 1.5));
await record(fourth, 2);
assert.equal(Number((await metric()).average_clicks), 3);
assert.equal(Number((await metric()).created_groups), 4);
assert.equal(Number((await metric()).measured_groups), 4);
assert.equal((await metric()).target_met, true);
const before = await metric();
await db.query("DELETE FROM rooms WHERE id=$1", [first.room]);
assert.deepEqual(await metric(), before);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`SET ROLE ${role}`);
  await assert.rejects(db.query("SELECT * FROM group_creation_usage"), /permission denied/);
  await assert.rejects(db.query("SELECT * FROM group_creation_click_metrics"), /permission denied/);
  await db.exec("RESET ROLE");
}
await db.exec("SET ROLE service_role");
assert.equal(Number((await metric()).created_groups), 4);
await db.exec("RESET ROLE");
await db.close();
console.log(
  "PASS: successful host creation, no historical/guest/failed counts, per-creation averages, exact <=3 target, missing-data coverage, idempotence, retention, and report privacy",
);
