import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compile = (text) =>
  ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
const logicContext = { exports: {} };
vm.runInNewContext(
  compile(await readFile(new URL("../src/lib/onboarding.ts", import.meta.url), "utf8")),
  logicContext,
);
const logic = logicContext.exports;
const source = compile(
  await readFile(new URL("../src/components/Onboarding.tsx", import.meta.url), "utf8"),
);

function coach({ saved = false, hasVoted = false } = {}) {
  let cursor = 0,
    dirty = false,
    tree;
  const hooks = [],
    pending = [],
    listeners = new Map(),
    storage = new Map();
  if (saved) storage.set(logic.VOTING_TOUR_KEY, "done");
  let started = 0;
  let props = {
    want: null,
    could: null,
    submissionCount: 0,
    hasVoted,
    isHost: false,
    onStart: () => started++,
  };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in hooks)) hooks[i] = initial;
      return [
        hooks[i],
        (value) => {
          const next = typeof value === "function" ? value(hooks[i]) : value;
          if (!Object.is(next, hooks[i])) {
            hooks[i] = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return (hooks[i] ??= { current: initial });
    },
    useId() {
      return `guide-${cursor++}`;
    },
    useEffect(run, deps) {
      const i = cursor++,
        before = hooks[i];
      if (!before || deps.some((value, index) => !Object.is(value, before.deps[index]))) {
        hooks[i] = { deps };
        pending.push(() => {
          before?.cleanup?.();
          hooks[i].cleanup = run();
        });
      }
    },
  };
  class Observer {
    observe() {}
    disconnect() {}
  }
  const mocks = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "react-dom": { createPortal: (node) => node },
    "@/lib/onboarding": logic,
    "@/components/ui/button": { Button: "button" },
    "lucide-react": Object.fromEntries(
      ["ArrowRight", "Check", "CheckCheck", "HelpCircle", "MousePointer2", "Sparkles", "X"].map(
        (name) => [name, `icon-${name}`],
      ),
    ),
  };
  const context = {
    exports: {},
    require: (name) => {
      assert.ok(name in mocks, `Unexpected import ${name}`);
      return mocks[name];
    },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    document: {
      body: { classList: { add() {}, remove() {} } },
      addEventListener: (event, fn) => listeners.set(event, fn),
      removeEventListener: (event) => listeners.delete(event),
      querySelector: () => null,
    },
    window: {
      addEventListener: (event, fn) => listeners.set(`window:${event}`, fn),
      removeEventListener: (event) => listeners.delete(`window:${event}`),
    },
    ResizeObserver: Observer,
    MutationObserver: Observer,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
  };
  vm.runInNewContext(source, context);
  function render(patch = {}) {
    props = { ...props, ...patch };
    let iterations = 0;
    do {
      assert.ok(iterations++ < 10, "effects settle without a rendering loop");
      dirty = false;
      cursor = 0;
      tree = context.exports.Onboarding(props);
      pending.splice(0).forEach((run) => run());
    } while (dirty);
    return tree;
  }
  function all(node) {
    if (Array.isArray(node)) return node.flatMap(all);
    if (!node || typeof node !== "object") return [];
    return [node, ...all(node.props?.children)];
  }
  const text = (node) =>
    typeof node === "string"
      ? node
      : Array.isArray(node)
        ? node.map(text).join("")
        : node?.props
          ? text(node.props.children)
          : "";
  function click(label) {
    const button = all(tree).find((node) => node.type === "button" && text(node).includes(label));
    assert.ok(button, `Button ${label} exists`);
    button.props.onClick();
    render();
  }
  render();
  return {
    render,
    click,
    all: () => all(tree),
    storage,
    listeners,
    text: () => text(tree),
    started: () => started,
  };
}

test("the coach follows real picks and finishes only after a successful vote", () => {
  const view = coach();
  assert.match(view.text(), /Two picks\. One group decision/);
  view.click("Let's pick");
  assert.equal(view.started(), 1);
  assert.match(view.text(), /Which place is your favorite/);
  view.render({ want: { id: "a", name: "First restaurant" } });
  assert.match(view.text(), /next best option/);
  view.render({ could: { id: "a", name: "First restaurant" } });
  assert.match(view.text(), /next best option/, "the backup must be a different restaurant");
  view.render({ could: { id: "b", name: "Second restaurant" } });
  assert.match(view.text(), /Ready when you are/);
  assert.match(view.text(), /First restaurant/);
  assert.match(view.text(), /Second restaurant/);
  view.render({ submissionCount: 0 });
  assert.doesNotMatch(
    view.text(),
    /Your vote is at the table/,
    "choosing picks or a failed save cannot finish the guide",
  );
  view.render({ submissionCount: 1, hasVoted: true });
  assert.match(view.text(), /Your vote is at the table/);
  assert.equal(view.storage.get(logic.VOTING_TOUR_KEY), "done");
  assert.equal(
    view.all().some((node) => node.type === "dialog" || node.props?.["aria-modal"]),
    false,
  );
});

test("skip and Escape persist dismissal, with replay available for returning voters", () => {
  const view = coach();
  view.click("Skip guide");
  assert.doesNotMatch(view.text(), /Two picks/);
  assert.equal(view.storage.get(logic.VOTING_TOUR_KEY), "done");
  view.click("How voting works");
  assert.match(view.text(), /Two picks/);
  view.listeners.get("keydown")({ key: "Escape" });
  view.render();
  assert.doesNotMatch(view.text(), /Two picks/);
  for (const options of [{ saved: true }, { hasVoted: true }]) {
    const returning = coach(options);
    assert.doesNotMatch(returning.text(), /Two picks/);
    returning.click("How voting works");
    assert.match(returning.text(), /Two picks/);
  }
});

test("header reminder opens immediately without resetting saved onboarding or the ballot", async () => {
  const view = coach({ saved: true, hasVoted: true });
  view.render({
    want: { id: "a", name: "First restaurant" },
    could: { id: "b", name: "Second restaurant" },
    submissionCount: 1,
  });
  const jsx = (type, props) => ({ type, props });
  let opened = false;
  const mocks = {
    react: {
      createContext: () => ({}),
      useContext: () => "system",
      useState: () => [
        false,
        (value) => {
          opened = value;
        },
      ],
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    sonner: {},
    "@/components/VotingReminder": { VotingReminder: "voting-reminder" },
  };
  const context = { exports: {}, require: (name) => mocks[name] };
  vm.runInNewContext(
    compile(await readFile(new URL("../src/components/ThemeControl.tsx", import.meta.url), "utf8")),
    context,
  );
  const header = context.exports.ThemeControl();
  const button = header.props.children.find((child) => child?.type === "button");
  assert.equal(button.props.children, "Help");
  button.props.onClick();
  assert.equal(opened, true, "works immediately on any page without a room listener");
  assert.equal(view.storage.get(logic.VOTING_TOUR_KEY), "done");
  assert.doesNotMatch(view.text(), /Two picks/);
  assert.equal(header.props.children.at(-1).type, "voting-reminder");
});

test("onboarding mounts only in the voting section", async () => {
  for (const path of ["index.tsx", "account.tsx"])
    assert.doesNotMatch(
      await readFile(new URL(`../src/routes/${path}`, import.meta.url), "utf8"),
      /Onboarding/,
    );
  const room = await readFile(new URL("../src/routes/room.$code.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile(
    "room.tsx",
    room,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const mounts = [];
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "Onboarding") {
      let parent = node.parent;
      while (parent && !ts.isJsxExpression(parent)) parent = parent.parent;
      mounts.push(parent?.expression?.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(mounts.length, 1);
  assert.match(mounts[0], /^voting &&/);
});
