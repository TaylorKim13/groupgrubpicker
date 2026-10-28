# Account settings deployment and checks

## Database

Apply `drizzle/migrations/0002_account_settings.sql` using the project's existing
Drizzle migration process before deploying the account UI. It adds the profile's
distance unit, an atomic preferences-save RPC, and a deletion trigger. The migration
journal includes the new migration. Do not use schema push against the intentionally
empty generated Drizzle schema.

Also apply `0003_profile_photos.sql` before using photo uploads. It creates a public
`profile-photos` Storage bucket with a 1 MB JPEG limit. Uploads, replacements, and
deletions run through authenticated account server functions; browser write access
to the bucket is not granted. Existing emoji avatars continue to work.

In Account → Settings → Your profile, choose a JPG, PNG, or WebP up to 5 MB. The
browser crops it to a 256 × 256 JPEG, previews it, and uploads only when Save profile
is clicked. Replacing or removing a photo cleans up its previous storage object;
account deletion removes the account's photo files before deleting the auth user.
If the auth deletion then fails, the photo may already be removed; the account
remains and its avatar falls back to an emoji until a new photo is saved.

The application server needs `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. The service key stays on the server. Address lookup
in room host controls uses the existing `LOVABLE_API_KEY` and `GOOGLE_MAPS_API_KEY` connector configuration. Locations are selected for each group and are never saved or applied as account preferences. Previously saved location keys are ignored.

## Authentication

In Supabase Authentication URL Configuration, allow the production origin's
`/account` and `/reset-password` URLs, plus the corresponding development URLs
when testing locally. Keep the Site URL set to the deployed application origin.
Retain secure email-change confirmation; the UI tells users to check their inboxes.
Password changes require the current password for email/password accounts.
Social-only accounts manage passwords through their sign-in provider.

Remote auth configuration and email delivery cannot be verified from this workspace
without backend access. Test a real recovery email, an expired link, and confirmation
of an email change on the deployed origin before release.

## Verification

- `npm test`: shared validation, distance conversion and filtering, boundary values,
  and independent room preference snapshots.
- `npx tsc --noEmit` and `npm run build`: type and production compilation checks.
- `npm run lint`: repository-wide lint; the repository has existing formatting and
  explicit-`any` errors outside this feature.
- To repeat the isolated PostgreSQL migration checks, temporarily install
  `npm install --no-save --package-lock=false @electric-sql/pglite`, then run
  `npm run test:migration`. This uses an in-memory database and never connects to
  production. The runtime is optional and is not an application dependency.

With disposable test accounts, verify saved defaults on new hosted rooms, unchanged
existing rooms, room-to-account preference saving, both distance units, profile edits,
email/password changes, and deletion. Deletion must preserve group votes and scores,
anonymize attribution, invalidate previous room passes, and remove social links.

Guests default to miles. Country-based unit detection is deferred. Legacy nomination
snapshots identify authors by nickname; new nominations also store the room member ID
so deletion can distinguish members with the same nickname.
