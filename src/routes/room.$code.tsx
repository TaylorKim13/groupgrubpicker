import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ThemeControl } from "@/components/ThemeControl";
import { useSelectionTracking } from "@/components/useSelectionTracking";
import { RoomInvite } from "@/components/RoomInvite";
import { RoomCodeSchema, normalizeRoomCode } from "@/lib/room-access";
import { RoomSettingsFields } from "@/components/RoomSettingsFields";
import { Button } from "@/components/ui/button";
import { useDistanceUnit } from "@/lib/distance-context";
import { formatDistance, SettingsSchema } from "@/lib/settings";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ProfilePicker } from "@/components/ProfilePicker";
import { RestaurantMap } from "@/components/RestaurantMap";
import { Reveal } from "@/components/Reveal";
import { ShareWaitButton } from "@/components/ShareWaitButton";
import { ShareInviteButton } from "@/components/ShareInviteButton";
import type { Result } from "@/lib/room.functions";
import {
  castVote,
  kickMember,
  closeVoting,
  geocodeCenter,
  getRoomState,
  joinRoom,
  nominate,
  searchPlaces,
  startVoting,
  updateSettings,
  saveRoomPreferences,
  applyRoomPreferences,
} from "@/lib/room.functions";
import {
  AVATARS,
  distanceKm,
  priceLabel,
  type Restaurant,
  type RoomSettings,
} from "@/lib/restaurants";
import { clearSession, loadSession, saveSession, type Session } from "@/lib/session";
import { useAccount } from "@/components/AccountProvider";
import { useSocial } from "@/components/SocialPanel";
import { addFriendFromRoom, inviteFriendsToTable, linkSeatToAccount } from "@/lib/social.functions";

export const Route = createFileRoute("/room/$code")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `Room ${params.code} — GROUP GRUB` },
      { name: "description", content: "You've been invited to vote on where the group eats." },
      { property: "og:title", content: `Join room ${params.code} on GROUP GRUB` },
      {
        property: "og:description",
        content: "You've been invited to vote on where the group eats.",
      },
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
  const validCode = RoomCodeSchema.safeParse(code).success;
  return (
    <main className="mx-auto max-w-md px-5 py-14">
      <Link to="/" className="font-display text-2xl font-extrabold">
        GROUP<span className="text-primary"> GRUB</span>
      </Link>
      <div className="mt-6 rounded-2xl bg-card p-6 chunky">
        <p className="text-sm uppercase tracking-wide text-muted-foreground">
          You're invited to room
        </p>
        <p className="mb-5 font-display text-4xl tracking-[0.25em]">{code.toUpperCase()}</p>
        {!validCode && (
          <p role="alert" className="mb-4 text-destructive">
            This invite link needs a 6-character room code. Ask your friend for a new link.
          </p>
        )}

        {validCode && (
          <div className="mb-5">
            <ShareInviteButton code={code} />
          </div>
        )}

        <p className="mb-4 text-sm text-muted-foreground">
          No account needed. Choose a nickname and join.
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !validCode || !nickname.trim()) return;

            setBusy(true);
            try {
              const seat = await join({
                data: { code: normalizeRoomCode(code), nickname, avatar },
              });
              saveSession(seat);
              onJoined(seat);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not join this group");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy || !validCode}>
            <ProfilePicker autoFocus {...{ nickname, setNickname, avatar, setAvatar }} />
            <button
              type="submit"
              disabled={busy || !validCode || !nickname.trim()}
              className="mt-6 w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground chunky disabled:opacity-50"
            >
              {busy ? "Joining..." : "Join the table"}
            </button>
          </fieldset>
        </form>
      </div>
    </main>
  );
}

