# Group dining recommendations

## Enable the feature

1. In the team's existing Supabase project, apply
   `drizzle/migrations/0009_dining_recommendations.sql` through SQL Editor or the
   established migration process. It adds four private tables, a preference
   lock, account-deletion cleanup, and a function for claiming generation jobs.
   No existing restaurant, member, room, nomination, or vote data is rewritten.
   Then apply `drizzle/migrations/0010_gemini_dining.sql` to allow Gemini's
   provider label. If you already ran 0009, run only 0010; do not rerun 0009.
   For refresh and suggestion history, then apply
   `drizzle/migrations/0011_dining_suggestion_history.sql`. If 0009 and 0010 are
   already applied, only 0011 is needed. This preserves existing suggestions.
2. Build/deploy the application. Existing Google Maps server credentials provide
   the live restaurant pool. Without Maps, suggestions are explicitly labeled
   demo restaurants.
3. For Gemini to choose the restaurants, set these **server-only** variables in
   local `.env` and in Render's Environment settings, then restart/redeploy:

   ```dotenv
   GEMINI_API_KEY=your-private-api-key
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```

   The key is optional. No key, a timeout, a refusal, invalid output, or an API
   failure uses the ordinary ranking and its factual explanations. No Gemini
   request is made without the key. Create a Gemini key at
   <https://aistudio.google.com/api-keys> using a project marked Free tier.
   A separate project from your billed Maps project helps keep the AI setup on
   the free tier. Keep billing disabled for that project and check the current
   model limits in AI Studio. Quota exhaustion falls back to ordinary rankings.
   Google may use free-tier content to improve its products; only aggregate
   approved facts are sent. Do not use `VITE_*` for either credential setting.
   Existing OpenAI variables are no longer used and can be removed privately.

## How it works

### Microphone help

In the lobby, **Help us decide** records up to 60 seconds of a group discussion.
Everyone being recorded must agree before the microphone button is enabled.
The browser requires microphone permission and HTTPS (or localhost). A visible
listening indicator, **Stop and review**, and **Cancel** give the user control.
The scrolling audio bars respond to actual microphone energy and settle when
the microphone is quiet. A progress bar beside the seconds counter fills to
60 seconds; both stop when recording ends.
The microphone stops on cancellation, completion, navigation, or leaving the lobby.
Cancel before submission discards the recording; dismissing an analysis cannot
recall audio already sent to Google.

The app captures mono audio locally and sends a bounded 16 kHz WAV only after
recording stops. Gemini extracts a dining-only summary and validated preferences.
Audio and transcripts are not stored in the app's database or browser storage.
Google receives the audio under its Gemini API terms, including applicable
free-tier data processing terms. The recording request contains no room members,
votes, or personal histories. The summary is shown only in the recording browser
and is sent back to Gemini if the user requests restaurant picks.

**Use audio for suggestions** requests three restaurants directly from the
reviewed discussion, without saving or changing any seat's shared preferences.
This works for guests even when the host is away. The server expands the Places
search with the audio's favorite cuisines, applies all shared group requirements
plus the explicit audio constraints, and sends eligible candidates and the
dining summary to Gemini. Gemini must choose three distinct existing IDs (or
the number available if fewer than three qualify), with grounded explanations.
Results appear below the recording review as a private preview, not a new set
in the shared suggestion history. If Gemini is unavailable or returns invalid
picks, clearly labeled preference-based picks appear instead. Fewer than three
matches are explained, with no invented restaurants or relaxed requirements.

**Review in preference form** fills the existing form for correction. Fields
not discussed keep their current values. The user must click **Use for this
outing** to share the reviewed choices as their seat's preferences. This does
not create extra seats or attribute extracted choices to other group members.
Dollar amounts without explicit restaurant price tiers remain in the summary
for manual review. Restaurant suggestions still use the existing eligibility
checks and Google Places pool; no restaurant facts come from the recording.

The existing server-only `GEMINI_API_KEY` enables voice help. Optional
`GEMINI_AUDIO_MODEL` overrides the audio model; otherwise it uses `GEMINI_MODEL`
or `gemini-3.5-flash-lite`. Choose an audio-input model with structured JSON
support. No new database migration or dependency is required. The server checks
the hashed room pass and lobby status before processing and again before
returning results. Requests are bounded to a minute of audio with a one-minute
per-member cooldown per server process.
The recording button stays disabled during this cooldown and shows a live
seconds-remaining countdown. Availability is checked while the lobby is open
and again before requesting microphone access, including after a page reload.
This cooldown is not a shared quota
across multiple server instances; use provider project quotas for a global cap.
Missing configuration disables the microphone UI. Permission denial, unavailable
audio capture, quota errors, and invalid model output leave manual input usable.

Verify on HTTPS with a real microphone: allow/deny permission, record a brief
cuisine discussion, stop, review/edit, and share. Confirm suggestions update
through the existing host generation flow. Also cancel while recording, navigate
away, and start voting during capture/analysis; the microphone should stop and
locked preferences should not change. Run `node --test tests/dining-conversation.test.mjs`
for audio encoding, input/output validation, failure handling, and cooldown checks.

### Suggestions and preferences

