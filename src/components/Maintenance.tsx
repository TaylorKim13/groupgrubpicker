import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { listManagedUsers, saveManagedUser, deleteManagedUser, listManagedDeals, updateManagedDeal, deleteManagedDeal } from "@/lib/maintenance.functions";

export function Maintenance({ userId }: { userId: string }) {
  const [section, setSection] = useState<"users" | "deals" | null>(null);
  return <section className="space-y-4 py-6">
    <h2 className="text-2xl font-bold">Administration</h2>
    <div className="flex flex-wrap gap-2">
      <Button variant={section === "users" ? "default" : "outline"} onClick={() => setSection("users")}>Maintain Users</Button>
      <Button variant={section === "deals" ? "default" : "outline"} onClick={() => setSection("deals")}>Maintain Records</Button>
    </div>
    {section === "users" && <Users userId={userId} />}
    {section === "deals" && <Deals />}
  </section>;
}

function Users({ userId }: { userId: string }) {
  const list = useServerFn(listManagedUsers), save = useServerFn(saveManagedUser), remove = useServerFn(deleteManagedUser);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["managed-users", userId], queryFn: () => list() });
  const [id, setId] = useState<string | undefined>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  function clear() { setId(undefined); setEmail(""); setPassword(""); }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); await qc.invalidateQueries({ queryKey: ["managed-users"] }); clear(); toast.success("Users updated"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not update users"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <h3 className="text-xl font-bold">Maintain Users</h3>
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run(() => save({ data: { id, email, password } })); }}>
      <p>{id ? "Edit user" : "Create user"}</p>
      <label className="block">Email<Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="block">{id ? "New password (leave blank to keep current password)" : "Password (at least 8 characters)"}<Input type="password" minLength={8} required={!id} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <div className="flex gap-2"><Button disabled={busy} type="submit">{id ? "Save user" : "Create user"}</Button>{id && <Button type="button" variant="outline" onClick={clear}>Cancel</Button>}</div>
    </form>
    {query.isPending && <p>Loading users...</p>}{query.isError && <p role="alert">Could not load users.</p>}
    <ul className="divide-y">{query.data?.map((user) => <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={user.id}><span>{user.email || user.id}</span><div className="flex gap-2"><Button variant="outline" onClick={() => { setId(user.id); setEmail(user.email); setPassword(""); }}>Edit</Button><Button variant="outline" disabled={busy || user.id === userId} onClick={() => { if (window.confirm(`Delete ${user.email}? This cannot be undone.`)) void run(() => remove({ data: { id: user.id } })); }}>Delete</Button></div></li>)}</ul>
  </div>;
}

function Deals() {
  const list = useServerFn(listManagedDeals), save = useServerFn(updateManagedDeal), remove = useServerFn(deleteManagedDeal);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["managed-deals"], queryFn: () => list() });
  const [editing, setEditing] = useState<{ id: string; title: string; description: string; status: "active" | "inactive" } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); await qc.invalidateQueries({ queryKey: ["managed-deals"] }); setEditing(null); toast.success("Deals updated"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not update deal"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <h3 className="text-xl font-bold">Maintain Restaurant Deals</h3>
    <Button asChild><Link to="/deals/submit">Create deal</Link></Button>
    {editing && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void run(() => save({ data: editing })); }}>
      <label className="block">Title<Input required minLength={3} maxLength={120} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
      <label className="block">Description<textarea className="block w-full rounded-md border bg-background p-2" maxLength={1500} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
      <label className="block">Status <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as "active" | "inactive" })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <div className="flex gap-2"><Button disabled={busy}>Save deal</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
    </form>}
    {query.isPending && <p>Loading deals...</p>}{query.isError && <p role="alert">Could not load deals.</p>}
    <ul className="divide-y">{query.data?.map((deal) => <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={deal.id}><span><strong>{deal.restaurant_name}</strong>: {deal.title} ({deal.status})</span><div className="flex gap-2"><Button variant="outline" onClick={() => setEditing({ id: deal.id, title: deal.title, description: deal.description ?? "", status: deal.status === "inactive" ? "inactive" : "active" })}>Edit</Button><Button variant="outline" disabled={busy} onClick={() => { if (window.confirm(`Delete ${deal.title}?`)) void run(() => remove({ data: { id: deal.id } })); }}>Delete</Button></div></li>)}</ul>
  </div>;
}
