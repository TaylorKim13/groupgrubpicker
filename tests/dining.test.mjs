import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function compile(path, replacements = {}) {
  let js = ts.transpileModule(
    await readFile(new URL(`../src/lib/${path}`, import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  for (const [name, replacement] of Object.entries(replacements))
    js = js.replaceAll(JSON.stringify(name), JSON.stringify(replacement));
  return moduleUrl(js);
}
const restaurants = await compile("restaurants.ts");
const dining = await compile("dining.ts", {
  zod: import.meta.resolve("zod"),
  "./restaurants": restaurants,
});
const { DiningPreferencesSchema, defaultDiningPreferences, rankDiningSuggestions } = await import(
  dining
);
const { DEFAULT_SETTINGS } = await import(restaurants);
const { selectDiningSuggestions } = await import(
  await compile("dining-ai.server.ts", { zod: import.meta.resolve("zod") })
);
const settings = { ...DEFAULT_SETTINGS, center: { lat: 0, lng: 0, label: "Test" }, radiusKm: 10 };
const place = (id, patch = {}) => ({
  id,
  name: id,
  cuisine: "Mexican",
  price: 2,
  wait: 15,
  diets: [],
  fastFood: false,
  lat: 0.001,
  lng: 0,
  ...patch,
});
const member = (patch = {}, history = []) => ({
  preferences: DiningPreferencesSchema.parse({ participating: true, ...patch }),
  history,
});
const now = Date.parse("2026-11-03T12:00:00Z");
const history = (patch = {}) => ({
  restaurantId: "taco",
  cuisine: "Mexican",
  selectedAt: "2026-11-02T12:00:00Z",
  visited: null,
  enjoyed: null,
  shared: false,
  ...patch,
});

test("preferences validate conflicts, budgets, distances, and bounded inputs", () => {
  assert.equal(defaultDiningPreferences().participating, false);
  assert.equal(defaultDiningPreferences().useHistory, false);
  for (const invalid of [
    { favoriteCuisines: ["Mexican"], dislikedCuisines: ["Mexican"] },
    { maxPrice: 0 },
    { maxDistanceKm: 0 },
    { diets: ["made up"] },
    { favoriteRestaurantIds: Array(21).fill("id") },
  ])
    assert.equal(DiningPreferencesSchema.safeParse(invalid).success, false);
});

test("all group price and distance requirements apply, including to nominations and unknown prices", () => {
  const ranked = rankDiningSuggestions(
    [
      place("valid"),
      place("expensive", { price: 4 }),
      place("far", { lat: 0.1 }),
      place("unknown", { priceUnknown: true }),
      place("nomination", { custom: true, price: 3 }),
    ],
    settings,
    [member({ maxPrice: 2, maxDistanceKm: 2 })],
    now,
  );
  assert.deepEqual(
    ranked.suggestions.map((s) => s.restaurant.id),
    ["valid"],
  );
});

test("dietary unknowns cannot satisfy a requirement and no matches explain the conflict", () => {
  const ranked = rankDiningSuggestions(
    [
      place("google", { google: true, diets: ["vegan"] }),
      place("custom", { custom: true, diets: ["vegan"] }),
    ],
    settings,
    [member({ diets: ["vegan"] })],
    now,
  );
  assert.equal(ranked.suggestions.length, 0);
  assert.match(ranked.message, /dietary information/);
});

test("fairness rewards a compromise over a favorite that another member strongly dislikes", () => {
  const ranked = rankDiningSuggestions(
    [place("taco"), place("compromise", { cuisine: "Italian" })],
    settings,
    [member({ favoriteCuisines: ["Mexican"] }), member({ dislikedCuisines: ["Mexican"] })],
    now,
  );
  assert.equal(ranked.suggestions[0].restaurant.id, "compromise");
});

test("history is opt-in; selections are not likes, and confirmed feedback changes future ranking", () => {
  const pool = [place("taco"), place("other")];
  const score = (m) =>
    rankDiningSuggestions(pool, settings, [m], now).suggestions.find(
      (s) => s.restaurant.id === "taco",
    ).score;
  const base = score(member());
  assert.equal(score(member({}, [history({ visited: true, enjoyed: false })])), base);
  assert.ok(
    score(member({ useHistory: true }, [history()])) < base,
    "recent selection only penalizes repetition",
  );
  assert.ok(
    score(
      member({ useHistory: true, novelty: "familiar" }, [
        history({ visited: true, enjoyed: true }),
      ]),
    ) > base,
  );
  assert.ok(
    score(member({ useHistory: true }, [history({ visited: true, enjoyed: false })])) <
      score(member({ useHistory: true }, [history()])),
  );
  assert.equal(
    rankDiningSuggestions(pool, settings, [member({ participating: false }, [history()])])
      .participants,
    0,
  );
});

test("latest confirmed feedback overrides older feedback and ties are stable", () => {
  const pool = [place("taco"), place("other")];
  const older = history({ selectedAt: "2026-10-01T12:00:00Z", visited: true, enjoyed: true });
  const latest = history({ visited: true, enjoyed: false });
  const a = rankDiningSuggestions(
    pool,
    settings,
    [member({ useHistory: true }, [older, latest])],
    now,
  );
  const b = rankDiningSuggestions(
    [...pool].reverse(),
    settings,
    [member({ useHistory: true }, [latest, older])],
    now,
  );
  assert.deepEqual(a, b);
  assert.equal(a.suggestions[0].restaurant.id, "other");
});

test("confirmed feedback supplies a small cuisine signal for restaurants not yet visited", () => {
  const past = history({
    restaurantId: "different-taco-place",
    selectedAt: "2026-10-01T12:00:00Z",
    visited: true,
    enjoyed: true,
  });
  const ranked = rankDiningSuggestions(
    [place("new-mexican"), place("new-italian", { cuisine: "Italian" })],
    settings,
    [member({ useHistory: true }, [past])],
    now,
  );
  assert.equal(ranked.suggestions[0].restaurant.id, "new-mexican");
  assert.ok(ranked.suggestions[0].score > ranked.suggestions[1].score);
});

test("Gemini uses structured output, sends only approved facts, and preserves restaurant facts and warnings", async () => {
  const suggestions = rankDiningSuggestions(
    [place("taco", { google: true })],
    settings,
    [member()],
    now,
  ).suggestions;
  let calls = 0;
  const explained = await selectDiningSuggestions(
    suggestions,
    { key: "private-key", model: "gemini-3.5-flash-lite" },
    async (url, options) => {
      calls++;
      assert.equal(
        url,
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      );
      assert.equal(options.headers["x-goog-api-key"], "private-key");
      assert.equal(options.redirect, "error");
      assert.ok(!url.includes("private-key"));
      const body = JSON.parse(options.body);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.equal(body.generationConfig.responseJsonSchema.additionalProperties, false);
      assert.deepEqual(
        Object.keys(JSON.parse(body.contents[0].parts[0].text).candidates[0]).sort(),
        ["cuisine", "id", "name", "price", "reasons", "score", "warnings"],
      );
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  { thought: true, text: "private reasoning, not output" },
                  {
                    text: JSON.stringify({ explanations: [{ id: "taco", reasonIndexes: [1] }] }),
                  },
                ],
              },
            },
          ],
        }),
      };
    },
  );
  assert.equal(calls, 1);
  assert.equal(explained.method, "gemini");
  assert.equal(explained.suggestions[0].aiExplanation, suggestions[0].reasons[1]);
  assert.deepEqual(explained.suggestions[0].warnings, suggestions[0].warnings);
  assert.equal(explained.suggestions[0].score, suggestions[0].score);
});

