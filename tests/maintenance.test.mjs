import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const url = (source) => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const transport = url(`export function createServerFn(){return {middleware(){return this},inputValidator(){return this},handler(fn){return fn}}}`);
const middleware = url("export const requireSupabaseAuth={}");
const access = url("export async function isAdministrator(id){return id === 'admin'}");
const client = url("export const supabaseAdmin=new Proxy({}, {get(_target,key){return globalThis.__maintenanceClient[key]}})");
const source = ts.transpileModule(await readFile(new URL("../src/lib/maintenance.functions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replaceAll('"@tanstack/react-start"', JSON.stringify(transport))
  .replaceAll('"@/integrations/supabase/auth-middleware"', JSON.stringify(middleware))
  .replaceAll('"./admin-access.server"', JSON.stringify(access))
  .replaceAll('"@/integrations/supabase/client.server"', JSON.stringify(client))
  .replaceAll('"zod"', JSON.stringify(import.meta.resolve("zod")));
const functions = await import(url(source));

test("every maintenance operation rejects a non-administrator before database access", async () => {
  let accesses = 0;
  globalThis.__maintenanceClient = new Proxy({}, { get() { accesses++; throw new Error("database accessed"); } });
  for (const fn of Object.values(functions)) {
    await assert.rejects(fn({ context: { userId: "guest" }, data: {} }), /Administrator access required/);
  }
  assert.equal(accesses, 0);
});

test("user maintenance uses admin APIs and prevents self deletion", async () => {
  const calls = [];
  globalThis.__maintenanceClient = { auth: { admin: {
    listUsers: async () => ({ data: { users: [{ id: "person", email: "person@example.com", created_at: "today" }] }, error: null }),
    createUser: async (data) => { calls.push(["create", data]); return { error: null }; },
    updateUserById: async (id, data) => { calls.push(["update", id, data]); return { error: null }; },
    deleteUser: async (id) => { calls.push(["delete", id]); return { error: null }; },
  } } };
  const context = { userId: "admin" };
  assert.equal((await functions.listManagedUsers({ context }))[0].email, "person@example.com");
  await functions.saveManagedUser({ context, data: { email: "new@example.com", password: "password123" } });
  await functions.saveManagedUser({ context, data: { id: "person", email: "edited@example.com", password: "" } });
  await assert.rejects(functions.deleteManagedUser({ context, data: { id: "admin" } }), /cannot delete your own/);
  await functions.deleteManagedUser({ context, data: { id: "person" } });
  assert.deepEqual(calls, [["create", { email: "new@example.com", password: "password123", email_confirm: true }], ["update", "person", { email: "edited@example.com" }], ["delete", "person"]]);
});

test("deal edits clear stale generated summaries and target the requested deal", async () => {
  const calls = [];
  globalThis.__maintenanceClient = { from(table) { assert.equal(table, "restaurant_deals"); return {
    update(value) { calls.push(value); return { eq: async (field, id) => { calls.push([field, id]); return { error: null }; } }; },
    delete() { return { eq: async (field, id) => { calls.push([field, id]); return { error: null }; } }; },
  }; } };
  const context = { userId: "admin" };
  await functions.updateManagedDeal({ context, data: { id: "deal", title: "New", description: "", status: "inactive" } });
  await functions.deleteManagedDeal({ context, data: { id: "deal" } });
  assert.deepEqual(calls, [{ title: "New", description: null, status: "inactive", polished_summary: null }, ["id", "deal"], ["id", "deal"]]);
});
