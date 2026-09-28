<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Room data (rooms, members, nominations, votes) is server-only: no browser table access; every read/write goes through `src/lib/room.functions.ts`, which checks the member's hashed room pass. Why: guests join without accounts and anonymous votes must stay hidden.
- Clients poll room state every 2.5s instead of realtime. Why: realtime would need public read access to the vote tables.
- Mock restaurants are placed relative to the host's search center (`src/lib/restaurants.ts`). Why: the curated pool works in any city.
