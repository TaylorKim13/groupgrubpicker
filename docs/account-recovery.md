# Account recovery

The sign-in panel includes **Forgot password or email?**. Users can request an
email with either their email address or their unique recovery username. Both
paths return the same message; the server never returns the associated email.
The email link opens `/reset-password`, where the user chooses and confirms a
new password. Invalid/expired links offer a new recovery request.

New email signups choose a username (3–24 letters, digits, underscores;
case-insensitive). Existing accounts can set one under Account Settings →
Your profile → Recovery username. Nicknames remain separate and may repeat.
Accounts without a username can still recover using their email. Recovery
requires access to the account's inbox.

## Deployment prerequisites

1. Confirm the deployed site's actual Supabase project before applying SQL:
   `vite.config.ts`'s fallback project and `supabase/config.toml` currently name
   different projects. Runtime environment variables may override the fallback.
2. Apply `drizzle/migrations/0007_account_recovery.sql` to that project's existing
   database before deploying this code. It depends on the existing profiles
   migration. Do not run a blind CLI push against the other project. The new
   username index and signup trigger enforce uniqueness atomically.
3. Ensure the app server has `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` for the same project as the browser. The service
   role key must never be a `VITE_*` setting.
4. Set `PUBLIC_SITE_URL` to the canonical HTTPS website origin (Render's
   `RENDER_EXTERNAL_URL` also works). The reset destination is derived on the
   server, not supplied by the form. Local HTTP is allowed only for localhost.
5. Add `https://YOUR-DOMAIN/reset-password` to Supabase Authentication → URL
   Configuration → Redirect URLs. Keep existing sign-in redirects.
6. Configure custom SMTP in Supabase Authentication to deliver to normal users.
   The default sender is restricted to project team addresses. Keep Supabase's
   recovery email template pointing to `{{ .ConfirmationURL }}` so the link
   exchanges the recovery token before returning to the app.

Username resolution and persistent rate limiting run through a service-role-only
RPC. Browser roles cannot resolve emails or access recovery counters. Limits
are one request per identifier/account per minute, five per hour, and thirty
per hour per requester address. The platform should overwrite forwarded IP
headers; these are an additional abuse limit, not an authentication boundary.
Email and username aliases share an account limit. Old counters are pruned.
Provider delivery failures log only error codes; users receive the same generic
response to avoid revealing account existence.

## Verification

Run `node --test tests/recovery.test.mjs` and `node node_modules/typescript/bin/tsc --noEmit`.
The optional SQL integration check is `node tests/account-recovery-migration.mjs`
with `@electric-sql/pglite` installed, or `PGLITE_MODULE` pointing at its module.

After migration/deployment, use an inbox you control to test email and username
requests, case/whitespace normalization, cooldown, expired/reused links, password
mismatch, saving a new password, and signing back in. Confirm unknown usernames
show the same message and no request response exposes an email. Verify existing
accounts can add a username and duplicate usernames are rejected. Test real
delivery on the final public URL; local checks cannot verify SMTP or its allowlist.