test("missing keys, refusals, malformed responses, made-up IDs, bad indexes, and failures fall back safely", async () => {
  const suggestions = rankDiningSuggestions([place("taco")], settings, [], now).suggestions;
  const key = { key: "private", model: "gemini-3.5-flash-lite" };
  const wrap = (text) => async () => ({
    ok: true,
    json: async () => ({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
    }),
  });
  for (const request of [
    async () => {
      throw new Error("network");
    },
    async () => ({ ok: false, status: 429 }),
    async () => ({
      ok: true,
      json: async () => ({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
    }),
    async () => ({ ok: true, json: async () => ({ promptFeedback: { blockReason: "SAFETY" } }) }),
    async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: "SAFETY" }] }) }),
    wrap("not-json"),
    ...[
      [{ id: "invented", reasonIndexes: [0] }],
      [{ id: "taco", reasonIndexes: [999] }],
      [{ id: "taco", reasonIndexes: [0, 0] }],
      [],
      [{ id: "taco", reasonIndexes: [0], inventedClaim: "allergy safe" }],
    ].map((explanations) => wrap(JSON.stringify({ explanations }))),
  ]) {
    const result = await selectDiningSuggestions(suggestions, key, request);
    assert.equal(result.method, "rules");
    assert.deepEqual(result.suggestions, suggestions);
  }
  const missing = await selectDiningSuggestions(
    suggestions,
    { key: undefined, model: "gemini-3.5-flash-lite" },
    () => {
      throw new Error("must not call");
    },
  );
  assert.equal(missing.method, "rules");
});

