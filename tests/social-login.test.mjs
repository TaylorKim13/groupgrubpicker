import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  await readFile(new URL("../src/components/SignInPanel.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function render({
  href = "https://site.example/account",
  signIn = async () => ({ error: null }),
} = {}) {
  const states = [],
    effects = [],
    errors = [],
    calls = [],
    replacements = [];
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      useState(initial) {
        const index = states.length;
        states.push(initial);
        return [
          initial,
          (value) => {
            states[index] = value;
          },
        ];
      },
      useEffect: (fn) => effects.push(fn),
    },
    sonner: { toast: { error: (value) => errors.push(value) } },
    "@/components/ui/button": { Button: "button" },
    "@/integrations/supabase/client": {
      supabase: {
        auth: {
          signInWithOAuth: async (args) => {
            calls.push(args);
            return signIn(args);
          },
        },
      },
    },
    "lucide-react": { Eye: "eye", EyeOff: "eye-off" },
    "./RecoveryPanel": { RecoveryPanel: "recovery" },
    "@/lib/recovery": { UsernameSchema: {} },
  };
  const context = vm.createContext({
    exports: {},
    URL,
    URLSearchParams,
    require: (name) => {
      assert.ok(name in mocks, `Unexpected import: ${name}`);
      return mocks[name];
    },
    window: {
      location: new URL(href),
      history: { state: { preserved: true }, replaceState: (...args) => replacements.push(args) },
    },
  });
  vm.runInContext(source, context);
  const tree = context.exports.SignInPanel();
  function find(node, label) {
    if (!node || typeof node !== "object") return null;
    if (node.type === "button" && node.props.children === label) return node;
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = find(child, label);
      if (found) return found;
    }
    return null;
  }
  return { states, effects, errors, calls, replacements, button: (label) => find(tree, label) };
}

test("Google is the only social login and returns to the account page", async () => {
  const view = render();
  assert.equal(view.button("Continue with Microsoft"), null);
  assert.ok(view.button("Sign in with email"));
  view.button("Continue with Google").props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(view.calls.length, 1);
  assert.equal(view.calls[0].provider, "google");
  assert.equal(view.calls[0].options.redirectTo, "https://site.example/account");
  assert.equal(view.calls[0].options.scopes, undefined);
  assert.equal(view.states[0], true, "controls stay disabled until navigation");
  assert.equal(view.errors.length, 0);
});

test("provider errors and network failures allow retry without exposing response details", async () => {
  for (const signIn of [
    async () => ({ error: { message: "private provider details" } }),
    async () => {
      throw new Error("private network details");
    },
  ]) {
    const view = render({ signIn });
    view.button("Continue with Google").props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(view.states[0], false);
    assert.equal(view.errors.length, 1);
    assert.ok(!view.errors[0].includes("private"));
  }
});

test("cancelled callbacks show a useful error and clear OAuth errors while preserving URL state", () => {
  for (const suffix of [
    "?keep=1&error=access_denied&error_code=denied&error_description=private",
    "?keep=1#error=access_denied&error_description=private",
  ]) {
    const view = render({ href: "https://site.example/account" + suffix });
    view.effects.forEach((effect) => effect());
    assert.equal(view.errors.length, 1);
    assert.equal(view.replacements[0][2], "/account?keep=1");
    assert.equal(view.replacements[0][0].preserved, true);
  }
  const success = render({ href: "https://site.example/account#access_token=token" });
  success.effects.forEach((effect) => effect());
  assert.equal(success.replacements.length, 0, "successful callback tokens are left for Supabase");
});
