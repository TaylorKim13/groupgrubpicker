import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { addDashboardAdministrator, listDashboardAdministrators } from "@/lib/metrics.functions";
import { Button } from "./ui/button";

export function DashboardAdministrators({ userId }: { userId: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useServerFn(listDashboardAdministrators);
  const add = useServerFn(addDashboardAdministrator);
  const query = useQuery({
    queryKey: ["dashboard-administrators", userId],
    queryFn: () => list(),
    refetchInterval: 30000,
  });
  return (
    <section className="space-y-3 rounded-lg border-2 bg-card p-5">
      <h3 className="text-lg font-bold">Dashboard administrators</h3>
      <p className="text-sm text-muted-foreground">
        Administrators can view all metrics and grant administrator access to others. Use the email
        they sign into this app with.
      </p>
      {query.isPending && <p role="status">Loading administrators...</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data && (
        <ul className="space-y-1 text-sm">
          {query.data.map((address) => (
            <li key={address} className="break-all">
              {address}
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            const result = await add({ data: { email } });
            setEmail("");
            await query.refetch();
            toast.success(`Administrator access granted to ${result.email}`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not add administrator");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block text-sm font-bold" htmlFor="administrator-email">
          Administrator email
        </label>
        <input
          id="administrator-email"
          type="email"
          required
          maxLength={254}
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border-2 bg-background px-3 py-2"
          placeholder="person@example.com"
        />
        <Button type="submit" disabled={busy || !email.trim() || !query.data}>
          {busy ? "Adding..." : "Grant administrator access"}
        </Button>
      </form>
    </section>
  );
}
