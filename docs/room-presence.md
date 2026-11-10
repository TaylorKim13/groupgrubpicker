# Close tables with no viewers

Apply `drizzle/migrations/0016_room_presence.sql` to the connected Supabase database before enabling this app version. It creates private per-tab presence, service-only RPCs, and a pg_cron job that runs every minute. Enable the Supabase pg_cron integration if the extension is unavailable.

Visible table pages check in every 20 seconds, even after voting. Hidden tabs and departed pages report departure. A table closes when no tab has checked in or departed within 90 seconds; the minute scheduler means closure normally takes 90?150 seconds. Crashed browsers expire automatically. Returning during the grace period keeps the table open. Returning after closure cannot reopen it.

This applies to dining tables (`rooms`), not saved friend groups (`crews`). Closed tables without a winner show an expiration screen; previously completed results are preserved. Selection analytics remain independent. Browsers never read presence tables directly.

Run `node --test tests/room-presence-migration.mjs` with `@electric-sql/pglite` installed to verify the SQL functions, isolation, grace period, and multiple tabs. The cron extension itself requires hosted PostgreSQL.