type State = {
  code: string;
  status: "lobby" | "voting" | "closed";
  settings: RoomSettings;
  me: { id: string; isHost: boolean; linked: boolean };
  members: {
    id: string;
    nickname: string;
    avatar: string;
    isHost: boolean;
    hasAccount: boolean;
    voted: boolean;
  }[];
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
    refetchInterval: (query) =>
      (query.state.data as State | undefined)?.status === "closed" ? false : 2500,
    retry: 1,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (q.error && (!q.data || q.error.message === "Not a member of this room"))
    return (
      <main className="mx-auto max-w-md px-5 py-20 text-center">
        <p className="text-lg">
          {q.error.message === "Not a member of this room"
            ? "You no longer have access to this table. The host may have removed you."
            : q.error.message}
        </p>
        <button
          onClick={onLeave}
          className="mt-4 rounded-xl bg-secondary px-4 py-2 font-bold chunky"
        >
          Join again
        </button>
      </main>
    );
  const s = q.data;
  if (!s)
    return (
      <main className="grid min-h-screen place-items-center font-display text-2xl">
        Setting the table…
      </main>
    );

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
            <RoomFriends s={s} session={session} refresh={refresh} />
            {s.me.isHost && s.status === "lobby" && (
              <HostSettings s={s} session={session} refresh={refresh} />
            )}
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
  const phase = { lobby: "Lobby", voting: "Voting open", closed: "Winner!" }[s.status];
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-card p-4 chunky">
      <div className="flex items-center gap-4">
        <Link to="/" className="font-display text-2xl font-extrabold leading-none">
          GROUP<span className="text-primary"> GRUB</span>
        </Link>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold uppercase">
          {phase}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onLeave}
          className="rounded-lg border-2 bg-background px-3 py-2 text-sm font-bold"
        >
          ← Back
        </button>
        <RoomInvite code={s.code} />
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
        <ShareInviteButton code={s.code} />
      </div>
    </header>
  );
}

