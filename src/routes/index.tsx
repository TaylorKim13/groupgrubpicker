import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createRoom, joinRoom, listPublicRooms } from "@/lib/room.functions";
import { saveSession } from "@/lib/session";
import { AVATARS } from "@/lib/restaurants";
import { ProfilePicker } from "@/components/ProfilePicker";
import { Button } from '@/components/ui/button';
import { Onboarding } from '@/components/Onboarding';
import { useAccount } from '@/components/AccountProvider';
import { getAccount } from '@/lib/account.functions';
import { ArrowLeft, ArrowRight, Plus, Users, UserRound } from 'lucide-react';

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GROUP GRUB v1 — vote on where to eat" },
      { name: "description", content: "Start a room, share the code, set filters, and let the group vote on where to eat." },
      { property: "og:title", content: "GROUP GRUB v1 — vote on where to eat" },
      { property: "og:description", content: "Start a room, share the code, and let the group vote on where to eat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const user = useAccount();
  const accountFn = useServerFn(getAccount);
  const account = useQuery({ queryKey: ['account', user?.id], queryFn: () => accountFn(), enabled: !!user });
  const [mode, setMode] = useState<'host' | 'join' | null>(null);
  useEffect(() => { if (account.data) { setNickname(account.data.profile.display_name); setAvatar(account.data.profile.avatar); } }, [account.data]);
  const create = useServerFn(createRoom);
  const join = useServerFn(joinRoom);
  const list = useServerFn(listPublicRooms);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[0] ?? "🍕");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const rooms = useQuery({ queryKey: ["public-rooms"], queryFn: () => list(), refetchInterval: 10000 });

  async function go(kind: "host" | "join", joinCode?: string) {
    if (!nickname.trim()) {
      toast.error("Pick a nickname first");
      return;
    }
    setBusy(true);
    try {
      const s =
        kind === "host"
          ? await create({ data: { nickname, avatar } })
          : await join({ data: { nickname, avatar, code: (joinCode ?? code).toUpperCase() } });
      saveSession(s);
      navigate({ to: "/room/$code", params: { code: s.code } });
    } catch (e: any) {
      toast.error(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <header className="flex items-center justify-between gap-3 border-b-2 pb-5">
        <Link to="/" className="font-display text-2xl font-extrabold">GROUP<span className="text-primary"> GRUB</span> <span className="text-xs text-muted-foreground">v1</span></Link>
        <Button variant="ghost" asChild><Link to="/account"><UserRound />{user ? 'Your table' : 'Sign in'}</Link></Button>
      </header>
      <div className="pt-12 pb-8"><p className="text-sm font-bold uppercase text-primary">Good food. Group decision.</p><h1 className="mt-3 text-4xl font-extrabold leading-tight">{mode ? 'Who’s coming to the table?' : 'Where are we eating?'}</h1></div>
      {!mode ? <section className="space-y-4">
        <Button className="h-auto w-full justify-between whitespace-normal rounded-lg px-6 py-6 text-left text-xl font-bold chunky" onClick={() => setMode('host')}><span className="flex items-center gap-3"><Plus />Start a new table</span><ArrowRight /></Button>
        <Button variant="secondary" className="h-auto w-full justify-between whitespace-normal rounded-lg px-6 py-6 text-left text-xl font-bold chunky" onClick={() => setMode('join')}><span className="flex items-center gap-3"><Users />Join friends</span><ArrowRight /></Button>
      </section> : <section>
        <Button variant="ghost" className="mb-4" onClick={() => setMode(null)}><ArrowLeft />Back</Button>
        <ProfilePicker {...{ nickname, setNickname, avatar, setAvatar }} />
        {mode === 'join' && <div className="mt-6"><label htmlFor="room-code" className="text-sm font-bold">Room code</label><input id="room-code" value={code} onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))} placeholder="6-character code" className="mt-2 w-full rounded-lg border-2 bg-card px-4 py-3 font-display text-xl uppercase" /></div>}
        <Button disabled={busy || !nickname.trim() || (mode === 'join' && code.length !== 6)} onClick={() => go(mode)} className="mt-6 h-12 w-full text-lg font-bold chunky">{busy ? 'Setting the table…' : mode === 'host' ? 'Create table' : 'Join the table'}<ArrowRight /></Button>
      </section>}
      <details className="mt-10 border-t-2 pt-5"><summary className="cursor-pointer font-bold">Browse open tables {rooms.data?.length ? `(${rooms.data.length})` : ''}</summary>
        <ul className="mt-4 divide-y-2">{rooms.data?.length ? rooms.data.map((r: { code: string; label: string; status: string; members: number }) => <li key={r.code} className="flex items-center justify-between gap-3 py-3"><div><p className="font-bold">{r.label || r.code}</p><p className="text-xs text-muted-foreground">{r.code} · {r.members} at the table</p></div><Button variant="secondary" onClick={() => { setMode('join'); setCode(r.code); }}>Join</Button></li>) : <li className="text-sm text-muted-foreground">No public rooms right now.</li>}</ul>
      </details>
      <footer className="mt-8 flex justify-center"><Onboarding /></footer>
    </main>
  );
}
