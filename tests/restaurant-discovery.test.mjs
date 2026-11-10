import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/room.functions.ts", import.meta.url), "utf8");
const helper = source.slice(
  source.indexOf("const PRICE_MAP:"),
  source.indexOf("export const searchPlaces"),
);
const js = ts.transpileModule(helper, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const restaurantSource = await readFile(new URL("../src/lib/restaurants.ts", import.meta.url), "utf8");
const restaurantJs = ts.transpileModule(restaurantSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const restaurantsUrl = "data:text/javascript;base64," + Buffer.from(restaurantJs).toString("base64");
const prefix = `import { matchesFilters } from "${restaurantsUrl}";` +
  "const DEFAULT_SETTINGS={}; const gmaps=(path,init)=>globalThis.__discoveryTest.fetch(path,init); const distanceKm=(a,b)=>Math.abs(a.lat-b.lat)*111; const db=()=>globalThis.__discoveryTest.db; const buildPool=()=>[];";
const { discoverRestaurants, loadRestaurantPool } = await import(
  "data:text/javascript;base64," +
    Buffer.from(prefix + js + "\nexport { discoverRestaurants, loadRestaurantPool };").toString(
      "base64",
    )
);
test("real discovery paginates, filters distance and known price, preserves unknowns and uses voting snapshot", async () => {
  const old = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test";
  const calls = [];
  const place = (id, lat, priceLevel) => ({
    id,
    displayName: { text: id },
    location: { latitude: lat, longitude: 0 },
    priceLevel,
  });
  globalThis.__discoveryTest = {
    db: { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) },
    fetch: async (path, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      if (path.endsWith("searchNearby")) return { places: [] };
      return body.pageToken
        ? { places: [place("second", 0.01, "PRICE_LEVEL_MODERATE")] }
        : {
            nextPageToken: "next",
            places: [
              place("near", 0.01, "PRICE_LEVEL_INEXPENSIVE"),
              place("far", 1, "PRICE_LEVEL_INEXPENSIVE"),
              place("expensive", 0.01, "PRICE_LEVEL_VERY_EXPENSIVE"),
              place("unknown", 0.01),
              { ...place("closed", 0.01), businessStatus: "CLOSED_PERMANENTLY" },
            ],
          };
    },
  };
  try {
    const settings = {
      center: { lat: 0, lng: 0 },
      radiusKm: 5,
      priceMin: 1,
      priceMax: 2,
      diets: [],
    };
    const found = await discoverRestaurants(settings);
    assert.deepEqual(
      found.map((r) => r.id),
      ["g_near", "g_unknown", "g_second"],
    );
    assert.equal(found[1].priceUnknown, true);
    assert.equal(found[0].google, true);
    assert.equal(calls[0].pageSize, 20);
    assert.equal(calls[0].rankPreference, "DISTANCE");
    assert.equal(calls[1].pageToken, "next");
    const room = { id: "test", status: "lobby", settings };
    const before = calls.length;
    await Promise.all([loadRestaurantPool(room, []), loadRestaurantPool(room, [])]);
    assert.equal(calls.length - before, 3, "simultaneous polls share text and nearby discovery");
    globalThis.__discoveryTest.db = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [{ restaurant: found[0] }], error: null }) }),
      }),
    };
    const saved = await loadRestaurantPool({ ...room, status: "voting" }, []);
    assert.deepEqual(saved, [found[0]]);
    assert.equal(calls.length - before, 3, "voting uses stored snapshot");
  } finally {
    if (old === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = old;
    delete globalThis.__discoveryTest;
  }
});

test("favorite cuisine searches expand the pool, classify Google types, and invalidate discovery cache", async () => {
  const old = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test";
  const calls = [];
  let preferences = [
    { preferences: { participating: true, favoriteCuisines: ["Korean", "Korean", "invalid"] } },
    { preferences: { participating: false, favoriteCuisines: ["Italian"] } },
  ];
  globalThis.__discoveryTest = {
    db: {
      from: () => ({ select: () => ({ eq: async () => ({ data: preferences, error: null }) }) }),
    },
    fetch: async (path, init) => {
      if (path.endsWith("searchNearby")) return { places: [] };
      const body = JSON.parse(init.body);
      calls.push(body);
      return {
        places: [
          {
            id: body.textQuery,
            displayName: { text: "A place" },
            location: { latitude: 1.001, longitude: 0 },
            primaryTypeDisplayName: { text: "Restaurant" },
            types: body.textQuery.startsWith("Korean")
              ? ["barbecue_restaurant", "korean_restaurant"]
              : ["restaurant"],
          },
        ],
      };
    },
  };
  try {
    const room = {
      id: "cuisine-test",
      status: "lobby",
      settings: {
        center: { lat: 1, lng: 0 },
        radiusKm: 5,
        priceMin: 1,
        priceMax: 4,
        diets: [],
      },
    };
    const pool = await loadRestaurantPool(room, []);
    assert.deepEqual(
      calls.map((c) => c.textQuery),
      ["restaurants", "Korean restaurants"],
    );
    assert.equal(pool.find((r) => r.id === "g_Korean restaurants").cuisine, "Korean");
    await loadRestaurantPool(room, []);
    assert.equal(calls.length, 2);
    preferences = [{ preferences: { participating: true, favoriteCuisines: ["Italian"] } }];
    await loadRestaurantPool(room, []);
    assert.deepEqual(
      calls.slice(2).map((c) => c.textQuery),
      ["restaurants", "Italian restaurants"],
    );
  } finally {
    if (old === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = old;
    delete globalThis.__discoveryTest;
  }
});


test("room pools filter known budgets, distance, waits and diets while allowing unknown prices", async () => {
  const { buildPool, matchesFilters, DEFAULT_SETTINGS } = await import(restaurantsUrl);
  const settings = { ...DEFAULT_SETTINGS, center: { lat: 0, lng: 0 }, priceMin: 3, priceMax: 4 };
  const base = { id: "nomination", name: "Nominated", cuisine: "Test", price: 3, wait: 10, diets: [], lat: 0, lng: 0, custom: true };
  assert.equal(matchesFilters(base, settings), true);
  for (const patch of [{ price: 2 }, { lat: 1 }, { wait: 100 }]) {
    const restaurant = { ...base, ...patch };
    assert.equal(matchesFilters(restaurant, settings), false);
    assert.equal(buildPool(settings, [restaurant]).some(r => r.id === base.id), false);
  }
  assert.equal(matchesFilters(base, { ...settings, diets: ["vegan"] }), false);
  for (let priceMin = 1; priceMin <= 4; priceMin++) {
    for (let priceMax = priceMin; priceMax <= 4; priceMax++) {
      const unknown = { ...base, price: 2, priceUnknown: true };
      const budget = { ...settings, priceMin, priceMax };
      assert.equal(matchesFilters(unknown, budget), true);
      assert.equal(buildPool(budget, [unknown]).some(r => r.id === base.id), true);
    }
  }
  const old = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = "test";
  globalThis.__discoveryTest = { db: { from: () => ({ select: () => ({ eq: async () => ({ data: [{ restaurant: { ...base, price: 2 } }], error: null }) }) }) } };
  try {
    const pool = await loadRestaurantPool({ id: "filtered", status: "voting", settings }, [{ ...base, id: "bad-nomination", price: 2 }, { ...base, id: "good" }]);
    assert.deepEqual(pool.map(r => r.id), ["good"]);
  } finally {
    if (old === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = old;
    delete globalThis.__discoveryTest;
  }
});
