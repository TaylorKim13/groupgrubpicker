import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
const js = ts.transpileModule(
  await readFile(new URL("../src/components/ThemeControl.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const start = js.indexOf("const storageKey");
const end = js.indexOf("export function ThemeProvider");
const script = vm.runInNewContext(
  js.slice(start, end).replace("export const themeInitScript", "const themeInitScript") +
    ";themeInitScript",
);
test("theme initializes before paint using device preference and saved overrides", () => {
  for (const [saved, deviceDark, expected] of [
    [null, true, true],
    [null, false, false],
    ["system", true, true],
    ["dark", false, true],
    ["light", true, false],
    ["invalid", true, true],
  ]) {
    let dark;
    const style = {};
    vm.runInNewContext(script, {
      localStorage: { getItem: () => saved },
      matchMedia: () => ({ matches: deviceDark }),
      document: {
        documentElement: { classList: { toggle: (_name, value) => (dark = value) }, style },
      },
    });
    assert.equal(dark, expected);
    assert.equal(style.colorScheme, expected ? "dark" : "light");
  }
  let dark;
  vm.runInNewContext(script, {
    localStorage: {
      getItem: () => {
        throw Error("blocked");
      },
    },
    matchMedia: () => ({ matches: true }),
    document: {
      documentElement: { classList: { toggle: (_name, value) => (dark = value) }, style: {} },
    },
  });
  assert.equal(dark, true);
});
