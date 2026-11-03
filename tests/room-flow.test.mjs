import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { beforeEach, after, test } from "node:test";
import ts from "typescript";

// Exercise the real handlers and room-pass checks against isolated in-memory storage.
// Only the RPC transport, account middleware, and Supabase transport are replaced.
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function sourceModule(path, imports = {}) {
  let js = ts.transpileModule(await readFile(new URL(`../src/${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [name, replacement] of Object.entries(imports)) {
    js = js.replaceAll(JSON.stringify(name), JSON.stringify(replacement));
  }
  return url(js);
}
const zod = import.meta.resolve("zod");
const restaurants = await sourceModule("lib/restaurants.ts");
const settings = await sourceModule("lib/settings.ts", { zod, "./restaurants": restaurants });
const avatars = await sourceModule("lib/profile-avatar.ts", { zod });
const access = await sourceModule("lib/room-access.ts", { zod, "./profile-avatar": avatars });
const transport = url(`export function createServerFn() {
  let validate;
  return { middleware() { return this; }, inputValidator(fn) { validate = fn; return this; },
    handler(fn) { return async ({ data, context = { accountUserId: null } } = {}) => fn({ data: validate ? validate(data) : data, context }); }
  };
}`);
const accountMiddleware = url(
  "export const optionalAccountAuth = {}; export const requireSupabaseAuth = {};",
);
const database = url(
  "export const supabaseAdmin = { from: table => globalThis.__grubRoomFlowTest.from(table), rpc: async (name,args) => { globalThis.__grubRoomFlowTest.activity.push({name,args}); return {error:null}; } };",
);
const server = await sourceModule("lib/room.server.ts", {
  "@/integrations/supabase/client.server": database,
  "./room-access": access,
});
const handlersUrl = await sourceModule("lib/room.functions.ts", {
  "./settings": settings,
  "./creation-clicks": await sourceModule("lib/creation-clicks.ts", { zod }),
  "./restaurants": restaurants,
  "./room-access": access,
  "./room.server": server,
  "./account-auth": accountMiddleware,
  "@/integrations/supabase/auth-middleware": accountMiddleware,
  "@tanstack/react-start": transport,
  zod,
});
const {
  kickMember,
  createRoom,
  joinRoom,
  getRoomState,
  updateSettings,
  recordSelectionActivity,
  recordGroupCreationClicks,
} = await import(handlersUrl);
const { hashToken, newCode } = await import(server);
const { RoomCodeSchema, roomJoinUrl } = await import(access);
let store;

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.operation = "select";
  }
  select() {
    return this;
  }
  insert(value) {
    this.operation = "insert";
    this.value = value;
    return this;
  }
  update(value) {
    this.operation = "update";
    this.value = value;
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  eq(key, value) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  is(key, value) {
    return this.eq(key, value);
  }
  in(key, values) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  order() {
    return this;
  }
  async single() {
    const result = await this.run();
    return { ...result, data: result.data?.[0] ?? null };
  }
  maybeSingle() {
    return this.single();
  }
  then(resolve, reject) {
    return this.run().then(resolve, reject);
  }
  async run() {
    const rows = store.tables[this.table];
    if (this.operation === "insert") {
      store.inserts[this.table] = (store.inserts[this.table] ?? 0) + 1;
      const error = store.errors[this.table]?.shift();
      if (error) return { data: null, error };
      if (this.table === "rooms" && rows.some((row) => row.code === this.value.code))
        return { data: null, error: { code: "23505" } };
      const row = structuredClone({
        id: randomUUID(),
        status: "lobby",
        result: null,
        ...this.value,
      });
      rows.push(row);
      return { data: [row], error: null };
    }
    const matches = (row) => this.filters.every((filter) => filter(row));
    if (this.operation === "update") {
      if (store.updateError) return { data: null, error: { message: "Write failed" } };
      if (store.startDuringSave)
        rows.forEach((row) => {
          row.status = "voting";
        });
      const matched = rows.filter(matches);
      matched.forEach((row) => Object.assign(row, structuredClone(this.value)));
      return { data: matched, error: null };
    }
    if (this.operation === "delete") store.tables[this.table] = rows.filter((row) => !matches(row));
    return { data: rows.filter(matches), error: null };
  }
}
beforeEach(() => {
  store = {
    tables: {
      rooms: [],
      members: [],
      nominations: [],
      votes: [],
      preset_filters: [],
      profiles: [],
      group_creation_usage: [],
    },
    inserts: {},
    errors: {},
    activity: [],
    from: (table) => new Query(table),
  };
  globalThis.__grubRoomFlowTest = store;
});
after(() => {
  delete globalThis.__grubRoomFlowTest;
});
const profile = { nickname: "  Aaron  ", avatar: "🍕" };

test("guest host creates a six-character room and friends join by code or link", async () => {
  const host = await createRoom({ data: profile });
  assert.match(host.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(store.tables.members[0].nickname, "Aaron");
  assert.equal(store.tables.members[0].token_hash, hashToken(host.token));
  assert.notEqual(store.tables.members[0].token_hash, host.token);
  const invite = roomJoinUrl("https://groupgrub.example", host.code);
  assert.equal(invite, `https://groupgrub.example/room/${host.code}`);
  assert.equal(invite.includes(host.token), false);
  const friend = await joinRoom({
    data: { nickname: "Taylor", avatar: "🌮", code: ` ${host.code.toLowerCase()} ` },
  });
  const linkFriend = await joinRoom({
    data: { nickname: "Sam", avatar: "🍣", code: new URL(invite).pathname.split("/").at(-1) },
  });
  const state = await getRoomState({ data: friend });
  assert.deepEqual(
    state.members.map((m) => [m.nickname, m.isHost]),
    [
      ["Aaron", true],
      ["Taylor", false],
      ["Sam", false],
    ],
  );
  assert.equal(state.me.isHost, false);
  assert.equal((await getRoomState({ data: host })).me.isHost, true);
  assert.notEqual(friend.token, linkFriend.token);
  assert.equal(JSON.stringify(state).includes(host.token), false);
  assert.equal(JSON.stringify(state).includes("token_hash"), false);
});
test("code collisions retry without creating duplicate rooms", async () => {
  store.errors.rooms = [{ code: "23505" }];
  await createRoom({ data: profile });
  assert.equal(store.inserts.rooms, 2);
  assert.equal(store.tables.rooms.length, 1);
  assert.equal(store.tables.members.length, 1);
});
test("persistent collisions stop after five attempts", async () => {
  store.errors.rooms = Array.from({ length: 5 }, () => ({ code: "23505" }));
  await assert.rejects(createRoom({ data: profile }), /Could not create room/);
  assert.equal(store.inserts.rooms, 5);
  assert.equal(store.tables.members.length, 0);
});
test("other database failures are not retried as code collisions", async () => {
  store.errors.rooms = [{ code: "42501" }];
  await assert.rejects(createRoom({ data: profile }), /Could not create your group/);
  assert.equal(store.inserts.rooms, 1);
});
test("a failed host insertion removes the unusable room", async () => {
  store.errors.members = [{ message: "Host insert failed" }];
  await assert.rejects(createRoom({ data: profile }), /Host insert failed/);
  assert.equal(store.tables.rooms.length, 0);
  assert.equal(store.tables.members.length, 0);
});
test("invalid nicknames, malformed codes, missing rooms, and closed rooms fail clearly", async () => {
  await assert.rejects(createRoom({ data: { ...profile, nickname: "   " } }));
  await assert.rejects(joinRoom({ data: { ...profile, code: "bad" } }));
  await assert.rejects(joinRoom({ data: { ...profile, code: "ABC234" } }), /Room not found/);
  const host = await createRoom({ data: profile });
  store.tables.rooms[0].status = "closed";
  await assert.rejects(joinRoom({ data: { ...profile, code: host.code } }), /already over/);
  assert.equal(store.tables.members.length, 1);
});
test("room reads require a private pass and anonymous votes stay hidden", async () => {
  const host = await createRoom({ data: profile });
  const friend = await joinRoom({ data: { ...profile, nickname: "Friend", code: host.code } });
  store.tables.votes.push({
    member_id: host.memberId,
    room_id: store.tables.rooms[0].id,
    want_id: "m1",
    could_id: "m2",
  });
  assert.equal((await getRoomState({ data: friend })).publicVotes, null);
  await assert.rejects(getRoomState({ data: { ...friend, token: host.token } }), /Not a member/);
});
test("signed-in hosting applies dining defaults and links the host", async () => {
  const userId = randomUUID();
  store.tables.preset_filters.push({
    user_id: userId,
    settings: { maxWait: 20, radiusKm: 16.09344, center: { lat: 0, lng: 0, label: "Old preset" } },
  });
  const host = await createRoom({ data: profile, context: { accountUserId: userId } });
  assert.equal(store.tables.members[0].user_id, userId);
  const state = await getRoomState({ data: host });
  assert.equal(state.settings.maxWait, 20);
  assert.notEqual(state.settings.center.label, "Old preset");
});
test("room codes and join URLs reject malformed input", () => {
  for (let i = 0; i < 100; i++) assert.ok(RoomCodeSchema.safeParse(newCode()).success);
  assert.equal(RoomCodeSchema.parse(" abc234 "), "ABC234");
  assert.throws(() => roomJoinUrl("https://groupgrub.example", "../account"));
});

test("only the host can report creation clicks, and accepted counts cannot be overwritten", async () => {
  const host = await createRoom({ data: profile });
  const guest = await joinRoom({ data: { ...profile, code: host.code } });
  store.tables.group_creation_usage.push({
    room_id: store.tables.rooms[0].id,
    host_member_id: host.memberId,
    click_count: null,
  });
  const measurement = { journeyId: randomUUID(), clicks: 3 };
  await assert.rejects(
    recordGroupCreationClicks({ data: { ...guest, ...measurement } }),
    /Only the host/,
  );
  await assert.rejects(
    recordGroupCreationClicks({ data: { ...host, ...measurement, clicks: -1 } }),
  );
  await recordGroupCreationClicks({ data: { ...host, ...measurement } });
  await recordGroupCreationClicks({ data: { ...host, ...measurement, clicks: 1 } });
  assert.equal(store.tables.group_creation_usage[0].click_count, 3);
});

test("stage activity verifies room passes and cannot claim successful selection", async () => {
  const host = await createRoom({ data: profile });
  await assert.rejects(
    recordSelectionActivity({ data: { ...host, token: "invalid-room-pass", event: "enter" } }),
    /Not a member/,
  );
  await assert.rejects(recordSelectionActivity({ data: { ...host, event: "selected" } }));
  assert.equal(store.activity.length, 0);
  await recordSelectionActivity({ data: { ...host, event: "enter" } });
  assert.deepEqual(store.activity[0], {
    name: "record_selection_activity",
    args: { p_room_id: store.tables.rooms[0].id, p_member_id: host.memberId, p_event: "enter" },
  });
});

test("filter saves report database errors and do not change settings after voting starts", async () => {
  const host = await createRoom({ data: profile });
  const original = store.tables.rooms[0].settings;
  const changed = { ...original, priceMax: 2 };
  store.updateError = true;
  await assert.rejects(updateSettings({ data: { ...host, settings: changed } }), /Could not save/);
  assert.deepEqual(store.tables.rooms[0].settings, original);
  store.updateError = false;
  store.startDuringSave = true;
  await assert.rejects(updateSettings({ data: { ...host, settings: changed } }), /locked/);
  assert.deepEqual(store.tables.rooms[0].settings, original);
});

test("linked room participants show their latest account photo without exposing account IDs", async () => {
  const userId = randomUUID();
  const host = await createRoom({ data: profile, context: { accountUserId: userId } });
  const photo = `https://example.supabase.co/storage/v1/object/public/profile-photos/${userId}/${randomUUID()}.jpg`;
  store.tables.profiles.push({ id: userId, avatar: photo });
  const state = await getRoomState({ data: host });
  assert.equal(state.members[0].avatar, photo);
  assert.equal("user_id" in state.members[0], false);
});

test("only the host can remove another participant from their own active room", async () => {
  const host = await createRoom({ data: profile });
  const guest = await joinRoom({ data: { ...profile, code: host.code } });
  const otherHost = await createRoom({ data: profile });
  const otherGuest = await joinRoom({ data: { ...profile, code: otherHost.code } });
  await assert.rejects(
    kickMember({ data: { ...guest, targetMemberId: host.memberId } }),
    /Only the host/,
  );
  await assert.rejects(
    kickMember({ data: { ...host, token: "invalid-token", targetMemberId: guest.memberId } }),
    /Not a member/,
  );
  await assert.rejects(
    kickMember({ data: { ...host, targetMemberId: host.memberId } }),
    /cannot remove themselves/,
  );
  await kickMember({ data: { ...host, targetMemberId: otherGuest.memberId } });
  assert.ok(store.tables.members.some((m) => m.id === otherGuest.memberId));
  await kickMember({ data: { ...host, targetMemberId: guest.memberId } });
  await assert.rejects(getRoomState({ data: guest }), /Not a member/);
  assert.equal((await getRoomState({ data: host })).members.length, 1);
  await kickMember({ data: { ...host, targetMemberId: guest.memberId } });
  store.tables.rooms.find((r) => r.code === host.code).status = "closed";
  await assert.rejects(
    kickMember({ data: { ...host, targetMemberId: guest.memberId } }),
    /already finished/,
  );
});
