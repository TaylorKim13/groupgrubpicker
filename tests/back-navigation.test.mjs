import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const home = await readFile(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const room = await readFile(new URL("../src/routes/room.$code.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("index.tsx", home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let go;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "go") go = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

test("returning to an existing table reuses the membership without joining or creating", async () => {
  const saved = { code: "ABC123", memberId: "original-seat", token: "original-pass" };
  const navigations = [];
  const js = ts.transpileModule(go, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function("busy", "RoomCodeSchema", "loadSession", "normalizeRoomCode", "resetCreationClickTracking", "navigate", "nickname", "code", `${js}; return go;`)(
    false, { safeParse: () => ({ success: true }) },
    (code) => { assert.equal(code, saved.code); return saved; },
    (code) => code.toUpperCase(), () => {}, (navigation) => navigations.push(navigation),
    "", "abc123",
  );
  // A missing nickname must not prevent returning to an existing seat.
  await run("join");
  assert.deepEqual(navigations, [{ to: "/room/$code", params: { code: "ABC123" } }]);
});

test("room Back navigates home and does not discard membership", () => {
  const topBar = room.slice(room.indexOf("function TopBar("), room.indexOf("function Members("));
  assert.match(topBar, /<Link to="\/">\s*<ArrowLeft[^>]*\/> Back<\/Link>/);
  assert.doesNotMatch(topBar, /onLeave|clearSession/);
  // Resetting invalid credentials remains an explicit recovery action.
  assert.match(room, /onClick=\{onLeave\}[\s\S]*?Join again/);
});