The room's **Suggestions for your table** section offers up to three picks from
the eligible pool. Live discovery searches shared favorite cuisines in addition
to nearby restaurants and uses Google's cuisine types when available. Members
can expand **Share my dining preferences** to choose
cuisines, dislikes, a maximum price/distance, required dietary options, familiar
versus new places, and favorite restaurants. Clicking **Use for this outing**
includes those preferences. **Stop sharing** excludes them again. Preferences
lock when voting starts.

The host can click **Refresh suggestions** in the lobby to show up to three
previously unshown matching restaurants. The previous set moves to the room's
**History** tab with its original timestamp, reasons, and warnings. History is
shared with room members and remains viewable after voting closes. Earlier
suggestions may no longer match changed filters. Up to 100 previous sets are
shown, newest first. It is suggestion history, not evidence of a visit.

Refresh keeps all dietary, budget, and distance checks. With fewer than three
unseen matches, it returns only those remaining; once exhausted, the button
disables and the group can review history or change filters. Changed inputs
start a fresh candidate search. Refresh remains host-only and locks when voting
starts. A database version check prevents double clicks from advancing multiple
rounds, and archiving/publishing runs in one transaction. No additional model
request is made just by opening History.

Guests can participate without an account. Signed-in members who link their
seat can remember their preferences and separately opt into history use. Saved
defaults are presented privately on the next outing but still require sharing
for that outing. Hosting defaults and personal dining preferences are separate.

The host's open room automatically prepares Gemini selections when the input
fingerprint changes. Membership, preferences, restaurant candidates, settings,
consented history/feedback, the date, and AI configuration affect that
fingerprint. Room data continues polling every 2.5 seconds; generation claims
use a database lease to prevent duplicate calls across server instances. A
short cooldown handles rapid edits. Identical input reuses persisted results.
If the host leaves the page, local scoring remains available; AI preparation
resumes when the host returns. No external scheduler or always-running agent
is required.

The ranking first checks all shared budget, distance, and dietary requirements.
Unknown prices cannot satisfy a restricted price range. Google/custom places
have no verified dietary evidence in the current integration, so they cannot
satisfy a dietary requirement. Missing dietary matches produce an explanation
rather than silently relaxing a requirement. Live wait times remain unknown.

Eligible places receive per-person scores using explicit cuisines/favorites,
recent repetition, confirmed visit feedback, and preference for familiar/new
places. A small cuisine signal is inferred from confirmed feedback. The group
score is 65% mean fit and 35% lowest fit. These initial heuristic weights can
be tuned later; the scores are not probabilities or learned predictions.

History uses up to 30 recent memberships per consenting account within 90 days.
Previous closed rooms supply selections; private feedback confirms whether the
person visited and enjoyed the winner. A selection alone is never a like or
confirmed visit. At least two distinct consenting current accounts appearing
in a previous room provide a shared-group repetition signal. Duplicate seats
for one account do not receive additional preference weight. Current votes
are never recommendation inputs.

Gemini uses generateContent with structured JSON output. It receives all eligible,
unseen candidates, with restaurant IDs/names, cuisine, known price, aggregate fit
scores, factual reasons, warnings, and aggregate cuisine favorite/avoid counts.
It chooses one to three restaurant IDs in its own preferred order and selects
reason indexes for grounded explanations. It is instructed to prioritize favored
cuisines and return fewer picks rather than pad a single favored cuisine with
avoided cuisines. Avoidances remain preferences rather than hard exclusions.
The server validates IDs, duplicates, and reason indexes, preserves restaurant
facts and warnings, and falls back to the top three heuristic picks on failure.
Eligibility stays in application code. No member identities, votes, or raw
personal histories are sent. The UI identifies Gemini picks or fallback picks.

After voting closes, **Did you eat at the winning restaurant?** records private
visit and enjoyment feedback. Choosing **Didn't go** clears the enjoyment
rating. Feedback can be corrected later by reopening the room.

## Privacy and verification

All room reads/writes enter through `src/lib/room.functions.ts` and verify the
hashed room pass. Only the host can claim AI preparation. Remembering defaults
or enabling history additionally verifies the signed-in account owns the seat.
Other members see only recommendations and aggregate participation counts.
The tables and generation function grant no access to browser roles. Deleting
an account removes its saved defaults, per-seat preferences, and visit feedback.

Run:

```text
node --test tests/dining.test.mjs tests/room-flow.test.mjs tests/restaurant-discovery.test.mjs tests/settings.test.mjs
npx tsc --noEmit
npm run build:render
```

For an isolated PostgreSQL migration test, install `@electric-sql/pglite`
temporarily and set `PGLITE_MODULE` to its `dist/index.js` path, then run
`node --test tests/dining-migration.test.mjs`. It never uses the live database.

After migration/deployment, create a room with two members, save conflicting
cuisine preferences, confirm suggestions update, and try a guest and a linked
account. Open voting and confirm preference changes are locked. Close voting,
save feedback, and use history in a subsequent room. With a Gemini key, check
that selections prepare once per changed input and fallback rankings remain
usable when the key or upstream service fails.

References: [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output),
[Gemini pricing and free tiers](https://ai.google.dev/gemini-api/docs/pricing),
[Gemini billing](https://ai.google.dev/gemini-api/docs/billing).
