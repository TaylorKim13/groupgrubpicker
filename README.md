# Group Grub

Group Grub helps friends and families choose where to eat together. A host creates a table, shares its invite, and the group votes on nearby restaurants using shared dining preferences.

**[Open Group Grub](https://groupgrub-team.onrender.com/)**

## Features

- Create a table as a guest or use an account, and invite others by room code or link.
- Share table invitations through Messages/SMS.
- Discover restaurants around the group's search center and view them on a map.
- Adjust location, radius, price, and table preferences; search the restaurant pool or nominate a wildcard.
- View Google price ranges when available, restaurant addresses, and directions.
- View Google Popular Times where supported and available.
- Vote together and reveal a group result.
- Save account dining preferences and access account features backed by Supabase.

### Restaurant data limitations

Google restaurant results are a candidate list, not an exhaustive directory. Dollar-sign price levels and available price ranges are estimates, not menu quotes. Missing data must remain unknown.

Popular Times describes typical busyness; it does not guarantee a current wait in minutes. Live wait times are not available for every restaurant. Shared wait cards are snapshots, and sample restaurant wait values are demo data. Confirm current waits, prices, dietary suitability, and allergies directly with the restaurant.

Distances shown on restaurant cards are straight-line distances from the group's search center, not driving distances. The directions link opens Google Maps for route planning.

## Tech stack

The initial application was developed with Lovable for rapid prototyping. The current web application uses React, TypeScript, TanStack Start/Router, Vite, Tailwind CSS, and Radix UI. Supabase provides authentication and PostgreSQL storage. Google Maps/Places provides map and restaurant information. A Nitro Node server runs the application on Render.

Room reads and writes go through server functions that validate a private room pass. Clients poll room state every 2.5 seconds. Restaurant discovery is briefly cached, and the restaurant pool is saved when voting begins so the ballot remains consistent.

## Run locally

### 1. Prerequisites

- Git, Node.js 22 or newer with native WebSocket support, and Bun. The deployment configuration uses Node 24.
- Access to the team's Supabase project, or a separate development project with the required schema.
- A Google Cloud project and appropriately configured keys for maps and real restaurant searches.

### 2. Install

```bash
git clone https://github.com/TaylorKim13/groupgrubpicker.git
cd groupgrubpicker
bun install
```

### 3. Configure `.env`

Create `.env` in the repository root. Replace the placeholders privately:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key

GOOGLE_MAPS_API_KEY=your-server-google-key
VITE_GOOGLE_MAPS_BROWSER_KEY=your-browser-google-key
```

Use the same Supabase project for both URL entries and the same publishable key for both publishable-key entries. The explicit `VITE_` values prevent development builds from relying on the team's fallback configuration.

Never commit `.env`. Never place the Supabase service-role key or another server secret in a `VITE_` variable: those variables are exposed to browsers. See [.env.render.example](.env.render.example) for hosting settings and optional server integrations.

For an existing team database, obtain the approved configuration from the team. For a separate development database, review and apply the SQL migrations in [supabase/migrations](supabase/migrations) in order before testing. Do not reset the shared team database. Local Supabase CLI workflows require their own local setup; they are not required to connect to the hosted team project.

### 4. Configure Google

Use separate keys for browser and server requests:

| Variable | Purpose |
| --- | --- |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | Browser map and Places UI components |
| `GOOGLE_MAPS_API_KEY` | Server-side restaurant search and geocoding |

Enable billing and the Google APIs required by the features you use: Maps JavaScript API, Geocoding API, Places API (New), and the applicable Places UI Kit service for the Popular Times component. Restrict each key to its intended APIs.

The browser key's website restrictions must allow your actual development origin and production site. For example:

```text
http://localhost:8080/*
http://127.0.0.1:8080/*
https://groupgrub-team.onrender.com/*
```

If Vite starts on another port, allow that origin as well. Do not apply browser website-referrer restrictions to the server key. See [Google Maps setup](docs/google-maps.md) for additional context; this README distinguishes Popular Times from live waits.

### 5. Start

```bash
bun run dev
```

Open the URL printed in Terminal. Restart the development server after changing `.env`.

## Verify the app

1. Create a new table and set its search center.
2. Confirm that the map and restaurant pool load. Check an available price range and a directions link.
3. Open the invite in another browser or device, join with a nickname, and confirm both participants appear.
4. Open voting, submit choices, and reveal the result.
5. Test email account creation/sign-in and persistence after refresh. Confirm saved preferences work.
6. Check invitation sharing and any available Popular Times display. Missing Popular Times or price data is not itself a failure.

## Build and checks

```bash
bun run build:render
npm test
```

The first command generates the Node server at `.output/server/index.mjs`; the second runs the Node test suite defined in `package.json`. A passing build does not establish that all tests or live integrations pass. Database migration checks have separate `test:*` scripts in [package.json](package.json) and require their documented test setup.

## Deploy to Render

The team site is https://groupgrub-team.onrender.com/.

- Keep changes on feature branches and merge reviewed pull requests into the branch linked to Render, normally `main`.
- Configure the required Supabase and Google settings in Render's Environment page. Your local `.env` is not uploaded with Git.
- Build command: `bun install --frozen-lockfile && bun run build:render`.
- Start command: `node scripts/start-render.mjs`.
- Health-check path: `/health`.
- Keep `bun.lock` updated and committed when dependencies change. If a frozen install reports a mismatch, run `bun install` locally and commit the resulting lockfile.
- After changing browser-facing settings, rebuild and deploy; a server restart alone does not update compiled browser values.
- Confirm that the expected commit reaches **Live**, then test a new table on the public site.

`render.yaml` contains the Blueprint configuration. `/health` verifies that the server responds; it does not verify database or Google connectivity. See [DEPLOY-RENDER.md](DEPLOY-RENDER.md) for deployment background; authentication providers should only be tested if currently exposed by the app and configured by the team.

## iOS / Xcode companion

The separate Group Grub iOS project wraps the hosted website in `WKWebView`. Its `AppConfig.website` should point to `https://groupgrub-team.onrender.com/`.

Website changes become available when the app loads the deployed site. Native Swift changes require rebuilding the iOS app and distributing a new build. The iOS project is separate from this web repository.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Google Maps display is not configured | Set `VITE_GOOGLE_MAPS_BROWSER_KEY` before building, then rebuild and deploy. |
| Map/search returns 403 | Confirm the correct browser/server keys, API restrictions, enabled services, billing, and permitted website origin. |
| Node reports native WebSocket is missing | Use Node.js 22+ and restart the development server. |
| `.inputValidator()` deprecation warnings | These warnings alone do not mean the build failed; check for a final error or success status. |
| Production differs from local | Compare deployed commits, verify hosting environment settings, and refresh after the new deployment is Live. |
| Room operations fail | Check Supabase configuration, required migrations, and server logs; preserve room-pass authorization and RLS. |

## Project documentation

- [Original project summary and ERD (PDF)](ReadMe.pdf)
- [Group rooms](docs/group-rooms.md)
- [Account settings](docs/account-settings.md)
- [Account recovery](docs/account-recovery.md)
- [Dining recommendations](docs/dining-recommendations.md)
- [Google Maps setup](docs/google-maps.md)
- [Render deployment](DEPLOY-RENDER.md)

The original PDF is retained for historical project context. Some setup and feature descriptions in it predate the current application; use this README and the current code for setup.