// Exercise real server logic using a minimal Supabase transport, not browser table access.
test("Gemini selects beyond the rule-based top three and can return only the favored cuisine", async () => {
  const candidates = rankDiningSuggestions(
    [place("a"), place("b"), place("c"), place("korean", { cuisine: "Korean" })],
    settings,
    [],
    now,
    [],
    10,
  ).suggestions;
  assert.equal(candidates.length, 4);
  const preferences = [{ cuisine: "Korean", favorites: 1, avoids: 0 }];
  const picked = await selectDiningSuggestions(
    candidates,
    { key: "test", model: "test" },
    async (_, options) => {
      const payload = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
      assert.equal(payload.candidates.length, 4);
      assert.deepEqual(payload.cuisinePreferences, preferences);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({ explanations: [{ id: "korean", reasonIndexes: [0] }] }),
                  },
                ],
              },
            },
          ],
        }),
      };
    },
    preferences,
  );
  assert.equal(picked.method, "gemini");
  assert.deepEqual(
    picked.suggestions.map((s) => s.restaurant.id),
    ["korean"],
  );
  const fallback = await selectDiningSuggestions(candidates, { key: undefined, model: "test" });
  assert.equal(fallback.suggestions.length, 3);
});

test("Gemini output order determines the picks and duplicate IDs are rejected", async () => {
  const candidates = rankDiningSuggestions(
    [place("a"), place("b"), place("c"), place("d")],
    settings,
    [],
    now,
    [],
    10,
  ).suggestions;
  const response = (ids) => async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify({
                  explanations: ids.map((id) => ({ id, reasonIndexes: [0] })),
                }),
              },
            ],
          },
        },
      ],
    }),
  });
  const config = { key: "test", model: "test" };
  const selected = await selectDiningSuggestions(candidates, config, response(["d", "b", "a"]));
  assert.deepEqual(
    selected.suggestions.map((s) => s.restaurant.id),
    ["d", "b", "a"],
  );
  const invalid = await selectDiningSuggestions(candidates, config, response(["d", "d"]));
  assert.equal(invalid.method, "rules");
  assert.deepEqual(invalid.suggestions, candidates.slice(0, 3));
});

