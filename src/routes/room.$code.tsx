import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ProfilePicker } from "@/components/ProfilePicker";
import { RestaurantMap } from "@/components/RestaurantMap";
import { Reveal } from "@/components/Reveal";
import type { Result } from "@/lib/room.functions";
import {
  castVote,
  closeVoting,
  geocodeCenter,
  getRoomState,
  joinRoom,
  nominate,
  searchPlaces,
  startVoting,
  updateSettings,
} from "@/lib/room.functions";
import { AVATARS, DIETS, distanceKm, priceLabel, type Restaurant, type RoomSettings } from "@/lib/restaurants";
import { clearSession, loadSession, saveSession, type Session } from "@/lib/session";

export const Route = createFileRoute("/room/$code")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `Room ${params.code} — GROUP GRUB` },
      { name: "description", content: "You've been invited to vote on where the group eats." },
      { property: "og:title", content: `Join room ${params.code} on GROUP GRUB` },
      { property: "og:description", content: "You've been invited to vote on where the group eats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => setSession(loadSession(code)), [code]);
  if (session === undefined) return null;
  if (!session) return <JoinGate code={code} onJoined={setSession} />;
  return <Room session={session} onLeave={() => (clearSession(code), setSession(null))} />;
}

function JoinGate({ code, onJoined }: { code: string; onJoined: (s: Session) => void }) {
  const join = useServerFn(joinRoom);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[1]!);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto max-w-md px-5 py-14">
      <Link to="/" className="font-display text-2xl font-extrabold">
        GROUP<span className="text-primary"> GRUB</span>
      </Link>
      <div className="mt-6 rounded-2xl bg-card p-6 chunky">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">You're invited to room</p>
        <p className="mb-5 font-display text-4xl tracking-[0.25em]">{code.toUpperCase()}</p>
        <ProfilePicker {...{ nickname, setNickname, avatar, setAvatar }} />
        <button
          disabled={busy || !nickname.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const s = await join({ data: { code: code.toUpperCase(), nickname, avatar } });
              saveSession(s);
              onJoined(s);
            } catch (e: any) {
              toast.error(e.message);
            } finally {
              setBusy(false);
            }
          }}
          className="mt-6 w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground chunky disabled:opacity-50"
        >
          Join the table
        </button>
      </div>
    </main>
  );
}

type State = {
  code: string;
  status: "lobby" | "voting" | "closed";
  settings: RoomSettings;
  me: { id: string; isHost: boolean };
  members: { id: string; nickname: string; avatar: string; isHost: boolean; voted: boolean }[];
  pool: Restaurant[];
  myNomination: Restaurant | null;
  myVote: { want: string; could: string } | null;
  publicVotes: { memberId: string; want: string; could: string }[] | null;
  result: Result | null;
};

function Room({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const fetchState = useServerFn(getRoomState);
  const qc = useQueryClient();
  const key = ["room", session.code];
  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchState({ data: session }) as Promise<State>,
    refetchInterval: (query) => ((query.state.data as State | undefined)?.status === "closed" ? false : 2500),
    retry: 1,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (q.error && !q.data)
    return (
      <main className="mx-auto max-w-md px-5 py-20 text-center">
        <p className="text-lg">{(q.error as Error).message}</p>
        <button onClick={onLeave} className="mt-4 rounded-xl bg-secondary px-4 py-2 font-bold chunky">
          Join again
        </button>
      </main>
    );
  const s = q.data;
  if (!s) return <main className="grid min-h-screen place-items-center font-display text-2xl">Setting the table…</main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <TopBar s={s} onLeave={onLeave} />
      {s.status === "closed" && s.result ? (
        <div className="py-10">
          <Reveal result={s.result} />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-6">
            <Members s={s} session={session} refresh={refresh} />
            {s.me.isHost && s.status === "lobby" && <HostSettings s={s} session={session} refresh={refresh} />}
            {s.status === "lobby" && !s.me.isHost && <SettingsSummary settings={s.settings} />}
          </aside>
          <section className="space-y-6">
            <Pool s={s} session={session} refresh={refresh} />
          </section>
        </div>
      )}
    </main>
  );
}

