# Deploy Group Grub for the team

This deploys the existing app and Supabase database connection as a public Node
web service. It does not create a second database, migrate tables, or replace
the team's data. Use a Render workspace the team controls and grant teammates
appropriate access there.

## What is included

- `render.yaml`: free-tier Node web service, correct build/start commands,
  health route and manual-entry backend settings.
- `bun run build:render`: a Nitro Node production build. Normal `bun run build`
  stays available for the existing Lovable workflow.
- `bun start`: validates required runtime setting names and starts the server.
- Packaged wait-card font and HTTPS preview metadata for Render's public URL.
- Direct Supabase OAuth on Render (Google/Azure providers must be enabled in
  the existing Supabase project). Normal Lovable builds keep their auth path.
- Direct Google Maps APIs when only a Google server key is set. The existing
  Lovable gateway remains supported if its key is configured too.

## 1. Get this change into the team's repository

Apply the deployment patch on a new branch from current `origin/main`, commit,
push, and merge its pull request. Do not commit your real `.env`. The installer
in the downloadable setup kit performs the branch, patch, commit, and push
steps; it stops if tracked files have uncommitted edits.

Confirm `render.yaml` and `scripts/build-render.mjs` are on GitHub's `main`
branch before continuing. Render cannot see files that only exist on your Mac.

## 2. Create the service

Open https://dashboard.render.com/ and select the intended TEAM workspace.
Choose **New > Blueprint**, connect GitHub, and select
`TaylorKim13/groupgrubpicker`, branch `main`, path `render.yaml`.

The direct Blueprint link, only AFTER the file is merged, is:
https://dashboard.render.com/blueprint/new?repo=https://github.com/TaylorKim13/groupgrubpicker

Review the single web service named `groupgrub-team` and the Free compute plan.
Do not create a new database. If the name already belongs to an unrelated
service, choose a unique name in the Blueprint before applying it.

Enter these three settings privately using the team's actual values:

| Setting | Where it is used |
| --- | --- |
| `SUPABASE_URL` | Existing team project's URL |
| `SUPABASE_PUBLISHABLE_KEY` | Public/publishable key for browser and user auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only room operations |

Do NOT put the service-role key in any `VITE_*` setting. The build command
copies only the URL and publishable key to their browser-facing `VITE_*`
aliases. You do not need a new Supabase project.

For a manually created Web Service instead of a Blueprint, use:

- Runtime: Node
- Build: `bun install --frozen-lockfile && bun run build:render`
- Start: `node scripts/start-render.mjs`
- Health-check path: `/health`
- Node version: `24.22.1`
- Bun version: `1.4.4`
- Host: `0.0.0.0`; let Render supply `PORT`

Use Render's **Environment > Add from .env** privately if importing existing
values. Then choose **Save, rebuild, and deploy**, because public browser
settings are compiled at build time. Optional maps settings are described in
`.env.render.example`. Do not share screenshots containing secret values.

Click **Deploy Blueprint/Apply**, and wait for its deployment status to be Live.
A successful source build alone does not mean the deployment is live.

## 3. Finish authentication settings

After Render gives you the actual HTTPS URL, add that origin plus `/account`
to the existing Supabase project's Auth > URL Configuration redirect allowlist.
Google and Azure/Microsoft must also be enabled/configured as Supabase auth
providers to use those buttons. Keep the old Lovable URLs allowed while your
team still uses them. Do not change the project's primary Site URL until the
team intentionally chooses the new host as canonical.

If you use maps, configure the browser key for the new domain and enable the
Maps JavaScript API. The server key needs Geocoding and Places API (New) for
address/restaurant search. Server keys remain server-only. Missing map keys do
not block sample restaurant cards or voting, but map/search features will be
unavailable until configured.

## 4. Verify with the real backend

- Visit `/health`: it should return `ok`. This checks that the process can serve
  requests; it is NOT a database connectivity test.
- Create a table, open its invite from a second device on cellular, join, vote,
  and reveal a winner. This verifies the actual Supabase credentials/schema.
- Use Invite via text from the NEW public site; it shares that site's origin.
- Test a restaurant wait card. Both HTML and PNG should load over HTTPS.
- Test email signup/sign-in and enabled OAuth providers with the final domain.

Requests use the new `onrender.com` origin automatically. Once a custom domain
is attached, set `PUBLIC_SITE_URL` to that HTTPS origin and redeploy for canonical
preview metadata. The Swift/Xcode app's `AppConfig.website` needs the final URL
before rebuilding that app.

## Team workflow and free-tier behavior

Keep code changes in GitHub pull requests. With GitHub properly connected and
auto-deploy enabled, merges to the linked `main` branch trigger new deployments.
Services created only from a public repository URL may require manual deploys.

The Free plan spins down after inactivity; the next visitor may wait roughly a
minute. That may also cause inconsistent messaging previews. Use a paid compute
plan if the team needs an always-running service. This kit does not subscribe
to a paid plan. Existing Supabase rows remain durable across Render restarts.

## Reproduce validation locally

```bash
bun install --frozen-lockfile
node --test tests/deployment.test.mjs
bun test tests/wait-card.test.ts
bun run build:render
bun x tsc --noEmit
```

Build and runtime HTTP smoke checks passed without real credentials. The smoke
server used dummy values and did not query or mutate the team's database.
Creating/joining real rooms, external OAuth, and maps require the team's real
configuration and must be verified after deployment. The Render YAML is checked
against Render's current JSON Schema; workspace-aware CLI validation and live
creation need an authenticated Render workspace.

References: Render Blueprints, environment variables, Node/Bun versions,
free-tier behavior and deploys at https://render.com/docs/; Supabase redirect
configuration at https://supabase.com/docs/guides/auth/redirect-urls.
