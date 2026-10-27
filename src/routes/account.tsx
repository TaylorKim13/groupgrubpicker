import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAccount } from "@/components/AccountProvider";
import { SignInPanel } from "@/components/SignInPanel";
import { SocialPanel } from "@/components/SocialPanel";
import { AccountPreferences } from "@/components/AccountPreferences";
import { AccountSettings } from "@/components/AccountSettings";
import { supabase } from "@/integrations/supabase/client";
import { getAccount } from "@/lib/account.functions";
import { getGroupHistory } from "@/lib/room.functions";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Your table - GROUP GRUB" },
      {
        name: "description",
        content: "Your account, hosting preferences, friends, and group history.",
      },
    ],
  }),
  component: AccountPage,
});
function AccountPage() {
  const user = useAccount();
  const fetchAccount = useServerFn(getAccount);
  const fetchHistory = useServerFn(getGroupHistory);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const account = useQuery({
    queryKey: ["account", user?.id],
    queryFn: () => fetchAccount(),
    enabled: !!user,
  });
  const history = useQuery({
    queryKey: ["group-history", user?.id],
    queryFn: () => fetchHistory(),
    enabled: !!user,
  });
  async function leave(deleted = false) {
    await qc.cancelQueries();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error && !deleted) throw error;
    if (deleted)
      for (const key of Object.keys(localStorage))
        if (key.startsWith("groupgrub:")) localStorage.removeItem(key);
    qc.clear();
    await navigate({ to: "/account", replace: true });
  }
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <Button asChild variant="ghost">
        <Link to="/">Home</Link>
      </Button>
      <h1 className="my-6 text-4xl font-extrabold">Your table</h1>
      {!user ? (
        <section className="border-y-2 py-8">
          <h2 className="text-2xl font-bold">Keep your favorites for next time</h2>
          <p className="mt-3 text-muted-foreground">
            Save hosting preferences, add friends, and revisit your picks. You can always join a
            room as a guest.
          </p>
          <SignInPanel />
        </section>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <SocialPanel userId={user.id} />
            <section className="py-6">
              <h2 className="text-2xl font-bold">Past & current groups</h2>
              {history.isPending ? (
                <p className="mt-3">Loading groups…</p>
              ) : history.error ? (
                <p role="alert">
                  Could not load groups.{" "}
                  <Button variant="link" onClick={() => history.refetch()}>
                    Try again
                  </Button>
                </p>
              ) : !history.data?.length ? (
                <p className="mt-3 text-muted-foreground">
                  Your groups will appear here after you join while signed in.
                </p>
              ) : (
                <ul className="mt-4 divide-y-2">
                  {history.data.map((r, i) => (
                    <li key={`${r.code}-${i}`} className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{r.winner ?? r.label ?? r.code}</p>
                          <p className="text-sm text-muted-foreground">
                            {r.code} · {new Date(r.joinedAt).toLocaleDateString()} ·{" "}
                            {r.status === "closed"
                              ? "Finished"
                              : r.status === "voting"
                                ? "Voting"
                                : "Getting ready"}
                          </p>
                          {r.votingStartedAt && r.closedAt && (
                            <p className="text-xs text-muted-foreground">
                              Decided in{" "}
                              {Math.max(
                                1,
                                Math.round(
                                  (Date.parse(r.closedAt) - Date.parse(r.votingStartedAt)) / 60000,
                                ),
                              )}{" "}
                              min
                            </p>
                          )}
                        </div>
                        <Button asChild variant="outline">
                          <Link to="/room/$code" params={{ code: r.code }}>
                            Open
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </TabsContent>
          {(["preferences", "settings"] as const).map((tab) => (
            <TabsContent value={tab} key={tab}>
              {account.isPending ? (
                <p className="py-6">Loading your account...</p>
              ) : account.error || !account.data ? (
                <p role="alert" className="py-6">
                  Could not load your account.{" "}
                  <Button variant="link" onClick={() => void account.refetch()}>
                    Try again
                  </Button>
                </p>
              ) : tab === "preferences" ? (
                <AccountPreferences
                  initialSettings={account.data.settings}
                  initialUnit={account.data.distanceUnit}
                  refresh={() => account.refetch()}
                />
              ) : (
                <AccountSettings
                  user={user}
                  profile={account.data.profile}
                  refresh={() => account.refetch()}
                  leave={leave}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </main>
  );
}
