import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = (await readFile(new URL("../scripts/configure-social-login.mjs", import.meta.url), "utf8"))
  .replace(/^import .*;$/gm, "")
  .replace("main().catch", "globalThis.completed = main().catch");
const env = {
  SUPABASE_URL: "https://testproject.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-key",
  SUPABASE_ACCESS_TOKEN: "private-management-token",
  GOOGLE_OAUTH_CLIENT_ID: "google-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "private-google-secret",
  MICROSOFT_OAUTH_CLIENT_ID: "microsoft-id",
  MICROSOFT_OAUTH_CLIENT_SECRET: "private-microsoft-secret",
  PUBLIC_SITE_URL: "https://site.example",
};
async function run(overrides = {}, apply = false, managementStatus = 200) {
  const calls = [], logs = [];
  let enabled = false;
  const context = vm.createContext({
    URL, AbortSignal, Set,
    existsSync: () => false,
    process: { env: { ...env, ...overrides }, argv: apply ? ["--apply"] : [], exitCode: 0 },
    console: { log: (...args) => logs.push(args.join(" ")), error: (...args) => logs.push(args.join(" ")) },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === "https://testproject.supabase.co/auth/v1/settings") {
        return { ok: true, json: async () => ({ external: { google: enabled, azure: enabled } }) };
      }
      assert.equal(url, "https://api.supabase.com/v1/projects/testproject/config/auth");
      assert.equal(options.headers.Authorization, "Bearer private-management-token");
      assert.equal(options.redirect, "error");
      if (options.method === "PATCH") enabled = true;
      return { ok: managementStatus === 200, status: managementStatus, json: async () => ({
        uri_allow_list: "https://old.example/account,https://site.example/account",
        external_azure_url: "https://login.microsoftonline.com/existing-tenant",
      }) };
    },
  });
  vm.runInContext(source, context);
  await context.completed;
  assert.ok(!logs.join(" ").includes("private-"), "credentials must not appear in output");
  return { calls, logs, exitCode: context.process.exitCode };
}

test("default check is read-only and reports missing setting names without secret values", async () => {
  const checked = await run();
  assert.equal(checked.calls.length, 1);
  const missing = await run({ GOOGLE_OAUTH_CLIENT_SECRET: "" }, true);
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.calls.length, 1);
  assert.ok(missing.logs.join(" ").includes("GOOGLE_OAUTH_CLIENT_SECRET"));
});

test("apply configures both providers while preserving redirects and tenant restrictions", async () => {
  const { calls, exitCode } = await run({}, true);
  assert.equal(exitCode, 0);
  const patch = JSON.parse(calls.find(call => call.options.method === "PATCH").options.body);
  assert.equal(patch.external_google_enabled, true);
  assert.equal(patch.external_azure_enabled, true);
  assert.equal(patch.external_google_secret, env.GOOGLE_OAUTH_CLIENT_SECRET);
  assert.equal(patch.external_azure_secret, env.MICROSOFT_OAUTH_CLIENT_SECRET);
  assert.equal(patch.external_azure_url, "https://login.microsoftonline.com/existing-tenant");
  assert.equal(patch.uri_allow_list, "https://old.example/account,https://site.example/account");
  assert.equal("site_url" in patch, false);
});

test("invalid origins and denied management access prevent configuration writes", async () => {
  for (const overrides of [{ SUPABASE_URL: "https://other.example" }, { PUBLIC_SITE_URL: "http://site.example" }]) {
    const checked = await run(overrides, true);
    assert.equal(checked.exitCode, 1);
    assert.equal(checked.calls.some(call => call.options.method === "PATCH"), false);
  }
  const denied = await run({}, true, 403);
  assert.equal(denied.exitCode, 1);
  assert.equal(denied.calls.some(call => call.options.method === "PATCH"), false);
});
