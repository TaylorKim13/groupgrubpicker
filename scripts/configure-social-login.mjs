// Check: node scripts/configure-social-login.mjs
// Apply: node scripts/configure-social-login.mjs --apply
// All secrets are loaded privately from .env; none are logged.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const env = {
  ...(existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")) : {}),
  ...process.env,
};
const required = [
  "SUPABASE_ACCESS_TOKEN", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET",
  "MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_SECRET", "PUBLIC_SITE_URL",
];

async function main() {
  const backend = new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "");
  const project = /^([a-z0-9]+)\.supabase\.co$/.exec(backend.hostname)?.[1];
  if (backend.protocol !== "https:" || !project || backend.username || backend.password) {
    throw new Error("Set SUPABASE_URL to the intended hosted Supabase project URL.");
  }
  const publicKey = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!publicKey) throw new Error("Set SUPABASE_PUBLISHABLE_KEY.");
  const publicSettings = async () => {
    const response = await fetch(`${backend.origin}/auth/v1/settings`, {
      headers: { apikey: publicKey }, signal: AbortSignal.timeout(15000), redirect: "error",
    });
    if (!response.ok) throw new Error(`Auth status check failed (HTTP ${response.status}).`);
    return response.json();
  };
  const status = await publicSettings();
  console.log(JSON.stringify({ project, googleEnabled: status.external?.google, microsoftEnabled: status.external?.azure }));
  console.log(`Provider callback: ${backend.origin}/auth/v1/callback`);
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length) {
    console.log(`Missing private .env settings: ${missing.join(", ")}`);
    if (process.argv.includes("--apply")) process.exitCode = 1;
    return;
  }
  const site = new URL(env.PUBLIC_SITE_URL);
  if (site.protocol !== "https:" || site.username || site.password || site.pathname !== "/" || site.search || site.hash) {
    throw new Error("PUBLIC_SITE_URL must be your website's HTTPS origin with no path, query, or credentials.");
  }
  if (!process.argv.includes("--apply")) {
    console.log("Required settings are present. Run with --apply to configure both providers and allow the account redirect.");
    return;
  }
  // The management API requires a personal access token, not the service-role key.
  const endpoint = `https://api.supabase.com/v1/projects/${project}/config/auth`;
  const headers = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" };
  const existing = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!existing.ok) throw new Error(`Cannot read provider configuration (HTTP ${existing.status}). Check the management token's project access.`);
  const config = await existing.json();
  const redirects = (config.uri_allow_list || "").split(",").map(value => value.trim()).filter(Boolean);
  const accountRedirect = `${site.origin}/account`;
  const response = await fetch(endpoint, {
    method: "PATCH", headers, signal: AbortSignal.timeout(15000), redirect: "error",
    body: JSON.stringify({
      external_google_enabled: true,
      external_google_client_id: env.GOOGLE_OAUTH_CLIENT_ID.trim(),
      external_google_secret: env.GOOGLE_OAUTH_CLIENT_SECRET.trim(),
      external_azure_enabled: true,
      external_azure_client_id: env.MICROSOFT_OAUTH_CLIENT_ID.trim(),
      external_azure_secret: env.MICROSOFT_OAUTH_CLIENT_SECRET.trim(),
      // Keep an existing tenant restriction; fresh projects use Microsoft's common tenant.
      external_azure_url: config.external_azure_url || "https://login.microsoftonline.com/common",
      uri_allow_list: [...new Set([...redirects, accountRedirect])].join(","),
    }),
  });
  if (!response.ok) throw new Error(`Provider configuration failed (HTTP ${response.status}).`);
  const verified = await publicSettings();
  if (!verified.external?.google || !verified.external?.azure) {
    throw new Error("Configuration was submitted, but both providers are not yet enabled. Recheck their dashboard settings.");
  }
  console.log("Google and Microsoft are enabled. Complete a sign-in with each provider on the public website to verify consent and callbacks.");
}

main().catch(error => {
  // Never print request/response objects or error causes containing credentials.
  console.error(error instanceof TypeError ? "Check the configured URLs and network connection." : error.message);
  process.exitCode = 1;
});
