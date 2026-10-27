import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Load the real shared TypeScript modules without introducing a test bundler.
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const restaurantsUrl = moduleUrl(
  compile(await readFile(new URL("../src/lib/restaurants.ts", import.meta.url), "utf8")),
);
const restaurants = await import(restaurantsUrl);
const settingsSource = compile(
  await readFile(new URL("../src/lib/settings.ts", import.meta.url), "utf8"),
)
  .replace(/['"]\.\/restaurants['"]/, JSON.stringify(restaurantsUrl))
  .replace(/['"]zod['"]/, JSON.stringify(import.meta.resolve("zod")));
const { fromKm, toKm, formatDistance, SettingsSchema } = await import(moduleUrl(settingsSource));

test("10 miles retains the same radius through repeated unit conversions", () => {
  let radius = toKm(10, "mi");
  assert.equal(radius, 16.09344);
  for (let i = 0; i < 100; i++) radius = toKm(fromKm(radius, "mi"), "mi");
  assert.ok(Math.abs(radius - 16.09344) < 1e-10);
  assert.equal(formatDistance(radius, "mi"), "10 mi");
  assert.equal(formatDistance(radius, "km"), "16.1 km");
});
test("existing supported boundary values remain valid", () => {
  for (const radiusKm of [0.5, 5, 40])
    for (const maxWait of [5, 60, 180]) {
      assert.ok(
        SettingsSchema.safeParse({ ...restaurants.DEFAULT_SETTINGS, radiusKm, maxWait }).success,
      );
    }
});
test("rejects invalid ranges, non-finite distances, and unknown diets", () => {
  for (const patch of [
    { priceMin: 4, priceMax: 1 },
    { radiusKm: NaN },
    { radiusKm: 41 },
    { maxWait: 181 },
    { maxWait: 1.5 },
    { diets: ["unknown"] },
  ]) {
    assert.equal(
      SettingsSchema.safeParse({ ...restaurants.DEFAULT_SETTINGS, ...patch }).success,
      false,
    );
  }
});
test("hosting defaults remain an independent room snapshot", () => {
  const saved = SettingsSchema.parse({
    ...restaurants.DEFAULT_SETTINGS,
    radiusKm: toKm(10, "mi"),
    maxWait: 20,
    diets: ["vegan"],
  });
  const room = SettingsSchema.parse(saved);
  room.diets.push("halal");
  room.maxWait = 60;
  assert.deepEqual(saved.diets, ["vegan"]);
  assert.equal(saved.maxWait, 20);
  assert.equal(restaurants.DEFAULT_SETTINGS.radiusKm, 5);
});
test("distance filters use kilometers regardless of display units", () => {
  const settings = { ...restaurants.DEFAULT_SETTINGS, radiusKm: toKm(10, "mi"), maxWait: 20 };
  const restaurant = {
    ...restaurants.mockRestaurants(settings.center)[0],
    lat: settings.center.lat + 0.1,
    lng: settings.center.lng,
  };
  assert.ok(restaurants.matchesFilters(restaurant, settings));
  assert.equal(restaurants.matchesFilters(restaurant, { ...settings, radiusKm: 5 }), false);
});
