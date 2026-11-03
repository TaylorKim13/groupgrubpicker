import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const url = (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const transpile = (text) =>
  ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
const avatarModule = url(
  transpile(
    await readFile(new URL("../src/lib/profile-avatar.ts", import.meta.url), "utf8"),
  ).replace('"zod"', JSON.stringify(import.meta.resolve("zod"))),
);
const access = url(
  transpile(await readFile(new URL("../src/lib/room-access.ts", import.meta.url), "utf8"))
    .replace('"zod"', JSON.stringify(import.meta.resolve("zod")))
    .replace('"./profile-avatar"', JSON.stringify(avatarModule)),
);
const hook = url("export const useState = () => [false, () => {}];");
const toast = url(
  'export const toast = {success: message => globalThis.__inviteMessages.push(["success", message]),error: message => globalThis.__inviteMessages.push(["error", message])};',
);
let source = transpile(
  await readFile(new URL("../src/components/RoomInvite.tsx", import.meta.url), "utf8"),
);
for (const [name, target] of Object.entries({
  react: hook,
  sonner: toast,
  "@/lib/room-access": access,
  "./ui/button": url('export const Button = "button";'),
  "react/jsx-runtime": import.meta.resolve("react/jsx-runtime"),
}))
  source = source.replaceAll(JSON.stringify(name), JSON.stringify(target));
const { RoomInvite } = await import(url(source));
function find(element, predicate) {
  if (!element || typeof element !== "object") return undefined;
  if (predicate(element)) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return undefined;
}

test("copy buttons use the public code/link and report clipboard errors truthfully", async () => {
  const navigatorBefore = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const windowBefore = Object.getOwnPropertyDescriptor(globalThis, "window");
  const copied = [];
  globalThis.__inviteMessages = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "https://groupgrub.example" } },
  });
  const clipboard = {
    writeText: async (text) => {
      copied.push(text);
    },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard } });
  try {
    const page = RoomInvite({ code: "ABC234" });
    const link = find(page, (node) => node.type === "input");
    assert.equal(link.props.value, "https://groupgrub.example/room/ABC234");
    assert.equal(link.props.readOnly, true);
    const copyLink = find(
      page,
      (node) => node.type === "button" && node.props.children === "Copy invite link",
    );
    const copyCode = find(
      page,
      (node) => node.type === "button" && node.props.children === "Copy code",
    );
    copyLink.props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    copyCode.props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(copied, ["https://groupgrub.example/room/ABC234", "ABC234"]);
    assert.deepEqual(
      globalThis.__inviteMessages.map((m) => m[0]),
      ["success", "success"],
    );
    globalThis.__inviteMessages.length = 0;
    clipboard.writeText = async () => {
      throw new Error("Permission denied");
    };
    copyLink.props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(globalThis.__inviteMessages.length, 1);
    assert.equal(globalThis.__inviteMessages[0][0], "error");
    assert.match(globalThis.__inviteMessages[0][1], /manually/);
  } finally {
    if (navigatorBefore) Object.defineProperty(globalThis, "navigator", navigatorBefore);
    else delete globalThis.navigator;
    if (windowBefore) Object.defineProperty(globalThis, "window", windowBefore);
    else delete globalThis.window;
    delete globalThis.__inviteMessages;
  }
});
