// Read-only: node --env-file=.env scripts/check-google-login.mjs
// Never logs credentials, OAuth state, or full authorization URLs.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const backend = new URL(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const site = new URL(process.env.PUBLIC_SITE_URL || "https://groupgrub-team.onrender.com");
  assert.equal(backend.protocol, "https:", "Supabase must use HTTPS");
  assert.equal(site.protocol, "https:", "Live site must use HTTPS");
  const settings = await fetch(`${backend.origin}/auth/v1/settings`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(settings.ok, `Provider settings returned HTTP ${settings.status}`);
  assert.equal((await settings.json()).external?.google, true, "Google provider is not enabled");
  console.log("PASS: Google is enabled in Supabase.");

  const client = createClient(backend.origin, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${site.origin}/account`, skipBrowserRedirect: true },
  });
  assert.ok(!error && data.url, "Could not create the Google sign-in URL");
  const response = await fetch(data.url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  assert.ok([302, 303].includes(response.status), `OAuth start returned HTTP ${response.status}`);
  const google = new URL(response.headers.get("location"));
  assert.equal(google.origin, "https://accounts.google.com", "OAuth did not redirect to Google");
  assert.match(
    google.searchParams.get("client_id") || "",
    /^[\w.-]+\.apps\.googleusercontent\.com$/,
    "Google client ID is missing or malformed",
  );
  assert.equal(
    google.searchParams.get("redirect_uri"),
    `${backend.origin}/auth/v1/callback`,
    "Google callback is incorrect",
  );
  const scopes = (google.searchParams.get("scope") || "").split(" ");
  // Supabase's Google OAuth flow can use the userinfo API with email/profile
  // scopes; it does not require an OpenID Connect ID-token flow.
  for (const aliases of [
    ["email", "https://www.googleapis.com/auth/userinfo.email"],
    ["profile", "https://www.googleapis.com/auth/userinfo.profile"],
  ])
    assert.ok(
      aliases.some((scope) => scopes.includes(scope)),
      "A required Google identity scope is missing",
    );
  console.log(
    "PASS: Supabase redirects to Google with a client ID, the expected callback, and identity scopes.",
  );

  const page = await fetch(`${site.origin}/account`, { signal: AbortSignal.timeout(45000) });
  assert.ok(page.ok, `Live account page returned HTTP ${page.status}`);
  const html = await page.text();
  console.log("PASS: Live account page responds successfully.");
  console.log(
    `Live page Google button: ${html.includes("Continue with Google") ? "present" : "not found in server-rendered HTML; deployment may be pending"}.`,
  );
  console.log(
    `Live page Microsoft button: ${html.includes("Continue with Microsoft") ? "present; deployment may be pending" : "not found in server-rendered HTML"}.`,
  );
  console.log(
    "Manual check still required: complete Google consent, confirm your profile loads, then sign out and back in.",
  );
}

main().catch((error) => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Check failed. Check network access and configured URLs/keys.",
  );
  process.exitCode = 1;
});
