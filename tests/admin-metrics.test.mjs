import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const url = (s) => "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const compile = (s) =>
  ts.transpileModule(s, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
let lookups = 0;
globalThis.__adminTest = {
  from: () => ({
    select: () => ({
      eq: (_key, email) => ({
        maybeSingle: async () => ({
          data: email === "live@example.com" ? { email } : null,
          error: null,
        }),
      }),
    }),
  }),
  auth: {
    admin: {
      getUserById: async (id) => {
        lookups++;
        return {
          data: {
            user:
              id === "allowed" ? { email: "ADMIN@example.com" } : { email: "other@example.com" },
          },
          error: null,
        };
      },
    },
  },
};
const adminStub = url("export const supabaseAdmin = globalThis.__adminTest;");
const accessUrl = url(
  compile(
    await readFile(new URL("../src/lib/admin-access.server.ts", import.meta.url), "utf8"),
  ).replaceAll('"@/integrations/supabase/client.server"', JSON.stringify(adminStub)),
);
const { isAdministrator } = await import(accessUrl);
test("admin allowlist fails closed and uses the current account email", async () => {
  const previous = process.env.ADMIN_EMAILS;
  try {
    delete process.env.ADMIN_EMAILS;
    assert.equal(await isAdministrator("allowed"), false);
    assert.equal(lookups, 1);
    process.env.ADMIN_EMAILS = " admin@example.com, teammate@example.com ";
    assert.equal(await isAdministrator("allowed"), true);
    assert.equal(await isAdministrator("other"), false);
    const transport = url(
      "export function createServerFn(){return {middleware(){return this},inputValidator(){return this},handler(fn){return fn}}}",
    );
    const middleware = url("export const requireSupabaseAuth={};");
    const source = compile(
      await readFile(new URL("../src/lib/metrics.functions.ts", import.meta.url), "utf8"),
    )
      .replaceAll('"./admin-access.server"', JSON.stringify(accessUrl))
      .replaceAll('"@/integrations/supabase/client.server"', JSON.stringify(adminStub))
      .replaceAll('"@tanstack/react-start"', JSON.stringify(transport))
      .replaceAll('"@/integrations/supabase/auth-middleware"', JSON.stringify(middleware))
      .replaceAll('"zod"', JSON.stringify(import.meta.resolve("zod")));
    const { getMetrics, getAdminAccess, addDashboardAdministrator, listDashboardAdministrators } =
      await import(url(source));
    assert.deepEqual(await getAdminAccess({ context: { userId: "other" } }), {
      administrator: false,
    });
    await assert.rejects(
      addDashboardAdministrator({
        context: { userId: "other" },
        data: { email: "intruder@example.com" },
      }),
      /Administrator access required/,
    );
    await assert.rejects(
      listDashboardAdministrators({ context: { userId: "other" } }),
      /Administrator access required/,
    );
    await assert.rejects(
      getMetrics({ context: { userId: "other" } }),
      /Administrator access required/,
    );

    const reportData = {
      filter_usage_metrics: {
        total_voting_sessions: 2,
        filtered_voting_sessions: 1,
        location_filter_sessions: 1,
        price_filter_sessions: 0,
        filter_usage_rate_percent: 50,
        target_met: false,
      },
      selection_abandonment_metrics: {
        entered_users: 2,
        selected_users: 1,
        abandoned_users: 0,
        pending_users: 1,
        abandonment_rate_percent: 0,
        target_met: true,
      },
      group_creation_click_metrics: {
        created_groups: 2,
        measured_groups: 2,
        unmeasured_groups: 0,
        average_clicks: 2,
        measurement_coverage_percent: 100,
        target_met: true,
      },
    };
    globalThis.__adminTest.from = (table) => {
      assert.ok(reportData[table], "Main metrics must not depend on optional duration views");
      return { select: () => ({ single: async () => ({ data: reportData[table], error: null }) }) };
    };
    const metrics = await getMetrics({ context: { userId: "allowed" } });
    assert.equal(metrics.filters.total_voting_sessions, 2);
    assert.equal(metrics.clicks.average_clicks, 2);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previous;
    delete globalThis.__adminTest;
  }
});

test("administrator migration seeds the team and keeps browser roles out", async (t) => {
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
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);",
    );
    await db.exec(
      await readFile(
        new URL("../drizzle/migrations/0007_dashboard_administrators.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.equal((await db.query("SELECT * FROM public.dashboard_administrators")).rows.length, 5);
    for (const role of ["anon", "authenticated"]) {
      await db.exec("SET ROLE " + role);
      await assert.rejects(
        db.query("SELECT * FROM public.dashboard_administrators"),
        /permission denied/,
      );
      await assert.rejects(
        db.exec(
          "INSERT INTO public.dashboard_administrators(email) VALUES ('intruder@example.com')",
        ),
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
    await db.exec(
      "SET ROLE service_role; INSERT INTO public.dashboard_administrators(email) VALUES ('new@example.com') ON CONFLICT DO NOTHING; INSERT INTO public.dashboard_administrators(email) VALUES ('new@example.com') ON CONFLICT DO NOTHING;",
    );
    assert.equal((await db.query("SELECT * FROM public.dashboard_administrators")).rows.length, 6);
  } finally {
    await db.close();
  }
});
