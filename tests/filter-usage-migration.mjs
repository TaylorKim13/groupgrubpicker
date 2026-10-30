// Optional PostgreSQL integration check; see docs/filter-usage-metrics.md.
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
const defaults = {
  center: { lat: 40, lng: -111, label: "Automatic search location" },
  radiusKm: 5,
  priceMin: 1,
  priceMax: 4,
  maxWait: 60,
};
async function room(code, patch = {}, status = "lobby") {
  const { rows } = await db.query(
    "INSERT INTO rooms(code,settings,status) VALUES($1,$2,$3) RETURNING id",
    [code, JSON.stringify({ ...defaults, ...patch }), status],
  );
  return rows[0].id;
}
async function settings(id, patch) {
  await db.query("UPDATE rooms SET settings = settings || $1::jsonb WHERE id = $2", [
    JSON.stringify(patch),
    id,
  ]);
}
async function start(id) {
  await db.query("UPDATE rooms SET status = 'voting' WHERE id = $1", [id]);
}
async function metric() {
  return (await db.query("SELECT * FROM filter_usage_metrics")).rows[0];
}
async function usage(id) {
  return (await db.query("SELECT * FROM room_filter_usage WHERE room_id=$1", [id])).rows[0];
}
const historical = await room("OLD123", {}, "voting");
const oldClosed = await room("OLD234", {}, "closed");
const existingLobby = await room("LOBBY1", { priceMax: 2 });
await db.exec(await readFile("drizzle/migrations/0004_filter_usage_metrics.sql", "utf8"));
assert.equal(await usage(historical), undefined);
assert.equal(await usage(oldClosed), undefined);
assert.equal(Number((await metric()).total_voting_sessions), 0);
assert.equal((await metric()).filter_usage_rate_percent, null);
assert.equal((await metric()).target_met, null);
await start(existingLobby);
assert.equal(Number((await metric()).filtered_voting_sessions), 1);

const untouched = await room("ROOM01", { maxWait: 20 });
await start(untouched);
assert.equal(Number((await metric()).filter_usage_rate_percent), 50);
assert.equal((await metric()).target_met, false);
const location = await room("ROOM02");
await settings(location, { radiusKm: 10 });
const firstApplied = (await usage(location)).location_filter_applied_at;
await settings(location, { radiusKm: 10 });
assert.deepEqual((await usage(location)).location_filter_applied_at, firstApplied);
await start(location);
assert.equal(Number((await metric()).filter_usage_rate_percent), 66.7);
assert.equal((await metric()).target_met, true);
const plain = await room("ROOM03");
await start(plain);
const price = await room("ROOM04", { priceMin: 2 });
await start(price);
assert.equal(Number((await metric()).total_voting_sessions), 5);
assert.equal(Number((await metric()).filtered_voting_sessions), 3);
assert.equal(Number((await metric()).filter_usage_rate_percent), 60);
assert.equal((await metric()).target_met, true);

const both = await room("ROOM05");
await settings(both, { center: { lat: 41, lng: -112, label: "Host selected area" }, priceMax: 3 });
await start(both);
await start(both);
assert.equal(Number((await metric()).total_voting_sessions), 6);
assert.equal(Number((await metric()).filtered_voting_sessions), 4);
assert.equal(Number((await metric()).location_filter_sessions), 2);
assert.equal(Number((await metric()).price_filter_sessions), 3);
await db.query("UPDATE rooms SET status='closed', result=$1 WHERE id=$2", [
  JSON.stringify({ winner: { id: "r1", name: "Picked restaurant" } }),
  both,
]);
const selection = (await usage(both)).restaurant_selected_at;
assert.ok(selection);
assert.ok(new Date((await usage(both)).price_filter_applied_at) <= new Date(selection));
await db.query("UPDATE rooms SET result=result WHERE id=$1", [both]);
assert.deepEqual((await usage(both)).restaurant_selected_at, selection);

// Late changes do not retroactively qualify an already-started session.
await settings(untouched, { radiusKm: 15, priceMax: 2 });
assert.equal((await usage(untouched)).location_filter_applied_at, null);
assert.equal((await usage(untouched)).price_filter_applied_at, null);
const rollback = await room("ROOM06");
await db.exec("BEGIN");
await settings(rollback, { priceMax: 2 });
await db.exec("ROLLBACK");
assert.equal((await usage(rollback)).price_filter_applied_at, null);
const labelOnly = await room("ROOM07");
await settings(labelOnly, {
  center: { ...defaults.center, label: "Different label, same coordinates" },
  maxWait: 20,
  diets: ["vegan"],
});
assert.equal((await usage(labelOnly)).location_filter_applied_at, null);
assert.equal((await usage(labelOnly)).price_filter_applied_at, null);
const presetRadius = await room("ROOM08", { radiusKm: 10 });
assert.ok((await usage(presetRadius)).location_filter_applied_at);
const resetRadius = await room("ROOM09");
await settings(resetRadius, { radiusKm: 10 });
await settings(resetRadius, { radiusKm: 5 });
assert.ok((await usage(resetRadius)).location_filter_applied_at);
assert.equal(Number((await metric()).total_voting_sessions), 6);

// Counts survive room cleanup, and historical sessions remain excluded on closure.
await db.query("DELETE FROM rooms WHERE id=$1", [price]);
assert.equal(Number((await metric()).total_voting_sessions), 6);
assert.equal(Number((await metric()).filtered_voting_sessions), 4);
await db.query("UPDATE rooms SET status='closed',result=$1 WHERE id=$2", [
  JSON.stringify({ winner: { id: "old" } }),
  historical,
]);
assert.equal(Number((await metric()).total_voting_sessions), 6);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`SET ROLE ${role}`);
  await assert.rejects(db.query("SELECT * FROM filter_usage_metrics"), /permission denied/);
  await assert.rejects(db.query("SELECT * FROM room_filter_usage"), /permission denied/);
  await db.exec("RESET ROLE");
}
await db.exec("SET ROLE service_role");
assert.equal(Number((await metric()).total_voting_sessions), 6);
await db.exec("RESET ROLE");
await db.close();
console.log(
  "PASS: zero-data reporting, 60% threshold, saved defaults, location/price edits, deduplication, rollback, pre-selection ordering, historical exclusion, deletion retention, and private report permissions",
);