let tables, reads, writes, claims;
class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.operation = "select";
    reads.push(table);
  }
  select() {
    return this;
  }
  eq(key, value) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  neq(key, value) {
    this.filters.push((row) => row[key] !== value);
    return this;
  }
  gte() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  in(key, values) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  upsert(value) {
    this.operation = "upsert";
    this.value = value;
    return this;
  }
  update(value) {
    this.operation = "update";
    this.value = value;
    return this;
  }
  async maybeSingle() {
    const r = await this.run();
    return { ...r, data: r.data[0] ?? null };
  }
  then(resolve, reject) {
    return this.run().then(resolve, reject);
  }
  async run() {
    const rows = tables[this.table] ?? [];
    if (this.operation !== "select") {
      writes.push({ table: this.table, value: this.value });
      if (this.operation === "upsert") {
        const key = this.value.member_id ? "member_id" : "user_id";
        const row = rows.find((r) => r[key] === this.value[key]);
        if (row) Object.assign(row, this.value);
        else rows.push({ ...this.value });
        tables[this.table] = rows;
      } else
        rows
          .filter((r) => this.filters.every((f) => f(r)))
          .forEach((r) => Object.assign(r, this.value));
    }
    return { data: rows.filter((r) => this.filters.every((f) => f(r))), error: null };
  }
}
const database = moduleUrl("export const db = () => globalThis.__diningServerTest;");
const server = await import(
  await compile("dining.server.ts", {
    zod: import.meta.resolve("zod"),
    "./room.server": database,
    "./dining": dining,
    "./dining-ai.server": moduleUrl(
      "export const selectDiningSuggestions = async suggestions => ({ suggestions: suggestions.slice(0, 3), method: 'rules' });",
    ),
  })
);
function reset() {
  tables = {
    members: [{ id: "seat", room_id: "room", user_id: "user" }],
    room_dining_preferences: [],
    dining_preferences: [],
    dining_feedback: [],
    room_dining_suggestions: [],
  };
  reads = [];
  writes = [];
  claims = 0;
  globalThis.__diningServerTest = {
    from: (table) => new Query(table),
    rpc: async (name, args) => {
      if (name === "claim_dining_suggestions") {
        claims++;
        let row = tables.room_dining_suggestions.find((r) => r.room_id === args.p_room_id);
        if (!row) {
          row = { room_id: args.p_room_id, refresh_version: 0, generated_version: 0 };
          tables.room_dining_suggestions.push(row);
        }
        row.pending_fingerprint = args.p_fingerprint;
      } else if (name === "complete_dining_suggestions") {
        const row = tables.room_dining_suggestions.find((r) => r.room_id === args.p_room_id);
        if (row.fingerprint && row.generated_at) {
          tables.dining_suggestion_history ??= [];
          tables.dining_suggestion_history.push({
            id: tables.dining_suggestion_history.length + 1,
            room_id: row.room_id,
            context_fingerprint: row.context_fingerprint,
            suggestions: row.suggestions,
            generated_at: row.generated_at,
          });
        }
        Object.assign(row, {
          fingerprint: args.p_fingerprint,
          context_fingerprint: args.p_context_fingerprint,
          generated_version: args.p_version,
          suggestions: args.p_suggestions,
          method: args.p_method,
          generated_at: new Date().toISOString(),
          lease_until: new Date(0).toISOString(),
        });
      } else if (name === "refresh_dining_suggestions") {
        const row = tables.room_dining_suggestions.find((r) => r.room_id === args.p_room_id);
        if (!row || (row.refresh_version ?? 0) !== (row.generated_version ?? 0))
          return { data: false, error: null };
        row.refresh_version = (row.refresh_version ?? 0) + 1;
      }
      return { data: true, error: null };
    },
  };
}
const room = { id: "room", status: "lobby", settings };
const seat = { id: "seat", user_id: "user" };

test("room passes cannot expose saved account defaults, remember preferences, or opt into another user's history", async () => {
  reset();
  tables.dining_preferences.push({
    user_id: "user",
    preferences: member({ favoriteCuisines: ["Thai"] }).preferences,
  });
  const state = await server.getDiningState(room, seat, null, [place("taco")]);
  assert.deepEqual(state.preferences.favoriteCuisines, []);
  assert.equal(reads.includes("dining_preferences"), false);
  await assert.rejects(
    server.saveDiningPreferences(
      room,
      seat,
      "other-user",
      member({ useHistory: true }).preferences,
      false,
    ),
    /Sign in/,
  );
  await assert.rejects(
    server.saveDiningPreferences(room, seat, null, member().preferences, true),
    /Sign in/,
  );
  assert.equal(writes.length, 0);
  const own = await server.getDiningState(room, seat, "user", [place("taco")]);
  assert.deepEqual(own.preferences.favoriteCuisines, ["Thai"]);
  assert.equal(
    own.preferences.participating,
    false,
    "remembered defaults still require sharing for each outing",
  );
});

test("guest preferences work, saves lock after voting, and feedback is limited to a closed room's winner", async () => {
  reset();
  await server.saveDiningPreferences(room, seat, null, member().preferences, false);
  assert.equal(tables.room_dining_preferences.length, 1);
  await assert.rejects(
    server.saveDiningPreferences(
      { ...room, status: "voting" },
      seat,
      null,
      member().preferences,
      false,
    ),
    /locked/,
  );
  await assert.rejects(
    server.saveDiningFeedback(room, seat, { visited: true, enjoyed: true }),
    /Choose/,
  );
  const closed = { ...room, status: "closed", result: { winner: place("winner") } };
  await assert.rejects(
    server.saveDiningFeedback(closed, seat, { visited: false, enjoyed: true }),
    /rate/,
  );
  await server.saveDiningFeedback(closed, seat, { visited: true, enjoyed: false });
  assert.equal(tables.dining_feedback[0].restaurant_id, "winner");
});

