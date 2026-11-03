# Administrator metrics dashboard

The Metrics tab on Your table (`/account`) shows the three private aggregate reports:
filter usage, selection abandonment, and room creation clicks. It refreshes every
30 seconds while open and supports manual refresh. Reports cover all collected data,
not just the signed-in administrator's rooms.

Set `ADMIN_EMAILS` in the server environment to a comma-separated list of the exact
email addresses administrators use to sign into this app. For local development,
add it to `.env` and restart `npm run dev`. Set it separately in the deployed server's
environment when publishing. Do not use a `VITE_` prefix.

```dotenv
ADMIN_EMAILS=first@example.com,second@example.com
```

Apply `drizzle/migrations/0007_dashboard_administrators.sql` in the Supabase SQL
Editor. It creates a private shared allowlist and seeds the five team addresses.
The Dashboard administrators section lets any administrator grant access to another
email without restarting or redeploying. New grants appear on the recipient's next
access check (within 30 seconds, or after refreshing). They must sign into the app
with that email. Adding an address does not create an account or send an invitation.

`ADMIN_EMAILS` provides bootstrap access in addition to database grants. An empty
environment list and empty database list grant nobody access. Addresses are matched exactly after trimming
and ignoring case. Supabase workspace membership does not grant app administrator
access. Each request authenticates the user and checks their current Supabase account
email against the server allowlist before reading reports. Client metadata and hidden
tab controls cannot grant access. Existing report/table permissions remain private.

Requires metrics migrations `0004`, `0005`, and `0006` and the existing server
Supabase service key, plus migration `0007` for live access management.

`tests/admin-metrics.test.mjs` verifies default denial, email matching, and that
unauthorized metric requests fail before reading any report.