function Members({ s, session, refresh }: { s: State; session: Session; refresh: () => void }) {
  const kick = useServerFn(kickMember);
  const [removing, setRemoving] = useState<string | null>(null);
  const start = useServerFn(startVoting);
  const close = useServerFn(closeVoting);
  const votedCount = s.members.filter((m) => m.voted).length;
  const user = useAccount();
  const addFriend = useServerFn(addFriendFromRoom);
  const [asked, setAsked] = useState<Set<string>>(new Set());
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
        <h2 className="text-xl font-extrabold">At the table ({s.members.length})</h2>
        {s.status === "voting" && (
          <span className="text-sm font-bold">
            {votedCount}/{s.members.length} voted
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {s.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3">
            <ProfileAvatar
              avatar={m.avatar}
              name={m.nickname}
              className="h-9 w-9 border-2 bg-background text-lg"
            />
            <span className="flex-1 font-medium">
              {m.nickname}
              {m.id === s.me.id && <span className="text-muted-foreground"> (you)</span>}
              {m.isHost && (
                <span className="ml-1 rounded bg-secondary px-1.5 text-[10px] font-bold uppercase">
                  host
                </span>
              )}
            </span>
            {user && m.id !== s.me.id && m.hasAccount && (
              <button
                disabled={asked.has(m.id)}
                onClick={async () => {
                  try {
                    const r = await addFriend({ data: { ...session, targetMemberId: m.id } });
                    setAsked(new Set(asked).add(m.id));
                    toast.success(
                      r.status === "accepted"
                        ? "You're now friends"
                        : r.status === "already"
                          ? "Already friends"
                          : "Friend request sent",
                    );
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}
                className="rounded-md border-2 px-2 py-0.5 text-xs font-bold disabled:opacity-50"
              >
                {asked.has(m.id) ? "Sent" : "+ Friend"}
              </button>
            )}
            {s.me.isHost && !m.isHost && m.id !== s.me.id && s.status !== "closed" && (
              <button
                type="button"
                disabled={removing !== null}
                aria-label={`Remove ${m.nickname} from the table`}
                className="rounded-md border-2 px-2 py-0.5 text-xs font-bold text-destructive disabled:opacity-50"
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Remove ${m.nickname} from this table? Their vote and nomination will be removed too.`,
                    )
                  )
                    return;
                  setRemoving(m.id);
                  try {
                    await kick({ data: { ...session, targetMemberId: m.id } });
                    toast.success(`${m.nickname} removed from the table`);
                    refresh();
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Could not remove participant",
                    );
                  } finally {
                    setRemoving(null);
                  }
                }}
              >
                {removing === m.id ? "Removing..." : "Remove"}
              </button>
            )}
            {s.status === "voting" && (
              <span
                className={`h-3 w-3 rounded-full border-2 ${m.voted ? "bg-success" : "bg-muted"}`}
                title={m.voted ? "Voted" : "Still deciding"}
              />
            )}
          </li>
        ))}
      </ul>
      {s.me.isHost && s.status === "lobby" && (
        <button
          onClick={() => run(start)}
          className="mt-5 w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground chunky"
        >
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
      {!s.me.isHost && s.status === "lobby" && (
        <p className="mt-4 text-sm text-muted-foreground">Waiting for the host to open voting…</p>
      )}
    </div>
  );
}

function RoomFriends({ s, session, refresh }: { s: State; session: Session; refresh: () => void }) {
  const user = useAccount();
  const link = useServerFn(linkSeatToAccount);
  const invite = useServerFn(inviteFriendsToTable);
  const social = useSocial(user?.id);
  useEffect(() => {
    if (user && !s.me.linked)
      link({ data: session })
        .then(refresh)
        .catch(() => {});
  }, [user?.id, s.me.linked]);
  if (!user)
    return (
      <div className="rounded-2xl bg-card p-5 text-sm chunky">
        <p>
          <b>Want to add friends from this table?</b>
        </p>
        <p className="mt-1 text-muted-foreground">
          Sign in to send friend requests and invite your groups.
        </p>
        <Link to="/account" className="mt-3 inline-block font-bold underline">
          Sign in
        </Link>
      </div>
    );
  const d = social.data;
  if (!d || (!d.friends.length && !d.crews.length)) return null;
  const send = async (ids: string[]) => {
    try {
      const r = await invite({ data: { ...session, userIds: ids } });
      toast.success(`Invited ${r.sent}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const groups = d.crews.filter((c) => c.myStatus === "member");
  return (
    <div className="rounded-2xl bg-card p-5 chunky">
      <h2 className="text-xl font-extrabold">Invite friends</h2>
      {groups.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {groups.map((c) => {
            const ids = c.members
              .filter((m) => m.status === "member" && m.id !== user.id)
              .map((m) => m.id);
            return (
              <button
                key={c.id}
                disabled={!ids.length}
                onClick={() => send(ids)}
                className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-bold chunky disabled:opacity-50"
              >
                👥 {c.name}
              </button>
            );
          })}
        </div>
      )}
      <ul className="mt-3 space-y-1">
        {d.friends.map((f) => (
          <li key={f.id} className="flex items-center justify-between text-sm">
            <span>
              <ProfileAvatar avatar={f.avatar} name={f.name} /> {f.name}
            </span>
            <button onClick={() => send([f.id])} className="font-bold underline">
              Invite
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsSummary({ settings: st }: { settings: RoomSettings }) {
  const unit = useDistanceUnit();
  return (
    <div className="rounded-2xl bg-card p-5 text-sm chunky">
      <h2 className="mb-2 text-xl font-extrabold">House rules</h2>
      <p>📍 {st.center.label}</p>
      <p>📏 Within {formatDistance(st.radiusKm, unit)}</p>
      <p>
        💸 {priceLabel(st.priceMin)}–{priceLabel(st.priceMax)}
      </p>
      <p>⏱ Max wait {st.maxWait} min</p>
      {st.diets.length > 0 && <p>🥦 {st.diets.join(", ")}</p>}
      <p>{st.anonymous ? "🙈 Anonymous voting" : "👀 Public voting"}</p>
    </div>
  );
}

function HostSettings({
  s,
  session,
  refresh,
}: {
  s: State;
  session: Session;
  refresh: () => void;
}) {
  const save = useServerFn(updateSettings);
  const saveDefaults = useServerFn(saveRoomPreferences);
  const applyDefaults = useServerFn(applyRoomPreferences);
  const user = useAccount();
  const qc = useQueryClient();
  const [presetBusy, setPresetBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const geo = useServerFn(geocodeCenter);
  const [st, setSt] = useState<RoomSettings>(s.settings);
  const [dirty, setDirty] = useState(false);
  const unit = useDistanceUnit();
  const [step, setStep] = useState(0);
  const steps = ["Where", "Price & food", "Table rules"];

  const set = (p: Partial<RoomSettings>) => {
    setSt((current) => ({ ...current, ...p }));
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty) setSt(s.settings);
  }, [s.settings, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const validation = SettingsSchema.safeParse(st);
    if (!validation.success) {
      setSaveError(validation.error.issues[0]?.message ?? "Check your settings");
      return;
    }
    setSaveError("");
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        await save({ data: { ...session, settings: SettingsSchema.parse(st) } });
        if (!cancelled) {
          setDirty(false);
          refresh();
        }
      } catch (e: unknown) {
        if (!cancelled)
          setSaveError(e instanceof Error ? e.message : "Could not save room settings");
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [st, dirty, save, session, refresh]);

  return (
    <div className="space-y-5 rounded-2xl bg-card p-5 chunky">
      <h2 className="text-xl font-extrabold">Host controls</h2>
      <div className="flex flex-wrap gap-1.5 text-xs font-bold">
        <span className="rounded-full border-2 bg-background px-2.5 py-0.5">
          📍 {st.center.label.split(",")[0]} · {st.radiusKm} km
        </span>
        <span className="rounded-full border-2 bg-background px-2.5 py-0.5">
          {priceLabel(st.priceMin)}–{priceLabel(st.priceMax)} · ≤{st.maxWait} min
        </span>
        {st.diets.length > 0 && (
          <span className="rounded-full border-2 bg-background px-2.5 py-0.5">
            {st.diets.join(", ")}
          </span>
        )}
        <span className="rounded-full border-2 bg-background px-2.5 py-0.5">
          {st.visibility === "public" ? "Public" : "Private"} ·{" "}
          {st.anonymous ? "Secret votes" : "Open votes"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1" role="tablist">
        {steps.map((t, i) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={step === i}
            onClick={() => setStep(i)}
            className={`rounded-lg border-2 px-1 py-2 text-xs font-extrabold ${
              step === i ? "bg-primary text-primary-foreground" : "bg-background"
            }`}
          >
            {i + 1}. {t}
          </button>
        ))}
      </div>

      {step === 0 && (
        <>
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
              <input
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                placeholder="Address or neighborhood"
                className="min-w-0 flex-1 rounded-lg border-2 bg-background px-3 py-2 text-sm"
              />
              <button
                disabled={addr.trim().length < 2}
                className="rounded-lg bg-secondary px-3 text-sm font-bold disabled:opacity-50"
              >
                Set
              </button>
            </form>
            <button
              type="button"
              className="mt-1 text-xs underline"
              onClick={() =>
                navigator.geolocation?.getCurrentPosition(
                  (p) =>
                    set({
                      center: {
                        lat: p.coords.latitude,
                        lng: p.coords.longitude,
                        label: "My location",
                      },
                    }),
                  () => toast.error("Couldn't get your location"),
                )
              }
            >
              Use my location
            </button>
          </div>

          <div>
            <label className="text-xs font-bold uppercase">
              Radius: {st.radiusKm} km
            </label>
            <Slider
              className="mt-3"
              min={0.5}
              max={20}
              step={0.5}
              value={[st.radiusKm]}
              onValueChange={([v]) => set({ radiusKm: v ?? 5 })}
            />
          </div>
        </>
      )}

      {step === 1 && (
        <>
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
                      else if (p === st.priceMin && p < st.priceMax)
                        set({ priceMin: p + 1 });
                      else if (p === st.priceMax && p > st.priceMin)
                        set({ priceMax: p - 1 });
                    }}
                    className={`rounded-md border-2 py-1.5 text-sm font-bold ${
                      on ? "bg-primary text-primary-foreground" : "bg-background"
                    }`}
                  >
                    {priceLabel(p)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase">
              Dietary / allergy needs
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DIETS.map((d) => {
                const on = st.diets.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      set({
                        diets: on
                          ? st.diets.filter((x) => x !== d)
                          : [...st.diets, d],
                      })
                    }
                    className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-bold ${
                      on ? "bg-secondary" : "bg-background"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase">
              Max wait: {st.maxWait} min
            </label>
            <Slider
              className="mt-3"
              min={5}
              max={120}
              step={5}
              value={[st.maxWait]}
              onValueChange={([v]) => set({ maxWait: v ?? 60 })}
            />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">
              Public lobby
              <span className="block text-xs font-normal text-muted-foreground">
                Anyone can find and join from the start screen
              </span>
            </span>
            <Switch
              checked={st.visibility === "public"}
              onCheckedChange={(c) =>
                set({ visibility: c ? "public" : "private" })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Anonymous voting</span>
            <Switch
              checked={st.anonymous}
              onCheckedChange={(c) => set({ anonymous: c })}
            />
          </div>
        </>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
          className="text-sm font-bold underline disabled:opacity-30"
        >
          ← Back
        </button>
        {step < 2 ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="rounded-lg bg-secondary px-4 py-1.5 text-sm font-extrabold chunky"
          >
            Next →
          </button>
        ) : (
          <span className="text-sm font-bold">
            All set — open voting when ready
          </span>
        )}
      </div>

      {saveError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      ) : (
        dirty && <p className="text-xs text-muted-foreground">Saving...</p>
      )}

      {user && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={dirty || presetBusy}
            onClick={async () => {
              setPresetBusy(true);
              try {
                await saveDefaults({ data: session });
                await qc.invalidateQueries({ queryKey: ["account", user.id] });
                toast.success("Hosting preferences saved");
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Could not save preferences",
                );
              } finally {
                setPresetBusy(false);
              }
            }}
          >
            Save as my defaults
          </Button>

          <Button
            variant="outline"
            disabled={dirty || presetBusy}
            onClick={async () => {
              setPresetBusy(true);
              try {
                await applyDefaults({ data: session });
                refresh();
                toast.success("Saved defaults applied");
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Could not apply preferences",
                );
              } finally {
                setPresetBusy(false);
              }
            }}
          >
            Use my saved defaults
          </Button>
        </div>
      )}
    </div>
  );
}

function Pool({ s, session, refresh }: { s: State; session: Session; refresh: () => void }) {
  useSelectionTracking(session, s.status !== "closed" && !s.myVote);
  const vote = useServerFn(castVote);
  const [want, setWant] = useState<string | null>(s.myVote?.want ?? null);
  const [could, setCould] = useState<string | null>(s.myVote?.could ?? null);
  const [focus, setFocus] = useState<string | null>(null);
  const voting = s.status === "voting";
  const pool = s.pool;

  const tally = useMemo(() => {
    const m: Record<string, { want: string[]; could: string[] }> = {};
    s.publicVotes?.forEach((v) => {
      const name = s.members.find((x) => x.id === v.memberId)?.nickname ?? "•";
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
        <RestaurantMap
          center={s.settings.center}
          radiusKm={s.settings.radiusKm}
          pool={pool}
          highlight={focus ?? want}
          onSelect={(r) => setFocus(r.id)}
        />
      </div>

      {s.status !== "closed" && <Nominate s={s} session={session} refresh={refresh} />}

      {voting && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-secondary p-4 chunky">
          <div className="text-sm">
            <b>Want</b> (2 pts): {pool.find((r) => r.id === want)?.name ?? "—"} · <b>Could</b> (1
            pt): {pool.find((r) => r.id === could)?.name ?? "—"}
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
          The pool{" "}
          <span className="text-base font-normal text-muted-foreground">({pool.length} spots)</span>
        </h2>
        {pool.some((r) => r.google) && (
          <p className="mb-3 text-sm text-muted-foreground">
            Restaurants from Google Maps. Distance and known prices are filtered. Wait times and
            dietary or allergy suitability are not verified; confirm with the restaurant. Places
            without price data are included and marked.
          </p>
        )}
        {pool.length === 0 && (
          <p className="rounded-xl border-2 border-dashed p-6 text-center text-muted-foreground">
            Nothing matches these filters. Widen the radius, price, or wait time — or nominate a
            spot.
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
  const unit = useDistanceUnit();
  return (
    <div
      onMouseEnter={onFocus}
      className={`rounded-xl border-2 bg-card p-4 transition ${want ? "ring-4 ring-primary" : could ? "ring-4 ring-secondary" : ""} ${focused ? "chunky" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-extrabold leading-tight">{r.name}</h3>
          <p className="text-sm text-muted-foreground">
            {r.cuisine} · {r.priceUnknown ? "Price unknown" : priceLabel(r.price)} ·{" "}
            {formatDistance(distanceKm(center, r), unit)} ·{" "}
            {r.google ? "Wait unknown" : `~${r.wait} min`}
          </p>
        </div>
        {r.custom && (
          <span className="shrink-0 rounded bg-success px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
            by {r.nominatedBy}
          </span>
        )}
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
      <div className="mt-3">
        <ShareWaitButton restaurant={r} />
      </div>
      {voting && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => onPick("want")}
            className={`rounded-lg border-2 py-1.5 text-sm font-bold ${want ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {want ? "★ Want" : "Want"}
          </button>
          <button
            onClick={() => onPick("could")}
            className={`rounded-lg border-2 py-1.5 text-sm font-bold ${could ? "bg-secondary" : "bg-background"}`}
          >
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
          <p className="text-sm text-muted-foreground">
            Add one real restaurant to the group pool.
          </p>
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
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search a restaurant…"
              className="min-w-0 flex-1 rounded-lg border-2 bg-background px-3 py-2"
            />
            <button
              disabled={busy || q.trim().length < 2}
              className="rounded-lg bg-secondary px-4 font-bold chunky disabled:opacity-50"
            >
              {busy ? "…" : "Search"}
            </button>
          </form>
          {results && (
            <ul className="mt-3 divide-y-2 rounded-lg border-2">
              {results.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">No matches.</li>
              )}
              {results.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.address}</p>
                  </div>
                  <button
                    onClick={() => submit(r)}
                    className="shrink-0 rounded-md bg-primary px-3 py-1 text-sm font-bold text-primary-foreground"
                  >
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
