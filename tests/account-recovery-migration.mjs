import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users, display_name text NOT NULL DEFAULT '');
    CREATE FUNCTION public.create_grub_profile() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO public.profiles(id) VALUES(NEW.id); RETURN NEW; END; $$;
    CREATE TRIGGER create_grub_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_grub_profile();
    INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-000000000001','existing@example.com');
  `);
  await db.exec(
    await readFile(
      new URL("../drizzle/migrations/0007_account_recovery.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    ('00000000-0000-0000-0000-000000000002','saved@example.com','{"username":" Taylor_13 ","full_name":"Taylor"}');`);
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const resolve = async (kind, identifier, ip = "ip") =>
    (
      await query("SELECT public.resolve_grub_recovery($1,$2,$3) AS email", [kind, identifier, ip])
    )[0].email;
  const clear = () => db.exec("TRUNCATE public.account_recovery_limits");
  assert.equal(
    (await query("SELECT username FROM public.profiles WHERE display_name='Taylor'"))[0].username,
    "taylor_13",
  );
  assert.equal(
    (await query("SELECT username FROM public.profiles WHERE display_name=''"))[0].username,
    null,
  );
  await assert.rejects(
    db.exec(
      `INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('00000000-0000-0000-0000-000000000003','duplicate@example.com','{"username":"TAYLOR_13"}')`,
    ),
    /duplicate key/,
  );
  assert.equal((await query("SELECT count(*) AS count FROM auth.users"))[0].count, 2);
  await assert.rejects(
    db.exec("UPDATE public.profiles SET username='bad name'"),
    /check constraint/,
  );
  assert.equal(await resolve("username", " TAYLOR_13 "), "saved@example.com");
  assert.equal(await resolve("username", "taylor_13"), null);
  assert.equal(await resolve("email", "saved@example.com", "different-ip"), null);
  await clear();
  assert.equal(await resolve("email", " SAVED@EXAMPLE.COM "), "saved@example.com");
  assert.equal(await resolve("username", "taylor_13", "different-ip"), null);
  assert.equal(await resolve("username", "unknown"), null);
  assert.equal(await resolve("username", "%"), null);
  await clear();
  assert.equal(await resolve("email", "existing@example.com"), "existing@example.com");
  await clear();
  for (let i = 0; i < 5; i++) {
    assert.equal(await resolve("username", "taylor_13"), "saved@example.com");
    await db.exec(
      "UPDATE public.account_recovery_limits SET last_requested = now() - interval '61 seconds'",
    );
  }
  assert.equal(await resolve("username", "taylor_13"), null);
  await db.exec(
    "UPDATE public.account_recovery_limits SET window_started = now() - interval '61 minutes'",
  );
  assert.equal(await resolve("username", "taylor_13"), "saved@example.com");
  await clear();
  for (let i = 0; i < 30; i++) await resolve("username", `unknown_${i}`);
  assert.equal(await resolve("username", "taylor_13"), null);
  await clear();
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(resolve("username", "taylor_13"), /permission denied/);
    await assert.rejects(
      db.exec("SELECT * FROM public.account_recovery_limits"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("SELECT public.claim_grub_recovery('bypass', 5, 60)"),
      /permission denied/,
    );
    await db.exec("RESET ROLE");
  }
  await db.exec("SET ROLE service_role");
  assert.equal(await resolve("username", "taylor_13"), "saved@example.com");
  await db.exec("RESET ROLE");
  console.log(
    "PASS: signup trigger, normalization, unique usernames, existing accounts, private resolution, cooldown, shared alias limits, hourly/IP limits, and role access controls",
  );
} finally {
  await db.close();
}
