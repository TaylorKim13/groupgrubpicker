import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createRoom, joinRoom, listPublicRooms } from "@/lib/room.functions";
import { saveSession } from "@/lib/session";
import { AVATARS } from "@/lib/restaurants";
import { ProfilePicker } from "@/components/ProfilePicker";

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
  const create = useServerFn(createRoom);
  const join = useServerFn(joinRoom);
  const list = useServerFn(listPublicRooms);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const rooms = useQuery({ queryKey: ["public-rooms"], queryFn: () => list(), refetchInterval: 10000 });

  async function go(kind: "host" | "join", joinCode?: string) {
    if (!nickname.trim()) return toast.error("Pick a nickname first");
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
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-10">
        <p className="inline-block -rotate-2 rounded bg-secondary px-2 py-0.5 text-xs font-bold uppercase chunky">v1</p>
        <h1 className="mt-3 text-6xl font-extrabold leading-none tracking-tight md:text-8xl">
          GROUP<span className="text-primary"> GRUB</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Stop the "I don't care, you pick" loop. Start a room, set the rules, everyone votes, one place wins.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl bg-card p-6 chunky">
          <ProfilePicker {...{ nickname, setNickname, avatar, setAvatar }} />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <button
              disabled={busy}
              onClick={() => go("host")}
              className="rounded-xl bg-primary px-5 py-4 text-lg font-bold text-primary-foreground chunky transition active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-60"
            >
              Host a room
            </button>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="CODE"
                aria-label="Room code"
                className="w-full min-w-0 rounded-xl border-2 bg-background px-3 text-center font-display text-xl tracking-[0.3em] uppercase"
              />
              <button
                disabled={busy || code.length !== 6}
                onClick={() => go("join")}
                className="rounded-xl bg-secondary px-4 font-bold chunky disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-card p-6 chunky">
          <h2 className="text-2xl font-extrabold">Open tables</h2>
          <p className="text-sm text-muted-foreground">Public rooms you can hop into.</p>
          <ul className="mt-4 space-y-2">
            {rooms.data?.length ? (
              rooms.data.map((r) => (
                <li key={r.code} className="flex items-center justify-between rounded-lg border-2 px-3 py-2">
                  <div>
                    <div className="font-display text-lg tracking-widest">{r.code}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.label} · {r.members} in · {r.status}
                    </div>
                  </div>
                  <button onClick={() => go("join", r.code)} className="rounded-md bg-secondary px-3 py-1 text-sm font-bold">
                    Join
                  </button>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">No public rooms right now.</li>
            )}
          </ul>
        </section>
      </div>
      <p className="mt-10 text-center text-xs text-muted-foreground">
        Got a link? It'll bring you straight to the room. <Link to="/" className="underline">Home</Link>
      </p>
    </main>
  );
}
