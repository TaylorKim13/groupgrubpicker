import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
test("voting duration counts five-minute boundaries, unfinished sessions and private access", async (t) => {
  let PGlite;
  try {
    ({ PGlite } = await import("@electric-sql/pglite"));
  } catch {
    t.skip("Optional PGlite runtime is not installed");
    return;
  }
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE public.room_filter_usage(id uuid DEFAULT gen_random_uuid(), voting_started_at timestamptz, restaurant_selected_at timestamptz); GRANT SELECT ON public.room_filter_usage TO service_role;",
    );
    await db.exec(
      await readFile(
        new URL("../drizzle/migrations/0008_voting_duration.sql", import.meta.url),
        "utf8",
      ),
    );
    let row = (await db.query("SELECT * FROM public.voting_duration_metrics")).rows[0];
    assert.equal(Number(row.total_voting_sessions), 0);
    assert.equal(row.within_five_minutes_percent, null);
    await db.exec(
      "INSERT INTO public.room_filter_usage(voting_started_at,restaurant_selected_at) VALUES ('2026-10-28 12:00Z','2026-10-28 12:04:59Z'),('2026-10-28 12:00Z','2026-10-28 12:05Z'),('2026-10-28 12:00Z','2026-10-28 12:05:00.001Z'),('2026-10-28 12:00Z',NULL),(NULL,NULL);",
    );
    row = (await db.query("SELECT * FROM public.voting_duration_metrics")).rows[0];
    assert.equal(Number(row.total_voting_sessions), 4);
    assert.equal(Number(row.sessions_within_five_minutes), 2);
    assert.equal(Number(row.completed_sessions), 3);
    assert.equal(Number(row.unfinished_sessions), 1);
    assert.equal(Number(row.within_five_minutes_percent), 50);
    assert.equal(
      (
        await db.query(
          "SELECT duration_seconds FROM public.voting_session_durations WHERE duration_seconds=300",
        )
      ).rows.length,
      1,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec("SET ROLE " + role);
      await assert.rejects(
        db.query("SELECT * FROM public.voting_duration_metrics"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT * FROM public.voting_session_durations"),
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    assert.equal((await db.query("SELECT * FROM public.voting_session_durations")).rows.length, 4);
  } finally {
    await db.close();
  }
});
