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
const prefix =
  "const gmaps=(path,init)=>globalThis.__discoveryTest.fetch(path,init); const distanceKm=(a,b)=>Math.abs(a.lat-b.lat)*111; const db=()=>globalThis.__discoveryTest.db; const buildPool=()=>[];";
const { discoverRestaurants, loadRestaurantPool } = await import(
  "data:text/javascript;base64," + Buffer.from(prefix + js + "\nexport { discoverRestaurants, loadRestaurantPool };").toString("base64")
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
    fetch: async (path, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
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
    assert.equal(calls.length - before, 2, "simultaneous polls share one paginated discovery");
    globalThis.__discoveryTest.db = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [{ restaurant: found[0] }], error: null }) }),
      }),
    };
    const saved = await loadRestaurantPool({ ...room, status: "voting" }, []);
    assert.deepEqual(saved, [found[0]]);
    assert.equal(calls.length - before, 2, "voting uses stored snapshot");
  } finally {
    if (old === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = old;
    delete globalThis.__discoveryTest;
  }
});
