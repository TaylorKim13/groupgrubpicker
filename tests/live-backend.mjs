// Explicit opt-in: node --env-file=.env tests/live-backend.mjs --run
// Uses real Supabase auth, database and storage. RPC wrappers are replaced so
// actual server handlers can be called without a browser or TanStack server.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

if (!process.argv.includes("--run"))
  throw new Error("Pass --run to create disposable live fixtures");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  options,
);
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const anon = createClient(process.env.SUPABASE_URL, publicKey, options);
globalThis.__grubLiveAdmin = admin;
const url = (s) => `data:text/javascript;base64,${Buffer.from(s).toString("base64")}`;
async function source(name, replacements = {}) {
  let js = ts.transpileModule(
    await readFile(new URL(`../src/lib/${name}`, import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  for (const [name, replacement] of Object.entries(replacements))
    js = js.replaceAll(JSON.stringify(name), JSON.stringify(replacement));
  return url(js);
}
const zod = import.meta.resolve("zod");
const restaurants = await source("restaurants.ts");
const settings = await source("settings.ts", { zod, "./restaurants": restaurants });
const avatars = await source("profile-avatar.ts", { zod });
const access = await source("room-access.ts", { zod, "./profile-avatar": avatars });
const transport = url(
  `export function createServerFn(){let validate;return{middleware(){return this},inputValidator(fn){validate=fn;return this},handler(fn){return async({data,context={accountUserId:null}}={})=>fn({data:validate?validate(data):data,context})}}}`,
);
const middleware = url("export const optionalAccountAuth={};export const requireSupabaseAuth={};");
const database = url("export const supabaseAdmin=globalThis.__grubLiveAdmin;");
const server = await source("room.server.ts", {
  "./room-access": access,
  "@/integrations/supabase/client.server": database,
});
const shared = {
  zod,
  "@tanstack/react-start": transport,
  "@/integrations/supabase/auth-middleware": middleware,
  "@/integrations/supabase/client.server": database,
  "./room.server": server,
  "./settings": settings,
  "./profile-avatar": avatars,
};
const room = await import(
  await source("room.functions.ts", {
    ...shared,
    "./restaurants": restaurants,
    "./room-access": access,
    "./account-auth": middleware,
    "./creation-clicks": await source("creation-clicks.ts", { zod }),
  })
);
const account = await import(await source("account.functions.ts", shared));
const social = await import(await source("social.functions.ts", shared));
const { DEFAULT_SETTINGS } = await import(restaurants);
const { getHostingPreferences } = await import(settings);
const users = [];
let roomId;
function checked(result) {
  if (result.error) throw new Error(`${result.error.code ?? "API"}: ${result.error.message}`);
  return result.data;
}
async function person() {
  const email = `grub-test-${randomUUID()}@example.invalid`;
  const password = randomUUID() + "aA1!";
  const { user } = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  users.push(user.id);
  const client = createClient(process.env.SUPABASE_URL, publicKey, options);
  checked(await client.auth.signInWithPassword({ email, password }));
  return { userId: user.id, accountUserId: user.id, supabase: client };
}
try {
  const a = await person(),
    b = await person();
  await account.savePreferences({
    data: { settings: getHostingPreferences({ radiusKm: 10 }), distanceUnit: "km" },
    context: a,
  });
  assert.equal((await account.getAccount({ context: a })).distanceUnit, "km");
  const host = await room.createRoom({
    data: { nickname: "Live test host", avatar: "🍕" },
    context: a,
  });
  roomId = checked(await admin.from("rooms").select("id").eq("code", host.code).single()).id;
  const guest = await room.joinRoom({
    data: { code: host.code, nickname: "Live test guest", avatar: "🍔" },
  });
  await room.linkRoomAccount({ data: guest, context: b });
  let state = await room.getRoomState({ data: host });
  assert.equal(state.members.length, 2);
  assert.equal(state.settings.radiusKm, 10);
  await assert.rejects(
    room.getRoomState({ data: { ...host, token: "incorrect-private-pass" } }),
    /Not a member/,
  );
  await assert.rejects(room.startVoting({ data: guest }), /Only the host/);
  console.log(
    "PASS live: authenticated preferences, host creation, guest joining, linking, private room passes",
  );

  const friendCode = (await social.getSocial({ context: b })).friendCode;
  await social.sendFriendRequest({ data: { friendCode }, context: a });
  const incoming = (await social.getSocial({ context: b })).incoming.find((f) => f.id === a.userId);
  assert.ok(incoming);
  await social.respondFriendRequest({
    data: { friendshipId: incoming.friendshipId, accept: true },
    context: b,
  });
  assert.equal(
    (await social.inviteFriendsToTable({ data: { ...host, userIds: [b.userId] }, context: a }))
      .sent,
    1,
  );
  assert.ok(
    (await social.getSocial({ context: b })).tableInvites.some((i) => i.code === host.code),
  );
  const crew = await social.createCrew({ data: { name: "Disposable live test" }, context: a });
  await social.inviteToCrew({ data: { crewId: crew.id, userId: b.userId }, context: a });
  await social.respondCrewInvite({ data: { crewId: crew.id, accept: true }, context: b });
  assert.equal(
    (await social.getSocial({ context: b })).crews.find((c) => c.id === crew.id).myStatus,
    "member",
  );
  console.log(
    "PASS live: friend request/acceptance, table invitation, crew creation/invitation/acceptance",
  );

  // Minimal JPEG fixture tests storage transport and cleanup; browser encoding is covered separately.
  const photo = Buffer.from([255, 216, 255, 224, 0, 0, 255, 217]).toString("base64");
  const saved = await account.saveAccount({
    data: { display_name: "Live test host", avatar: "🍕", photo },
    context: a,
  });
  assert.equal((await fetch(saved.avatar)).status, 200);
  assert.equal(
    (await room.getRoomState({ data: guest })).members.find((m) => m.id === host.memberId).avatar,
    saved.avatar,
  );
  await account.saveAccount({ data: { display_name: "Live test host", avatar: "🍕" }, context: a });
  assert.equal(checked(await admin.storage.from("profile-photos").list(a.userId)).length, 0);
  console.log(
    "PASS live: profile save, photo upload/public retrieval, linked room photo, photo removal",
  );

  await room.updateSettings({
    data: { ...host, settings: { ...state.settings, priceMax: 3, anonymous: true } },
  });
  await room.recordGroupCreationClicks({ data: { ...host, clicks: 2, journeyId: randomUUID() } });
  const nomination = {
    id: `test-${randomUUID()}`,
    name: "Disposable restaurant",
    cuisine: "Test",
    price: 2,
    wait: 10,
    diets: [],
    fastFood: false,
    ...state.settings.center,
  };
  await room.nominate({ data: { ...host, restaurant: nomination } });
  assert.equal((await room.getRoomState({ data: host })).myNomination.id, nomination.id);
  await room.startVoting({ data: host });
  await assert.rejects(
    room.updateSettings({ data: { ...host, settings: state.settings } }),
    /locked/,
  );
  state = await room.getRoomState({ data: host });
  assert.ok(state.pool.length >= 2);
  const vote = { want: nomination.id, could: state.pool.find((r) => r.id !== nomination.id).id };
  for (const member of [host, guest]) {
    await room.recordSelectionActivity({ data: { ...member, event: "enter" } });
    await room.castVote({ data: { ...member, ...vote } });
  }
  assert.equal((await room.getRoomState({ data: guest })).publicVotes, null);
  await room.closeVoting({ data: host });
  state = await room.getRoomState({ data: host });
  assert.equal(state.status, "closed");
  assert.equal(state.result.winner.id, nomination.id);
  assert.equal(state.result.scores[0].points, 4);
  assert.ok(
    (await room.getGroupHistory({ context: a })).some(
      (r) => r.code === host.code && r.winner === nomination.name,
    ),
  );
  const usage = checked(
    await admin.from("room_filter_usage").select("*").eq("room_id", roomId).single(),
  );
  assert.ok(
    usage.price_filter_applied_at &&
      usage.location_filter_applied_at &&
      usage.restaurant_selected_at,
  );
  assert.equal(
    checked(
      await admin.from("group_creation_usage").select("click_count").eq("room_id", roomId).single(),
    ).click_count,
    2,
  );
  assert.equal(
    checked(
      await admin.from("room_selection_usage").select("selected_at").eq("room_id", roomId),
    ).filter((r) => r.selected_at).length,
    2,
  );
  for (const table of [
    "filter_usage_metrics",
    "selection_abandonment_metrics",
    "group_creation_click_metrics",
  ]) {
    checked(await admin.from(table).select("*"));
    for (const client of [anon, a.supabase])
      assert.ok((await client.from(table).select("*")).error, `${table} must be private`);
  }
  for (const table of ["rooms", "members", "nominations", "votes"]) {
    const result = await anon
      .from(table)
      .select("*")
      .eq(table === "rooms" ? "id" : "room_id", roomId);
    assert.ok(result.error || result.data.length === 0, `${table} must be private`);
  }
  console.log(
    "PASS live: nomination, filtering, voting lock, anonymous votes, scoring, winner, history, all analytics triggers/report privacy",
  );

  await account.deleteAccount({ data: { confirmation: "DELETE" }, context: a });
  users.splice(users.indexOf(a.userId), 1);
  await assert.rejects(room.getRoomState({ data: host }), /Not a member/);
  const after = await room.getRoomState({ data: guest });
  assert.equal(after.members.find((m) => m.id === host.memberId).nickname, "Deleted member");
  assert.equal(after.result.winner.nominatedBy, "Deleted member");
  assert.equal(after.result.scores[0].points, 4);
  assert.equal((await social.getSocial({ context: b })).friends.length, 0);
  console.log(
    "PASS live: account deletion, pass invalidation, anonymized attribution, preserved scores, social cascades",
  );
} catch (error) {
  // Avoid printing data-URL stack frames, tokens, or account credentials.
  console.error("FAIL live:", error.message);
  process.exitCode = 1;
} finally {
  // Delete only fixtures created by this run, including retained analytics.
  if (roomId) {
    for (const table of [
      "room_selection_usage",
      "room_filter_usage",
      "group_creation_usage",
      "rooms",
    ]) {
      const result = await admin
        .from(table)
        .delete()
        .eq(table === "rooms" ? "id" : "room_id", roomId);
      if (result.error) {
        console.error("Cleanup failed:", table, result.error.message);
        process.exitCode = 1;
      }
    }
  }
  for (const id of users) {
    const files = await admin.storage.from("profile-photos").list(id);
    if (files.data?.length)
      checked(
        await admin.storage.from("profile-photos").remove(files.data.map((f) => `${id}/${f.name}`)),
      );
    checked(await admin.auth.admin.deleteUser(id));
  }
  delete globalThis.__grubLiveAdmin;
  console.log("Disposable live fixtures cleaned up");
}
