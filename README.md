# Group Grub Picker

Build a group voting app called "GROUP GRUB v1" to help groups decide where to eat based on votes, price range, distance, and group preferences.

Implement the following core flow and features:
1. Invite & Lobby: Unique 6-character room code and shareable link with a copy button. Users can join as host or guest with a nickname/avatar.
2. Leader Settings: Host controls to set a search center point, distance radius slider, price range ($–$$$$), dietary/allergy filters, lobby visibility (public/private), and max acceptable wait time.
3. Restaurant Pool & User Nominations: Curated list of mock restaurants matching active filters. Each user can also search/nominate one custom restaurant to the group pool.
4. Ranked Voting: Anonymous or public voting toggle. Each voter assigns two ranked votes: 'Want' (first choice, 2 pts) and 'Could' (second choice, 1 pt). A place can only be voted for once per user.
5. Interactive Map View: Map showing the center point and restaurant pins, displaying price, distance, cuisine, and wait time details.
6. Member Readiness: Status indicator showing who has voted, with a host control to close voting and reveal the winner.
7. Tie-Breaker: Automated coin flip or wheel spin if there's a tie for first place.
8. Winner Screen: Celebration reveal showing the winning restaurant, score breakdown, directions link (Google Maps), and a reservation link (when applicable, excluding fast food).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://groupgrubpicker.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/05156908-56af-4363-a678-5c7889918613).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