function TopBar({ s, onLeave }: { s: State; onLeave: () => void }) {
  const link = typeof window !== "undefined" ? `${window.location.origin}/room/${s.code}` : "";
  const phase = { lobby: "Lobby", voting: "Voting open", closed: "Winner!" }[s.status];
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-card p-4 chunky">
      <div className="flex items-center gap-4">
        <Link to="/" className="font-display text-2xl font-extrabold leading-none">
          GROUP<span className="text-primary"> GRUB</span>
        </Link>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase">{phase}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onLeave}
          className="rounded-lg border-2 bg-background px-3 py-2 text-sm font-bold"
        >
          ← Back
        </button>
        <span className="font-display text-3xl tracking-[0.25em]">{s.code}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(link);
            toast.success("Invite link copied");
          }}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground chunky"
        >
          Copy invite link
        </button>
      </div>
    </header>
  );
}

function Members({ s, session, refresh }: { s: State; session: Session; refresh: () => void }) {
  const start = useServerFn(startVoting);
  const close = useServerFn(closeVoting);
  const votedCount = s.members.filter((m) => m.voted).length;
  const run = async (fn: any) => {
    try {
      await fn({ data: session });
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  return (
    <div className="rounded-2xl bg-card p-5 chunky">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-extrabold">At the table</h2>
        {s.status === "voting" && (
          <span className="text-sm font-bold">
            {votedCount}/{s.members.length} voted
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {s.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full border-2 bg-background text-lg">{m.avatar}</span>
            <span className="flex-1 font-medium">
              {m.nickname}
              {m.id === s.me.id && <span className="text-muted-foreground"> (you)</span>}
              {m.isHost && <span className="ml-1 rounded bg-secondary px-1.5 text-[10px] font-bold uppercase">host</span>}
            </span>
            {s.status === "voting" && (
              <span className={`h-3 w-3 rounded-full border-2 ${m.voted ? "bg-success" : "bg-muted"}`} title={m.voted ? "Voted" : "Still deciding"} />
            )}
          </li>
        ))}
      </ul>
      {s.me.isHost && s.status === "lobby" && (
        <button onClick={() => run(start)} className="mt-5 w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground chunky">
          Open voting
        </button>
      )}
      {s.me.isHost && s.status === "voting" && (
        <button
          disabled={votedCount === 0}
          onClick={() => run(close)}
          className="mt-5 w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground chunky disabled:opacity-50"
        >
          Close voting & reveal
        </button>
      )}
      {!s.me.isHost && s.status === "lobby" && <p className="mt-4 text-sm text-muted-foreground">Waiting for the host to open voting…</p>}
    </div>
  );
}

function SettingsSummary({ settings: st }: { settings: RoomSettings }) {
  return (
    <div className="rounded-2xl bg-card p-5 text-sm chunky">
      <h2 className="mb-2 text-xl font-extrabold">House rules</h2>
      <p>📍 {st.center.label}</p>
      <p>📏 Within {st.radiusKm} km</p>
      <p>💸 {priceLabel(st.priceMin)}–{priceLabel(st.priceMax)}</p>
      <p>⏱ Max wait {st.maxWait} min</p>
      {st.diets.length > 0 && <p>🥦 {st.diets.join(", ")}</p>}
      <p>{st.anonymous ? "🙈 Anonymous voting" : "👀 Public voting"}</p>
    </div>
  );
}

function HostSettings({ s, session, refresh }: { s: State; session: Session; refresh: () => void }) {
  const save = useServerFn(updateSettings);
  const geo = useServerFn(geocodeCenter);
  const [st, setSt] = useState<RoomSettings>(s.settings);
  const [addr, setAddr] = useState("");
  const [dirty, setDirty] = useState(false);
  const set = (p: Partial<RoomSettings>) => (setSt({ ...st, ...p }), setDirty(true));

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(async () => {
      try {
        await save({ data: { ...session, settings: st } });
        setDirty(false);
        refresh();
      } catch (e: any) {
        toast.error(e.message);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [st, dirty]);

  return (
    <div className="space-y-5 rounded-2xl bg-card p-5 chunky">
      <h2 className="text-xl font-extrabold">Host controls</h2>
      <div>
        <label className="text-xs font-bold uppercase">Search center</label>
        <p className="text-sm text-muted-foreground">{st.center.label}</p>
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              set({ center: await geo({ data: { ...session, address: addr } }) });
              setAddr("");
            } catch (err: any) {
              toast.error(err.message);
            }
          }}
        >
          <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Address or neighborhood" className="min-w-0 flex-1 rounded-lg border-2 bg-background px-3 py-2 text-sm" />
          <button disabled={addr.trim().length < 2} className="rounded-lg bg-secondary px-3 text-sm font-bold disabled:opacity-50">
            Set
          </button>
        </form>
        <button
          type="button"
          className="mt-1 text-xs underline"
          onClick={() =>
            navigator.geolocation?.getCurrentPosition(
              (p) => set({ center: { lat: p.coords.latitude, lng: p.coords.longitude, label: "My location" } }),
              () => toast.error("Couldn't get your location"),
            )
          }
        >
          Use my location
        </button>
      </div>
      <div>
        <label className="text-xs font-bold uppercase">Radius: {st.radiusKm} km</label>
        <Slider className="mt-3" min={0.5} max={20} step={0.5} value={[st.radiusKm]} onValueChange={([v]) => set({ radiusKm: v ?? 5 })} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase">Price range</label>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {[1, 2, 3, 4].map((p) => {
            const on = p >= st.priceMin && p <= st.priceMax;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  if (p < st.priceMin) set({ priceMin: p });
                  else if (p > st.priceMax) set({ priceMax: p });
                  else if (p === st.priceMin && p < st.priceMax) set({ priceMin: p + 1 });
                  else if (p === st.priceMax && p > st.priceMin) set({ priceMax: p - 1 });
                }}
                className={`rounded-md border-2 py-1.5 text-sm font-bold ${on ? "bg-primary text-primary-foreground" : "bg-background"}`}
              >
                {priceLabel(p)}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase">Dietary / allergy needs</label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DIETS.map((d) => {
            const on = st.diets.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => set({ diets: on ? st.diets.filter((x) => x !== d) : [...st.diets, d] })}
                className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-bold ${on ? "bg-secondary" : "bg-background"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase">Max wait: {st.maxWait} min</label>
        <Slider className="mt-3" min={5} max={120} step={5} value={[st.maxWait]} onValueChange={([v]) => set({ maxWait: v ?? 60 })} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Public lobby</span>
        <Switch checked={st.visibility === "public"} onCheckedChange={(c) => set({ visibility: c ? "public" : "private" })} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">Anonymous voting</span>
        <Switch checked={st.anonymous} onCheckedChange={(c) => set({ anonymous: c })} />
      </div>
      {dirty && <p className="text-xs text-muted-foreground">Saving…</p>}
    </div>
  );
}

