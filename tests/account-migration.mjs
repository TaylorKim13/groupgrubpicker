// Optional isolated PostgreSQL check; see docs/account-settings.md for setup.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
for (const path of [
  "supabase/migrations/20260928205834_a0bf1b67-c956-4e98-94f6-63e09ee73397.sql",
  "drizzle/migrations/0000_saved_preferences_and_group_history.sql",
  "drizzle/migrations/0001_friends_and_crews.sql",
  "drizzle/migrations/0002_account_settings.sql",
])
  await db.exec(await readFile(path, "utf8"));
await db.exec(`INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
SELECT public.save_grub_preferences('{"maxWait":20}', 'km');
RESET ROLE;`);
assert.equal(
  (await db.query("SELECT distance_unit FROM public.profiles ORDER BY id")).rows[0].distance_unit,
  "km",
);
await assert.rejects(
  db.exec(`SET ROLE authenticated; SELECT public.save_grub_preferences('{"maxWait":99}', 'bad');`),
);
await db.exec("RESET ROLE");
assert.equal((await db.query("SELECT settings FROM preset_filters")).rows[0].settings.maxWait, 20);
await db.exec(`INSERT INTO rooms(id,code,result) VALUES ('10000000-0000-0000-0000-000000000001','ABCDEF','{"winner":{"id":"r1","nominatedBy":"Aaron"},"scores":[{"id":"r1","points":3}]}');
INSERT INTO members(id,room_id,nickname,avatar,is_host,token_hash,user_id) VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Aaron','pizza',true,'old-pass','00000000-0000-0000-0000-000000000001');
INSERT INTO nominations(room_id,member_id,restaurant) VALUES ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{"id":"r1","nominatedBy":"Aaron"}');
INSERT INTO votes(room_id,member_id,want_id,could_id) VALUES ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','r1','r2');
INSERT INTO room_restaurants(room_id,restaurant_id,restaurant,points) VALUES ('10000000-0000-0000-0000-000000000001','r1','{"id":"r1","nominatedBy":"Aaron"}',3);
INSERT INTO friendships(requester_id,addressee_id) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
INSERT INTO room_restaurants(room_id,restaurant_id,restaurant,points) VALUES
('10000000-0000-0000-0000-000000000001','r2','{"id":"r2","nominatedBy":"Aaron","nominatedByMemberId":"20000000-0000-0000-0000-000000000099"}',2),
('10000000-0000-0000-0000-000000000001','removed-nomination','{"id":"removed-nomination","nominatedBy":"Aaron"}',0);`);
await db.exec(
  `BEGIN; DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000001'; ROLLBACK;`,
);
assert.equal((await db.query("SELECT nickname FROM members")).rows[0].nickname, "Aaron");
assert.equal((await db.query("SELECT * FROM preset_filters")).rows.length, 1);
await db.exec(`DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000001';`);
const seat = (await db.query("SELECT * FROM members")).rows[0];
assert.equal(seat.nickname, "Deleted member");
assert.equal(seat.user_id, null);
assert.notEqual(seat.token_hash, "old-pass");
assert.equal((await db.query("SELECT * FROM votes")).rows.length, 1);
assert.equal(
  (await db.query("SELECT restaurant FROM nominations")).rows[0].restaurant.nominatedBy,
  "Deleted member",
);
const snapshot = (await db.query("SELECT * FROM room_restaurants WHERE restaurant_id = 'r1'"))
  .rows[0];
assert.equal(snapshot.restaurant.nominatedBy, "Deleted member");
assert.equal(snapshot.points, 3);
assert.equal(
  (await db.query("SELECT restaurant FROM room_restaurants WHERE restaurant_id = 'r2'")).rows[0]
    .restaurant.nominatedBy,
  "Aaron",
);
assert.equal(
  (
    await db.query(
      "SELECT restaurant FROM room_restaurants WHERE restaurant_id = 'removed-nomination'",
    )
  ).rows[0].restaurant.nominatedBy,
  "Deleted member",
);
const result = (await db.query("SELECT result FROM rooms")).rows[0].result;
assert.equal(result.winner.nominatedBy, "Deleted member");
assert.equal(result.scores[0].points, 3);
assert.equal((await db.query("SELECT * FROM preset_filters")).rows.length, 0);
assert.equal((await db.query("SELECT * FROM friendships")).rows.length, 0);
assert.equal((await db.query("SELECT * FROM profiles")).rows.length, 1);
await db.close();
console.log(
  "PASS: migration, own-user preferences, atomic rollback, account cascades, room-pass invalidation, anonymized nominations/snapshots/results, and preserved votes/scores",
);
