import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const url = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
async function load(path, replacements = {}) {
  let text = ts.transpileModule(
    await readFile(new URL(`../src/${path}`, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  for (const [name, value] of Object.entries(replacements))
    text = text.replaceAll(JSON.stringify(name), JSON.stringify(value));
  return url(text);
}
const schema = await load("lib/creation-clicks.ts", { zod: import.meta.resolve("zod") });
const counterUrl = await load("lib/creation-click-tracking.ts", {
  zod: import.meta.resolve("zod"),
  "./creation-clicks": schema,
});
const counter = await import(counterUrl);
const sessionUrl = await load("lib/session.ts");
const component = await load("components/CreationClickTracker.tsx", {
  react: url("export const useEffect = fn => {globalThis.__creationClickTest.cleanup=fn();};"),
  "@tanstack/react-start": url("export const useServerFn = fn => fn;"),
  "@/lib/room.functions": url(
    'export const recordGroupCreationClicks = args => {globalThis.__creationClickTest.calls.push(args);return globalThis.__creationClickTest.fail?Promise.reject(new Error("offline")):Promise.resolve({ok:true});};',
  ),
  "@/lib/session": sessionUrl,
  "@/lib/creation-click-tracking": counterUrl,
});
const { CreationClickTracker } = await import(component);
test("counts real creation interactions once, persists retry effort, and retries reports without storing passes", async () => {
  const originals = new Map(
    ["window", "document", "localStorage", "sessionStorage"].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  const sessionMap = new Map();
  const localMap = new Map();
  const storage = (map) => ({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  });
  const events = () => {
    const handlers = new Map();
    return {
      handlers,
      addEventListener: (name, fn) => handlers.set(name, fn),
      removeEventListener: (name) => handlers.delete(name),
    };
  };
  const fixture = { calls: [], fail: false, cleanup: undefined, tick: undefined };
  globalThis.__creationClickTest = fixture;
  const doc = events();
  const browser = {
    ...events(),
    location: { pathname: "/" },
    setInterval: (fn) => {
      fixture.tick = fn;
      return 1;
    },
    clearInterval: () => {},
    dispatchEvent: (event) => {
      browser.handlers.get(event.type)?.();
    },
  };
  for (const [name, value] of Object.entries({
    window: browser,
    document: doc,
    sessionStorage: storage(sessionMap),
    localStorage: storage(localMap),
  }))
    Object.defineProperty(globalThis, name, { configurable: true, value });
  const first = {
    code: "ABC234",
    memberId: "11111111-1111-4111-8111-111111111111",
    token: "private-first-pass",
  };
  const second = {
    code: "DEF567",
    memberId: "22222222-2222-4222-8222-222222222222",
    token: "private-second-pass",
  };
  const pointer = () =>
    doc.handlers.get("pointerdown")({ isTrusted: true, button: 0, isPrimary: true });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  try {
    CreationClickTracker();
    counter.beginCreationClickTracking();
    pointer(); // Start a new table; automatic nickname focus needs no click
    doc.handlers.get("keydown")(); // typing is not a click
    pointer(); // Create table
    localMap.set("groupgrub:ABC234", JSON.stringify(first));
    counter.completeCreationClickTracking(first);
    await settle();
    assert.equal(fixture.calls[0].data.clicks, 2);
    assert.equal(fixture.calls[0].data.token, first.token);
    assert.equal(counter.pendingCreationClicks().length, 0);
    counter.beginCreationClickTracking();
    doc.handlers.get("keydown")();
    doc.handlers.get("click")({ isTrusted: true, detail: 0 });
    doc.handlers.get("submit")({ isTrusted: true }); // don't count keyboard click and submit twice
    doc.handlers.get("keydown")();
    doc.handlers.get("submit")({ isTrusted: true });
    pointer();
    doc.handlers.get("click")({ isTrusted: true, detail: 0 }); // label forwarding isn't another click
    doc.handlers.get("pointerdown")({ isTrusted: false, button: 0, isPrimary: true });
    counter.beginCreationClickTracking(); // Back/failed attempt does not reset the current count
    pointer(); // retry effort remains in the total
    fixture.fail = true;
    localMap.set("groupgrub:DEF567", JSON.stringify(second));
    counter.completeCreationClickTracking(second);
    await settle();
    assert.equal(fixture.calls.at(-1).data.clicks, 4);
    assert.equal(counter.pendingCreationClicks()[0].clicks, 4);
    assert.equal(JSON.stringify([...sessionMap.values()]).includes(second.token), false);
    assert.notEqual(fixture.calls[0].data.journeyId, fixture.calls.at(-1).data.journeyId);
    fixture.fail = false;
    await fixture.tick();
    assert.equal(counter.pendingCreationClicks().length, 0);
    assert.equal(fixture.calls.at(-1).data.clicks, 4);
    counter.beginCreationClickTracking();
    pointer();
    counter.resetCreationClickTracking();
    assert.equal(JSON.parse(sessionMap.get("groupgrub:creation-clicks")).active, null);
    fixture.cleanup();
    assert.equal(doc.handlers.size, 0);
    assert.equal(browser.handlers.size, 0);
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    delete globalThis.__creationClickTest;
  }
});
