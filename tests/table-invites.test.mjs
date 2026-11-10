import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../src/lib/social.functions.ts", import.meta.url), "utf8");
const endpoint = source.slice(source.indexOf("export const inviteFriendsToTable"), source.indexOf("export const dismissTableInvite"));
const handler = endpoint.slice(endpoint.indexOf("async ({ data, context }) =>"), endpoint.lastIndexOf(");"));
const js = ts.transpileModule("export const run = " + handler, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const prefix = `const linkSeat=async()=>({room:{id:"room",status:"lobby"}}); const areFriends=async()=>false; const db=()=>globalThis.__inviteDb;`;
const { run } = await import("data:text/javascript;base64," + Buffer.from(prefix + js).toString("base64"));
function setup({shared = true, fail = false} = {}) {
  const writes = [];
  let memberships = 0;
  globalThis.__inviteDb = { from(table) {
    if (table === "table_invites") return { upsert: async row => { writes.push(row); return { error: fail ? {message:"database failed"} : null }; } };
    const result = { data: ++memberships === 1 ? [{crew_id:"crew"}] : shared ? [{user_id:"recipient"}] : [], error: null };
    const query = { select(){return this}, eq(){return this}, in(){return this}, then(resolve){return Promise.resolve(result).then(resolve)} };
    return query;
  } };
  return writes;
}
const args = { data: {userIds:["recipient"]}, context:{userId:"sender"} };
test("accepted group members can receive invitations without a direct friendship", async()=>{
  const writes=setup();
  assert.deepEqual(await run(args),{sent:1,skipped:0});
  assert.equal(writes[0].to_user,"recipient");
});
test("unrelated recipients remain unauthorized",async()=>{
  const writes=setup({shared:false});
  assert.deepEqual(await run(args),{sent:0,skipped:1});
  assert.equal(writes.length,0);
});
test("failed invitation writes report an error instead of zero success",async()=>{
  setup({fail:true});
  await assert.rejects(run(args),/Could not save the invitation/);
});
