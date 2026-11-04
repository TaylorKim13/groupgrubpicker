import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";

let PGlite;
try {
  const location = process.env.PGLITE_MODULE;
  ({ PGlite } = await import(
    location
      ? location.startsWith("file:")
        ? location
        : pathToFileURL(location).href
      : "@electric-sql/pglite"
  ));
} catch (error) {
  if (!String(error.code).includes("MODULE_NOT_FOUND")) throw error;
}

test(
  "dining migration enforces browser isolation, locked preferences, atomic generation leases, and deletion",
  { skip: !PGlite && "Set PGLITE_MODULE to a temporary @electric-sql/pglite installation" },
  async () => {
    const db = new PGlite();
    const user = "00000000-0000-0000-0000-000000000001";
    const room = "00000000-0000-0000-0000-000000000002";
    const otherRoom = "00000000-0000-0000-0000-000000000003";
    const member = "00000000-0000-0000-0000-000000000004";
    try {
      await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.rooms(id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'lobby');
      CREATE TABLE public.members(id uuid PRIMARY KEY, room_id uuid REFERENCES rooms ON DELETE CASCADE, user_id uuid REFERENCES auth.users ON DELETE SET NULL);
      INSERT INTO auth.users VALUES ('${user}');
      INSERT INTO rooms(id) VALUES ('${room}'), ('${otherRoom}');
      INSERT INTO members VALUES ('${member}', '${room}', '${user}');
    `);
      await db.exec(
        await readFile(
          new URL("../drizzle/migrations/0009_dining_recommendations.sql", import.meta.url),
          "utf8",
        ),
      );
      // An existing deployment can retain OpenAI-labelled rows during upgrade.
      await db.query("INSERT INTO room_dining_suggestions(room_id, method) VALUES($1, 'openai')", [
        otherRoom,
      ]);
      await db.exec(
        await readFile(
          new URL("../drizzle/migrations/0010_gemini_dining.sql", import.meta.url),
          "utf8",
        ),
      );
      assert.equal(
        (await db.query("SELECT method FROM room_dining_suggestions WHERE room_id=$1", [otherRoom]))
          .rows[0].method,
        "openai",
      );
      await db.query("UPDATE room_dining_suggestions SET method='gemini' WHERE room_id=$1", [
        otherRoom,
      ]);
      await assert.rejects(
        db.query("UPDATE room_dining_suggestions SET method='invented' WHERE room_id=$1", [
          otherRoom,
        ]),
        /check constraint/,
      );
      await db.query("DELETE FROM room_dining_suggestions WHERE room_id=$1", [otherRoom]);
      await db.exec(
        await readFile(
          new URL("../drizzle/migrations/0011_dining_suggestion_history.sql", import.meta.url),
          "utf8",
        ),
      );
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`SET ROLE ${role}`);
        try {
          for (const table of [
            "dining_preferences",
            "room_dining_preferences",
            "dining_feedback",
            "room_dining_suggestions",
            "dining_suggestion_history",
          ]) {
            await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/);
          }
          await assert.rejects(
            db.query("SELECT claim_dining_suggestions($1,$2)", [room, "a"]),
            /permission denied/,
          );
          await assert.rejects(
            db.query("SELECT refresh_dining_suggestions($1,$2)", [room, "a"]),
            /permission denied/,
          );
          await assert.rejects(
            db.query("SELECT complete_dining_suggestions($1,$2,$3,$4,$5,$6)", [
              room,
              "a",
              "context",
              0,
              "[]",
              "rules",
            ]),
            /permission denied/,
          );
        } finally {
          await db.exec("RESET ROLE");
        }
      }
      const rls = await db.query(
        "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('dining_preferences','room_dining_preferences','dining_feedback','room_dining_suggestions','dining_suggestion_history')",
      );
      assert.equal(rls.rows.length, 5);
      assert.ok(rls.rows.every((row) => row.relrowsecurity));
      await db.exec("SET ROLE service_role");
      const claim = async (hash) =>
        (await db.query("SELECT claim_dining_suggestions($1,$2) AS claimed", [room, hash])).rows[0]
          .claimed;
      assert.equal(await claim("first"), true);
      assert.equal(await claim("first"), false);
      assert.equal(await claim("changed"), false, "another input cannot bypass an active lease");
      await db.query(
        "UPDATE room_dining_suggestions SET fingerprint=$2, lease_until=now()-interval '1 second', requested_at=now()-interval '6 seconds' WHERE room_id=$1",
        [room, "first"],
      );
      assert.equal(await claim("first"), false, "completed identical inputs are reused");
      assert.equal(await claim("changed"), true);
      await db.query(
        "UPDATE room_dining_suggestions SET lease_until=now()-interval '1 second', requested_at=now()-interval '6 seconds' WHERE room_id=$1",
        [room],
      );
      assert.equal(await claim("changed"), true, "expired failed jobs can retry");
      await db.exec("RESET ROLE");
      const complete = async (fingerprint, version, id) =>
        (
          await db.query("SELECT complete_dining_suggestions($1,$2,$3,$4,$5,$6) AS completed", [
            room,
            fingerprint,
            "context",
            version,
            JSON.stringify([{ restaurant: { id } }]),
            "gemini",
          ])
        ).rows[0].completed;
      assert.equal(await complete("changed", 0, "first-place"), true);
      await db.query(
        "UPDATE room_dining_suggestions SET requested_at=now()-interval '6 seconds' WHERE room_id=$1",
        [room],
      );
      const refresh = async () =>
        (await db.query("SELECT refresh_dining_suggestions($1,$2) AS changed", [room, "changed"]))
          .rows[0].changed;
      assert.equal(await refresh(), true);
      assert.equal(await refresh(), false, "double clicks advance only one round");
      assert.equal(
        (await db.query("SELECT claim_dining_suggestions($1,$2) AS claimed", [room, "next"]))
          .rows[0].claimed,
        true,
      );
      assert.equal(await complete("wrong-job", 1, "bad"), false);
      assert.equal(await complete("next", 0, "bad"), false, "stale generations cannot publish");
      assert.equal(await complete("next", 1, "second-place"), true);
      assert.equal(await complete("next", 1, "second-place"), false);
      const archived = (
        await db.query("SELECT suggestions FROM dining_suggestion_history WHERE room_id=$1", [room])
      ).rows;
      assert.equal(archived.length, 1);
      assert.equal(archived[0].suggestions[0].restaurant.id, "first-place");
      await db.query(
        "INSERT INTO room_dining_preferences(member_id,room_id,preferences) VALUES($1,$2,'{}')",
        [member, room],
      );
      await assert.rejects(
        db.query("UPDATE room_dining_preferences SET room_id=$2 WHERE member_id=$1", [
          member,
          otherRoom,
        ]),
        /Not a member/,
      );
      await db.query("UPDATE rooms SET status='voting' WHERE id=$1", [room]);
      await assert.rejects(refresh(), /locked/);
      assert.equal(await complete("next", 1, "blocked"), false);
      await assert.rejects(
        db.query("UPDATE room_dining_preferences SET preferences='{}' WHERE member_id=$1", [
          member,
        ]),
        /locked/,
      );
      await assert.rejects(
        db.query(
          "INSERT INTO dining_feedback(member_id,room_id,restaurant_id,visited,enjoyed) VALUES($1,$2,'place',false,true)",
          [member, room],
        ),
        /check constraint/,
      );
      await db.query(
        "INSERT INTO dining_feedback(member_id,room_id,restaurant_id,visited,enjoyed) VALUES($1,$2,'place',true,true)",
        [member, room],
      );
      await db.query("INSERT INTO dining_preferences(user_id,preferences) VALUES($1,'{}')", [user]);
      await db.query("DELETE FROM auth.users WHERE id=$1", [user]);
      for (const table of ["dining_preferences", "room_dining_preferences", "dining_feedback"])
        assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length, 0);
      await db.query("DELETE FROM rooms WHERE id=$1", [room]);
      assert.equal((await db.query("SELECT * FROM room_dining_suggestions")).rows.length, 0);
      assert.equal((await db.query("SELECT * FROM dining_suggestion_history")).rows.length, 0);
    } finally {
      await db.close();
    }
  },
);
