import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/metric-trends.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { buildMetricTrends } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const now = new Date("2026-11-10T03:00:00Z");
const base = { voting_started_at: "2026-11-09T18:00:00Z", location_filter_applied_at: null, price_filter_applied_at: null, restaurant_selected_at: null };
test("daily cohorts use weighted ratios, preserve missing data and count exact five-minute completions", () => {
 const days = buildMetricTrends([
  {...base, price_filter_applied_at: base.voting_started_at, restaurant_selected_at:"2026-11-09T18:05:00Z"}, base
 ], [
  {entered_at:base.voting_started_at,last_seen_at:base.voting_started_at,selected_at:null},
  {entered_at:base.voting_started_at,last_seen_at:now.toISOString(),selected_at:null},
 ], [
  {created_at:base.voting_started_at,click_count:2}, {created_at:base.voting_started_at,click_count:4}, {created_at:base.voting_started_at,click_count:null},
 ], now);
 assert.equal(days.length,30);
 const today=days.at(-1); assert.equal(today.date,"2026-11-09");
 assert.equal(today.filterRate,50); assert.equal(today.fastRate,50);
 assert.equal(today.abandonmentRate,50); assert.equal(today.pending,1);
 assert.equal(today.averageClicks,3); assert.equal(today.measured,2); assert.equal(today.created,3);
 assert.equal(days[0].filterRate,null); assert.equal(days[0].averageClicks,null);
});
test("Mountain midnight and DST boundaries produce unique consecutive dates", () => {
 const days=buildMetricTrends([{...base,voting_started_at:"2026-11-09T06:30:00Z"}],[],[],new Date("2026-11-09T07:30:00Z"));
 assert.equal(days.at(-1).date,"2026-11-09"); assert.equal(days.at(-2).date,"2026-11-08");
 assert.equal(days.at(-2).sessions,1); assert.equal(new Set(days.map(d=>d.date)).size,30);
});