test("history queries are consented, outputs hide raw histories and other preferences, and fingerprints respond to changes", async () => {
  reset();
  tables.members.push({ id: "other-seat", room_id: "room", user_id: "other-user" });
  tables.room_dining_preferences.push({
    member_id: "other-seat",
    room_id: "room",
    preferences: member({ useHistory: true }).preferences,
  });
  tables.members.push({
    id: "old",
    room_id: "past",
    user_id: "other-user",
    rooms: {
      status: "closed",
      closed_at: "2026-11-02T12:00:00Z",
      result: { winner: place("taco") },
    },
  });
  tables.dining_feedback.push({
    member_id: "old",
    room_id: "past",
    restaurant_id: "taco",
    visited: true,
    enjoyed: false,
  });
  const first = await server.getDiningState(room, seat, "user", [place("taco"), place("other")]);
  assert.equal(first.ranking.participants, 1);
  assert.equal(first.ranking.suggestions[0].restaurant.id, "other");
  const serialized = JSON.stringify(first);
  assert.equal(serialized.includes("other-user"), false);
  assert.equal(serialized.includes("old"), false);
  assert.equal(reads.includes("votes"), false);
  tables.room_dining_preferences[0].preferences.useHistory = false;
  const second = await server.getDiningState(room, seat, "user", [place("taco"), place("other")]);
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.deepEqual(second.preferences, first.preferences);
});

test("unchanged inputs reuse persisted suggestions without another generation claim", async () => {
  reset();
  const state = await server.getDiningState(room, seat, null, [place("taco")]);
  tables.room_dining_suggestions.push({
    room_id: "room",
    fingerprint: state.fingerprint,
    suggestions: state.ranking.suggestions,
    method: "rules",
  });
  await server.generateDiningSuggestions(room, seat, null, [place("taco")]);
  assert.equal(claims, 0);
  assert.equal((await server.getDiningState(room, seat, null, [place("taco")])).generated, true);
  await server.generateDiningSuggestions(room, seat, null, [place("new")]);
  assert.equal(claims, 1);
});

test("refresh shows unseen eligible places, archives earlier sets, and stops honestly when exhausted", async () => {
  reset();
  const pool = Array.from({ length: 7 }, (_, i) => place(`place-${i}`));
  await server.generateDiningSuggestions(room, seat, null, pool);
  const first = await server.getDiningState(room, seat, null, pool);
  assert.equal(first.ranking.suggestions.length, 3);
  assert.equal(first.remaining, 4);
  await server.refreshDiningSuggestions(room, seat, null, pool);
  await assert.rejects(server.refreshDiningSuggestions(room, seat, null, pool), /finish updating/);
  await server.generateDiningSuggestions(room, seat, null, pool);
  const second = await server.getDiningState(room, seat, null, pool);
  assert.equal(second.ranking.suggestions.length, 3);
  assert.equal(second.history.length, 1);
  assert.deepEqual(second.history[0].suggestions, first.ranking.suggestions);
  assert.ok(
    second.ranking.suggestions.every(
      (s) => !first.ranking.suggestions.some((f) => f.restaurant.id === s.restaurant.id),
    ),
  );
  assert.equal(second.remaining, 1);
  await server.refreshDiningSuggestions(room, seat, null, pool);
  await server.generateDiningSuggestions(room, seat, null, pool);
  const third = await server.getDiningState(room, seat, null, pool);
  assert.equal(third.ranking.suggestions.length, 1);
  assert.equal(third.remaining, 0);
  assert.equal(third.history.length, 2);
  await assert.rejects(server.refreshDiningSuggestions(room, seat, null, pool), /No more matching/);
  const restored = await server.getDiningState(room, seat, null, pool);
  assert.deepEqual(restored.history, third.history, "history survives new requests");
  const changed = await server.getDiningState(
    { ...room, settings: { ...settings, radiusKm: 9 } },
    seat,
    null,
    pool,
  );
  assert.equal(
    changed.ranking.suggestions.length,
    3,
    "new search inputs start a fresh set of candidates",
  );
});

test("refresh is locked during voting and closed rooms retain current and previous suggestions", async () => {
  reset();
  const pool = Array.from({ length: 6 }, (_, i) => place(`place-${i}`));
  await server.generateDiningSuggestions(room, seat, null, pool);
  await server.refreshDiningSuggestions(room, seat, null, pool);
  await server.generateDiningSuggestions(room, seat, null, pool);
  const state = await server.getDiningState(room, seat, null, pool);
  await assert.rejects(
    server.refreshDiningSuggestions({ ...room, status: "voting" }, seat, null, pool),
    /locked/,
  );
  const closed = await server.getDiningState({ ...room, status: "closed" }, seat, null, []);
  assert.deepEqual(closed.ranking.suggestions, state.ranking.suggestions);
  assert.deepEqual(closed.history, state.history);
});
