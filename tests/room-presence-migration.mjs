import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const { PGlite } = await import(process.env.PGLITE_TEST_MODULE ?? "@electric-sql/pglite");

test("empty tables close after grace; visible tabs and completed results remain safe", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
    await db.exec(await readFile("supabase/migrations/20260928205834_a0bf1b67-c956-4e98-94f6-63e09ee73397.sql", "utf8"));
    await db.exec("ALTER TABLE rooms ADD COLUMN closed_at timestamptz;");
    const migration = await readFile("drizzle/migrations/0016_room_presence.sql", "utf8");
    await db.exec(migration.slice(0, migration.indexOf("-- Run even")));
    const room = (await db.query("INSERT INTO rooms(code,created_at) VALUES ('ABC234',now()-interval '5 minutes') RETURNING id")).rows[0].id;
    const member = (await db.query("INSERT INTO members(room_id,nickname,avatar,token_hash) VALUES ($1,'Guest','pizza','private') RETURNING id", [room])).rows[0].id;
    const tab1 = randomUUID(), tab2 = randomUUID();
    const presence = (tab, visible) => db.query("SELECT record_room_presence($1,$2,$3,$4)",[room,member,tab,visible]);
    const sweep = async () => Number((await db.query("SELECT close_empty_rooms() AS n")).rows[0].n);
    await presence(tab1,true);
    await presence(tab2,true);
    assert.equal(await sweep(),0);
    await presence(tab1,false);
    await db.query("UPDATE room_viewers SET last_seen_at=now()-interval '2 minutes',left_at=now()-interval '2 minutes' WHERE tab_id=$1",[tab1]);
    assert.equal(await sweep(),0,"another visible tab keeps the table open");
    await presence(tab2,false);
    assert.equal(await sweep(),0,"departure has a refresh grace period");
    await db.exec("UPDATE room_viewers SET last_seen_at=now()-interval '2 minutes',left_at=now()-interval '2 minutes'");
    assert.equal(await sweep(),1);
    assert.equal((await db.query("SELECT status FROM rooms WHERE id=$1",[room])).rows[0].status,"closed");
    await presence(tab1,true);
    assert.equal((await db.query("SELECT status FROM rooms WHERE id=$1",[room])).rows[0].status,"closed","late heartbeat does not reopen a table");
    await db.exec("INSERT INTO rooms(code,status,result) VALUES ('WIN234','closed','{\"winner\":{\"id\":\"r1\"}}'); INSERT INTO rooms(code) VALUES ('NEW234');");
    assert.equal(await sweep(),0,"new rooms get time to connect and winners are untouched");
    const stale = (await db.query("INSERT INTO rooms(code,status,created_at) VALUES ('OLD234','voting',now()-interval '5 minutes') RETURNING id")).rows[0].id;
    await assert.rejects(db.query("SELECT record_room_presence($1,$2,$3,true)",[stale,member,randomUUID()]),/Not a member/);
    assert.equal(await sweep(),1,"crashed clients and rooms with no viewers eventually close");
    await db.exec("SET ROLE anon");
    await assert.rejects(db.query("SELECT * FROM room_viewers"),/permission denied/);
    await assert.rejects(db.query("SELECT close_empty_rooms()"),/permission denied/);
  } finally { await db.close(); }
});
