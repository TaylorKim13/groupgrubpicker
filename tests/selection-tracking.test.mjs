import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let source = ts.transpileModule(
  await readFile(new URL("../src/components/useSelectionTracking.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const replacements = {
  react: url("export const useEffect = fn => { globalThis.__selectionTracker.cleanup = fn(); };"),
  "@tanstack/react-start": url("export const useServerFn = fn => fn;"),
  "@/lib/room.functions": url(
    'export const recordSelectionActivity = args => { globalThis.__selectionTracker.calls.push(args); return globalThis.__selectionTracker.fail ? Promise.reject(new Error("offline")) : Promise.resolve({ok:true}); };',
  ),
};
for (const [name, target] of Object.entries(replacements))
  source = source.replaceAll(JSON.stringify(name), JSON.stringify(target));
const { useSelectionTracking } = await import(url(source));
const session = { code: "ABC234", memberId: "member", token: "private-room-pass" };
test("visible stage entry, real activity, departures and returns are tracked without idle heartbeats", async () => {
  const originals = new Map(
    ["window", "document"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  let now = 0;
  const state = { calls: [], cleanup: undefined, fail: false, tick: undefined, cleared: false };
  globalThis.__selectionTracker = state;
  function surface(extra = {}) {
    const events = new Map();
    return {
      events,
      ...extra,
      addEventListener: (name, handler) => events.set(name, handler),
      removeEventListener: (name) => events.delete(name),
    };
  }
  const page = surface({ visibilityState: "visible" });
  const browser = surface({
    setInterval: (fn, ms) => {
      assert.equal(ms, 30000);
      state.tick = fn;
      return 1;
    },
    clearInterval: () => {
      state.cleared = true;
    },
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  Object.defineProperty(globalThis, "document", { configurable: true, value: page });
  Date.now = () => now;
  try {
    useSelectionTracking(session, true);
    assert.deepEqual(
      state.calls.map((c) => c.data.event),
      ["enter"],
    );
    browser.events.get("pageshow")();
    assert.equal(state.calls.length, 1);
    now = 30000;
    state.tick(); // open idle tabs must not stay active forever
    assert.equal(state.calls.length, 1);
    browser.events.get("pointerdown")();
    assert.deepEqual(
      state.calls.map((c) => c.data.event),
      ["enter", "heartbeat"],
    );
    now = 31000;
    browser.events.get("keydown")();
    assert.equal(state.calls.length, 2);
    now = 60000;
    state.tick();
    assert.equal(state.calls.at(-1).data.event, "heartbeat");
    page.visibilityState = "hidden";
    page.events.get("visibilitychange")();
    assert.equal(state.calls.at(-1).data.event, "leave");
    const afterLeave = state.calls.length;
    browser.events.get("pagehide")();
    state.tick();
    assert.equal(state.calls.length, afterLeave);
    let fetchOptions;
    globalThis.fetch = async (_input, options) => {
      fetchOptions = options;
      return new Response();
    };
    await state.calls.at(-1).fetch("/function", { method: "POST" });
    assert.equal(fetchOptions.keepalive, true);
    assert.equal(state.calls[0].data.token, session.token);
    page.visibilityState = "visible";
    page.events.get("visibilitychange")();
    assert.equal(state.calls.at(-1).data.event, "enter");
    state.cleanup();
    assert.equal(state.calls.at(-1).data.event, "leave");
    assert.equal(state.cleared, true);
    assert.equal(browser.events.size, 0);
    assert.equal(page.events.size, 0);
    state.calls = [];
    useSelectionTracking(session, false);
    assert.equal(state.calls.length, 0);
    page.visibilityState = "hidden";
    useSelectionTracking(session, true);
    assert.equal(state.calls.length, 0); // background pages aren't stage entries
    state.fail = true;
    page.visibilityState = "visible";
    page.events.get("visibilitychange")();
    await new Promise((resolve) => setImmediate(resolve)); // offline analytics failures are handled
    state.cleanup();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    delete globalThis.__selectionTracker;
  }
});
