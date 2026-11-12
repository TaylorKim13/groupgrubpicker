import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/routes/room.$code.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile(
  "room.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const functions = ast.statements.filter(
  (node) =>
    ts.isFunctionDeclaration(node) &&
    ["Room", "TopBar", "InvitationLobby"].includes(node.name?.text),
);
const compiled = ts.transpileModule(functions.map((node) => node.getText(ast)).join("\n"), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const jsx = (type, props) => ({ type, props });
const session = { code: "ABC234", memberId: "host", token: "room-pass" };
function render(status, { setup = false, host = true } = {}) {
  const starts = [],
    refreshes = [];
  const state = {
    code: session.code,
    status,
    me: { isHost: host, linked: false },
    pool: [{ id: "a" }, { id: "b" }],
    candidates: [],
    members: [],
    result: status === "closed" ? { winner: { name: "Winner" } } : null,
  };
  const context = {
    exports: {},
    require: (name) => {
      assert.equal(name, "react/jsx-runtime");
      return { jsx, jsxs: jsx, Fragment: "fragment" };
    },
    useNavigate: () => () => {},
    useAccount: () => null,
    useRoomPresence() {},
    useState: (initial) => [initial, () => {}],
    useServerFn: (handler) => handler,
    useQuery: (options) =>
      options.queryKey[0] === "room" ? { data: state } : { data: { restaurants: [] } },
    useQueryClient: () => ({ invalidateQueries: (key) => refreshes.push(key) }),
    finalizeRoomSetup() {},
    getRoomState() {},
    getRewardRestaurants() {},
    addRestaurantToPool() {},
    startVoting: async (request) => starts.push(request),
    hasRewardMatch: () => false,
    toast: { error: (message) => assert.fail(message) },
    PoolSetupHeader: "setup-header",
    Pool: "restaurant-pool",
    Members: "members",
    RoomFriends: "friend-invitations",
    Reveal: "winner",
    DiningPanel: "dining-panel",
    Link: "link",
    Button: "button",
    ThemeControl: "appearance",
    RoomInvite: "room-code-and-link",
    ShareInviteButton: "share-invite",
    ArrowLeft: "back-icon",
    ArrowRight: "next-icon",
  };
  vm.runInNewContext(`${compiled}\nexports.Room = Room; exports.TopBar = TopBar;`, context);
  const tree = context.exports.Room({ session, onLeave() {}, setupFlow: setup });
  const header = context.exports.TopBar({ s: state });
  return { tree, header, starts, refreshes };
}
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string") return node;
  return node?.props ? text(node.props.children) : "";
}

test("created rooms show invitations and members, with a working host voting action", async () => {
  const view = render("lobby");
  const invitation = nodes(view.tree).find((node) => node.type.name === "InvitationLobby");
  assert.ok(invitation);
  const lobby = invitation.type(invitation.props);
  assert.ok(nodes(lobby).some((node) => node.type === "friend-invitations"));
  assert.ok(nodes(lobby).some((node) => node.type === "members"));
  assert.equal(
    nodes(view.tree).some(
      (node) => node.type === "restaurant-pool" || node.type === "dining-panel",
    ),
    false,
  );
  assert.ok(nodes(view.header).some((node) => node.type === "room-code-and-link"));
  const open = nodes(lobby).find(
    (node) => node.type === "button" && text(node).includes("Open voting"),
  );
  open.props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(view.starts)), [{ data: session }]);
  assert.equal(view.refreshes.length, 1);
});

test("guests wait for the host, while setup and voting retain restaurant choices", () => {
  const guest = render("lobby", { host: false });
  const invitation = nodes(guest.tree).find((node) => node.type.name === "InvitationLobby");
  const lobby = invitation.type(invitation.props);
  assert.match(text(lobby), /host will open voting/);
  assert.equal(
    nodes(lobby).some((node) => node.type === "button"),
    false,
  );
  for (const [status, options] of [
    ["lobby", { setup: true }],
    ["voting", {}],
  ]) {
    const view = render(status, options);
    assert.ok(nodes(view.tree).some((node) => node.type === "restaurant-pool"));
    assert.equal(
      nodes(view.tree).some((node) => node.type.name === "InvitationLobby"),
      false,
    );
  }
});

test("the winner keeps navigation and appearance without room invitations", () => {
  const view = render("closed");
  const header = nodes(view.header);
  assert.equal(
    header.some((node) => ["room-code-and-link", "share-invite"].includes(node.type)),
    false,
  );
  assert.ok(header.some((node) => node.type === "appearance" && node.props.showHelp === false));
  assert.match(text(view.header), /GROUP.*GRUB.*Back/);
  assert.ok(nodes(view.tree).some((node) => node.type === "winner"));
  assert.ok(
    nodes(view.tree).some((node) => node.type === "dining-panel" && node.props.status === "closed"),
  );
});
