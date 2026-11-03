# Create and join a group

- From Home, click **Start a new table**, type a nickname into the automatically
  focused field, then click **Create table**. This is two clicks; the walkthrough
  and avatar changes are optional. Enter can submit the nickname form as well.
- The room shows its unique six-character code, **Copy code**, **Copy invite link**,
  and a selectable join URL as a fallback when clipboard permission is denied.
- Friends can use **Join friends** on Home or open `/room/CODE`. Both flows accept
  guests, require a nickname, and normalize lowercase codes to uppercase.
- The participant list includes a count, a **host** badge, and a **(you)** marker.
  Other participants' joins appear through the existing 2.5-second polling.

Room codes retain the database's unique constraint. Creation retries collisions up
to five times, reports other failures promptly, and removes a newly created room
if its host cannot be added. Only hashed room passes are stored. Invite links carry
the public code and never include a private room pass.

## Verification

`npm test` includes server-handler tests using in-memory storage for guest creation,
code/link joining, host identification, collisions, failed-creation cleanup, invalid
input, missing/closed rooms, private passes, and anonymous vote privacy. Component
tests check copied code/link contents and clipboard failure feedback.

For a live acceptance check, configure the server's `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Create a group in one
browser, then join through a separate browser/private window with the copied link.
Join another guest by code, verify everyone appears with exactly one host, refresh
to verify room-pass persistence, and check both clipboard buttons. No account is
required. Live database behavior cannot be checked without the server configuration.
