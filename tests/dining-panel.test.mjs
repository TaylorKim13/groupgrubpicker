import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  await readFile(new URL("../src/components/DiningPanel.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function render(query = {}) {
  const saves = [],
    invalidations = [],
    queries = [];
  const jsx = (type, props) => ({ type, props });
  const feedback = { visited: true, enjoyed: false };
  const session = { code: "ABC234", memberId: "member", token: "room-pass" };
  const mocks = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState: (initial) => [initial, () => {}] },
    "@tanstack/react-start": { useServerFn: (handler) => handler },
    "@tanstack/react-query": {
      useQueryClient: () => ({ invalidateQueries: async (key) => invalidations.push(key) }),
      useQuery: (options) => {
        queries.push(options);
        return options.queryKey[0] === "dining"
          ? { data: { feedback }, refetch() {}, ...query }
          : {};
      },
    },
    "./AccountProvider": { useAccount: () => null },
    "./ui/button": { Button: "button" },
    "./ui/tabs": {},
    "./SuggestionCards": {},
    "./DiningConversation": {},
    "@/lib/dining": {},
    "@/lib/restaurants": {},
    "@/lib/distance-context": {},
    "@/lib/settings": {},
    "lucide-react": {},
    sonner: { toast: { success() {}, error() {} } },
    "@/lib/room.functions": { saveRoomDiningFeedback: async (request) => saves.push(request) },
  };
  const context = {
    exports: {},
    require: (name) => {
      assert.ok(name in mocks, `Unexpected import ${name}`);
      return mocks[name];
    },
  };
  vm.runInNewContext(source, context);
  const tree = context.exports.DiningPanel({
    session,
    status: "closed",
    isHost: true,
    linked: false,
    pool: [],
    rewardRestaurants: [],
  });
  return { tree, saves, invalidations, queries, feedback, session };
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string") return node;
  return node?.props ? text(node.props.children) : "";
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}

test("finished voting shows only visit feedback and still saves responses", async () => {
  const view = render();
  assert.equal(view.tree.type.name, "VisitFeedback");
  assert.equal(view.tree.props.initial, view.feedback);
  const feedback = view.tree.type(view.tree.props);
  assert.match(text(feedback), /Did you eat at the winning restaurant/);
  assert.match(text(feedback), /Visited and didn't like it/);
  assert.doesNotMatch(
    text(feedback),
    /Suggestions for your table|Current suggestions|History \(up to 3\)/,
  );
  assert.equal(
    view.queries.find((query) => query.queryKey[0] === "dining-generation").enabled,
    false,
  );
  const button = nodes(feedback).find(
    (node) => node.type === "button" && text(node) === "Didn't go",
  );
  button.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(view.saves)), [
    { data: { ...view.session, visited: false, enjoyed: null } },
  ]);
  assert.equal(view.invalidations.length, 1);
});

test("finished-room loading and retry states refer to feedback rather than suggestions", () => {
  assert.match(text(render({ isPending: true, data: undefined }).tree), /Loading visit feedback/);
  const failed = text(
    render({ data: undefined, error: new Error("Could not load suggestions") }).tree,
  );
  assert.match(failed, /Could not load visit feedback/);
  assert.match(failed, /Try again/);
  assert.doesNotMatch(failed, /suggestions/i);
});