function Pool({ s, session, refresh }: { s: State; session: Session; refresh: () => void }) {
  const vote = useServerFn(castVote);
  const [want, setWant] = useState<string | null>(s.myVote?.want ?? null);
  const [could, setCould] = useState<string | null>(s.myVote?.could ?? null);
  const [focus, setFocus] = useState<string | null>(null);
  const voting = s.status === "voting";
  const pool = s.pool;

  const tally = useMemo(() => {
    const m: Record<string, { want: string[]; could: string[] }> = {};
    s.publicVotes?.forEach((v) => {
      const name = s.members.find((x) => x.id === v.memberId)?.avatar ?? "•";
      (m[v.want] ??= { want: [], could: [] }).want.push(name);
      (m[v.could] ??= { want: [], could: [] }).could.push(name);
    });
    return m;
  }, [s.publicVotes, s.members]);

  const pick = (id: string, slot: "want" | "could") => {
    if (slot === "want") {
      setWant(id === want ? null : id);
      if (could === id) setCould(null);
    } else {
      setCould(id === could ? null : id);
      if (want === id) setWant(null);
    }
  };

  return (
    <>
      <div className="h-80 overflow-hidden rounded-2xl chunky md:h-96">
        <RestaurantMap center={s.settings.center} radiusKm={s.settings.radiusKm} pool={pool} highlight={focus ?? want} onSelect={(r) => setFocus(r.id)} />
      </div>

      {s.status !== "closed" && <Nominate s={s} session={session} refresh={refresh} />}

      {voting && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-secondary p-4 chunky">
          <div className="text-sm">
            <b>Want</b> (2 pts): {pool.find((r) => r.id === want)?.name ?? "—"} · <b>Could</b> (1 pt):{" "}
            {pool.find((r) => r.id === could)?.name ?? "—"}
          </div>
          <button
            disabled={!want || !could}
            onClick={async () => {
              try {
                await vote({ data: { ...session, want: want!, could: could! } });
                toast.success(s.myVote ? "Vote updated" : "Vote locked in");
                refresh();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
            className="rounded-xl bg-primary px-5 py-2 font-bold text-primary-foreground chunky disabled:opacity-50"
          >
            {s.myVote ? "Update vote" : "Submit vote"}
          </button>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-2xl font-extrabold">
          The pool <span className="text-base font-normal text-muted-foreground">({pool.length} spots)</span>
        </h2>
        {pool.length === 0 && (
          <p className="rounded-xl border-2 border-dashed p-6 text-center text-muted-foreground">
            Nothing matches these filters. Widen the radius, price, or wait time — or nominate a spot.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {pool.map((r) => (
            <RestaurantCard
              key={r.id}
              r={r}
              center={s.settings.center}
              focused={focus === r.id}
              onFocus={() => setFocus(r.id)}
              voting={voting}
              want={want === r.id}
              could={could === r.id}
              onPick={(slot) => pick(r.id, slot)}
              tally={tally[r.id]}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function RestaurantCard({
  r,
  center,
  voting,
  want,
  could,
  onPick,
  focused,
  onFocus,
  tally,
}: {
  r: Restaurant;
  center: RoomSettings["center"];
  voting: boolean;
  want: boolean;
  could: boolean;
  onPick: (s: "want" | "could") => void;
  focused: boolean;
  onFocus: () => void;
  tally?: { want: string[]; could: string[] } | undefined;
}) {
  return (
    <div
      onMouseEnter={onFocus}
      className={`rounded-xl border-2 bg-card p-4 transition ${want ? "ring-4 ring-primary" : could ? "ring-4 ring-secondary" : ""} ${focused ? "chunky" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-extrabold leading-tight">{r.name}</h3>
          <p className="text-sm text-muted-foreground">
            {r.cuisine} · {priceLabel(r.price)} · {distanceKm(center, r).toFixed(1)} km · ~{r.wait} min
          </p>
        </div>
        {r.custom && <span className="shrink-0 rounded bg-success px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">by {r.nominatedBy}</span>}
      </div>
      {r.diets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.diets.map((d) => (
            <span key={d} className="rounded-full bg-muted px-2 text-[11px]">
              {d}
            </span>
          ))}
        </div>
      )}
      {tally && (
        <p className="mt-2 text-xs">
          {tally.want.length > 0 && <>Want: {tally.want.join(" ")} </>}
          {tally.could.length > 0 && <>· Could: {tally.could.join(" ")}</>}
        </p>
      )}
      {voting && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => onPick("want")} className={`rounded-lg border-2 py-1.5 text-sm font-bold ${want ? "bg-primary text-primary-foreground" : "bg-background"}`}>
            {want ? "★ Want" : "Want"}
          </button>
          <button onClick={() => onPick("could")} className={`rounded-lg border-2 py-1.5 text-sm font-bold ${could ? "bg-secondary" : "bg-background"}`}>
            {could ? "☆ Could" : "Could"}
          </button>
        </div>
      )}
    </div>
  );
}

function Nominate({ s, session, refresh }: { s: State; session: Session; refresh: () => void }) {
  const search = useServerFn(searchPlaces);
  const nom = useServerFn(nominate);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Restaurant[] | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = !!s.myVote;

  const submit = async (r: Restaurant | null) => {
    try {
      await nom({ data: { ...session, restaurant: r } });
      setResults(null);
      setQ("");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="rounded-2xl bg-card p-5 chunky">
      <h2 className="text-xl font-extrabold">Your wildcard pick</h2>
      {s.myNomination ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm">
            You nominated <b>{s.myNomination.name}</b>.
          </p>
          {!locked && (
            <button onClick={() => submit(null)} className="text-sm underline">
              Remove
            </button>
          )}
        </div>
      ) : locked ? (
        <p className="mt-1 text-sm text-muted-foreground">Nominations lock once you've voted.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Add one real restaurant to the group pool.</p>
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                setResults(await search({ data: { ...session, query: q } }));
              } catch (err: any) {
                toast.error(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a restaurant…" className="min-w-0 flex-1 rounded-lg border-2 bg-background px-3 py-2" />
            <button disabled={busy || q.trim().length < 2} className="rounded-lg bg-secondary px-4 font-bold chunky disabled:opacity-50">
              {busy ? "…" : "Search"}
            </button>
          </form>
          {results && (
            <ul className="mt-3 divide-y-2 rounded-lg border-2">
              {results.length === 0 && <li className="p-3 text-sm text-muted-foreground">No matches.</li>}
              {results.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.address}</p>
                  </div>
                  <button onClick={() => submit(r)} className="shrink-0 rounded-md bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">
                    Nominate
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
