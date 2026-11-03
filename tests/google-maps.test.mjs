import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

// Exercise the production transport with controlled Google responses.
const source = await readFile(new URL("../src/lib/room.functions.ts", import.meta.url), "utf8");
const helper = source.slice(
  source.indexOf("export async function gmaps("),
  source.indexOf("export const geocodeCenter"),
);
const js = ts.transpileModule(helper, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { gmaps } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

test("direct Google transports authenticate correctly and handle provider failures without exposing keys", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;
  const calls = [];
  process.env.GOOGLE_MAPS_API_KEY = "test-server-secret";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return Response.json({ status: "OK", results: [] });
  };
  try {
    await gmaps("/maps/api/geocode/json?address=Salt%20Lake%20City%20%26%20Main");
    assert.equal(calls[0].url.origin, "https://maps.googleapis.com");
    assert.equal(calls[0].url.searchParams.get("key"), "test-server-secret");
    assert.equal(calls[0].url.searchParams.get("address"), "Salt Lake City & Main");
    assert.equal(calls[0].init.headers.has("Authorization"), false);
    assert.ok(calls[0].init.signal);
    await gmaps("/places/v1/places:searchText", {
      method: "POST",
      fieldMask: "places.id",
      body: JSON.stringify({ textQuery: "pizza" }),
    });
    const places = calls[1];
    assert.equal(places.url.href, "https://places.googleapis.com/v1/places:searchText");
    assert.equal(places.init.headers.get("X-Goog-Api-Key"), "test-server-secret");
    assert.equal(places.init.headers.get("X-Goog-FieldMask"), "places.id");
    assert.equal(places.init.headers.has("X-Connection-Api-Key"), false);
    assert.equal(places.init.method, "POST");
    assert.deepEqual(JSON.parse(places.init.body), { textQuery: "pizza" });
    await assert.rejects(gmaps("https://example.com"), /Unsupported/);
    globalThis.fetch = async () =>
      Response.json({ status: "REQUEST_DENIED", error_message: "private detail" });
    await assert.rejects(
      gmaps("/maps/api/geocode/json?address=x"),
      /^Error: Map search failed \(REQUEST_DENIED\)$/,
    );
    globalThis.fetch = async () => Response.json({ status: "ZERO_RESULTS", results: [] });
    assert.deepEqual((await gmaps("/maps/api/geocode/json?address=x")).results, []);
    globalThis.fetch = async () => new Response("private detail", { status: 403 });
    await assert.rejects(
      gmaps("/places/v1/places:searchText"),
      /^Error: Map search failed \(403\)$/,
    );
    globalThis.fetch = async () => {
      throw new Error("URL containing test-server-secret");
    };
    await assert.rejects(
      gmaps("/maps/api/geocode/json?address=x"),
      /^Error: Map search could not connect\. Please try again\.$/,
    );
    delete process.env.GOOGLE_MAPS_API_KEY;
    await assert.rejects(gmaps("/maps/api/geocode/json?address=x"), /not configured/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});
