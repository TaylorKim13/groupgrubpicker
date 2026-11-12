import { useRoomPresence } from "@/components/useRoomPresence";
import { PhotoBanner } from "@/components/PhotoBanner";
import { googlePriceLabel, directionsUrl } from "@/lib/restaurant-info";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ThemeControl } from "@/components/ThemeControl";
import { Onboarding } from "@/components/Onboarding";
import { useSelectionTracking } from "@/components/useSelectionTracking";
import { RoomInvite } from "@/components/RoomInvite";
import { VotingWaitGame } from "@/components/VotingWaitGame";
import { completeCreationClickTracking } from "@/lib/creation-click-tracking";
import { RoomCodeSchema, normalizeRoomCode } from "@/lib/room-access";
import { RoomSettingsFields } from "@/components/RoomSettingsFields";
import { DiningPanel } from "@/components/DiningPanel";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useDistanceUnit } from "@/lib/distance-context";
import { formatDistance, SettingsSchema } from "@/lib/settings";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Gift, UserRound } from "lucide-react";
import { ProfilePicker } from "@/components/ProfilePicker";
import { RestaurantMap } from "@/components/RestaurantMap";
import { GooglePopularTimes } from "@/components/GooglePopularTimes";
import { Reveal } from "@/components/Reveal";
import { ShareWaitButton } from "@/components/ShareWaitButton";
import { RestaurantDealIndicators } from "@/components/RestaurantDeals";
import { ShareInviteButton } from "@/components/ShareInviteButton";
import type { Result } from "@/lib/room.functions";
import {
  useRestaurantDeals,
  type RestaurantDeal,
} from "@/lib/restaurant-deals";
import { getRewardRestaurants } from "@/lib/account.functions";
import { hasRewardMatch, type RewardRestaurant } from "@/lib/restaurant-rewards";
import {
  castVote,
  kickMember,
  closeVoting,
  geocodeCenter,
  getRoomState,
  finalizeRoomSetup,
  joinRoom,
  nominate,
  addRestaurantToPool,
  removeRestaurantFromPool,
  searchPlaces,
  startVoting,
  updateSettings,
  saveRoomPreferences,
  applyRoomPreferences,
} from "@/lib/room.functions";
import {
  AVATARS,
  DIETS,
  distanceKm,
  priceLabel,
  priceRangeLabel,
  type Restaurant,
  type RoomSettings,
} from "@/lib/restaurants";
import { clearSession, loadSession, saveSession, type Session } from "@/lib/session";
import { useAccount } from "@/components/AccountProvider";
import { useSocial } from "@/components/SocialPanel";
import {
  addFriendFromRoom,
  inviteFriendsToTable,
  linkSeatToAccount,
} from "@/lib/social.functions";

export const Route = createFileRoute("/room/$code")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { setup?: "pool" } =>
    search["setup"] === "pool" ? { setup: "pool" } : {},
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
  const { setup } = Route.useSearch();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => setSession(loadSession(code)), [code]);
  if (session === undefined) return null;
  if (!session) return <JoinGate code={code} onJoined={setSession} />;
  return <Room session={session} onLeave={() => (clearSession(code), setSession(null))} setupFlow={setup === "pool"} />;
}

function JoinGate({ code, onJoined }: { code: string; onJoined: (s: Session) => void }) {
  const join = useServerFn(joinRoom);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[1]!);
  const [busy, setBusy] = useState(false);
  const validCode = RoomCodeSchema.safeParse(code).success;
  return (
    <main className="home-shell home-shell-create home-shell-join">
      <div className="create-photo-area">
      <header className="home-header">
        <Link to="/" className="brand-wordmark text-4xl">
          GROUP<span className="text-brand"> GRUB</span>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeControl />
          <Button variant="ghost" asChild>
            <Link to="/account"><UserRound /> Your account</Link>
          </Button>
        </div>
      </header>
      <section className="home-form" aria-labelledby="invite-title">
        <h1 id="invite-title" className="mb-4 text-3xl font-semibold">Join your friends</h1>
        <Button variant="ghost" className="mb-4" asChild>
          <Link to="/"><ArrowLeft /> Back</Link>
        </Button>
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
            <Button
              type="submit"
              disabled={busy || !validCode || !nickname.trim()}
              className="mt-6 h-12 w-full text-lg font-bold chunky"
            >
              {busy ? "Joining..." : "Join the table"}
              <ArrowRight />
            </Button>
          </fieldset>
        </form>
      </section>
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
  candidates: Restaurant[];
  myNomination: Restaurant | null;
  myVote: { want: string; could: string } | null;
  publicVotes: { memberId: string; want: string; could: string }[] | null;
  result: Result | null;
};

function Room({
  session,
  onLeave,
  setupFlow: requestedSetupFlow,
}: {
  session: Session;
  onLeave: () => void;
  setupFlow: boolean;
}) {
  const navigate = useNavigate();
  const finalizeSetup = useServerFn(finalizeRoomSetup);
  const [requestedRestaurant, setRequestedRestaurant] = useState<{ id: string } | null>(null);
  const fetchState = useServerFn(getRoomState);
  const accountUser = useAccount();
  const fetchRewardRestaurants = useServerFn(getRewardRestaurants);
  const qc = useQueryClient();
  const key = ["room", session.code];
  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchState({ data: session }) as Promise<State>,
    refetchInterval: (query) =>
      (query.state.data as State | undefined)?.status === "closed" ? false : 2500,
    retry: 1,
  });
  useRoomPresence(session, q.data?.status !== "closed" && !q.error);
  const rewardQuery = useQuery({
    queryKey: ["account-reward-restaurants", accountUser?.id],
    queryFn: () => fetchRewardRestaurants(),
    enabled: !!accountUser,
  });
  const rewardRestaurants: RewardRestaurant[] = rewardQuery.data?.restaurants ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const addToPool = useServerFn(addRestaurantToPool);
  const addRestaurant = async (restaurant: Restaurant) => {
    try {
      await addToPool({ data: { ...session, restaurant } });
      toast.success(`${restaurant.name} added to the voting pool`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add restaurant");
    }
  };

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
          className="mt-4 rounded-xl bg-secondary px-4 py-2 font-bold text-secondary-foreground chunky"
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

  const setupFlow = requestedSetupFlow && s.me.isHost && s.status === "lobby";
  const createRoom = async () => {
    try {
      await finalizeSetup({ data: session });
      completeCreationClickTracking(session);
      await navigate({ to: "/room/$code", params: { code: session.code }, search: {} });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the room");
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      {setupFlow ? <PoolSetupHeader /> : <TopBar s={s} />}
      {s.status !== "closed" && (
        <div className="pb-2 pt-4">
          <h1 className="mt-3 text-4xl font-extrabold leading-tight">
            {s.status === "lobby"
              ? setupFlow
                ? "Build the voting pool"
                : "Your table is ready"
              : "Cast your vote"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {s.status === "lobby" && setupFlow
              ? "Add restaurant suggestions, search nearby, and choose the places your group can vote on."
              : s.status === "lobby"
                ? "Share the room code, invite everyone to add restaurants, then open voting when your table is ready."
              : "Choose the restaurants you most want the group to try."}
          </p>
        </div>
      )}
      {s.status === "closed" && s.result ? (
        <div className="py-10">
          <Reveal
            result={s.result}
            hasRewards={hasRewardMatch(rewardRestaurants, s.result.winner.name)}
          />
          <DiningPanel
            session={session}
            status={s.status}
            isHost={s.me.isHost}
            linked={s.me.linked}
            pool={s.pool}
            rewardRestaurants={rewardRestaurants}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {!setupFlow && (s.status === "lobby" || s.status === "voting") && (
            <Members s={s} session={session} refresh={refresh} />
          )}
          <Pool
            requestedRestaurant={requestedRestaurant}
              setupFlow={setupFlow}
              onCreateRoom={() => void createRoom()}
            s={s}
            session={session}
            refresh={refresh}
            rewardRestaurants={rewardRestaurants}
            addRestaurant={addRestaurant}
            suggestionsPanel={
              <DiningPanel
                session={session}
                status={s.status}
                isHost={s.me.isHost}
                linked={s.me.linked}
                pool={s.pool}
                selectedPool={s.pool}
                onAddToPool={addRestaurant}
                onViewRestaurant={(id) => {
                  if (s.candidates.some((restaurant) => restaurant.id === id)) {
                    setRequestedRestaurant({ id });
                  } else {
                    toast.info("This recommendation is not on the nearby map. You can still add it to the pool.");
                  }
                }}
                rewardRestaurants={rewardRestaurants}
              />
            }
          />
          {!setupFlow && s.status === "lobby" && (
            <section className="space-y-6">
              <RoomFriends s={s} session={session} refresh={refresh} />
              {!s.me.isHost && <SettingsSummary settings={s.settings} />}
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function PoolSetupHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 pb-5">
      <Link to="/" className="font-display text-2xl font-extrabold">
        GROUP<span className="text-brand"> GRUB</span>
      </Link>
      <ThemeControl />
    </header>
  );
}

function TopBar({ s }: { s: State }) {
  const phase = { lobby: "Build your pool", voting: "Voting open", closed: "Winner!" }[s.status];
  return (
    <header className="border-b-2 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="font-display text-2xl font-extrabold leading-none">
          GROUP<span className="text-brand"> GRUB</span>
        </Link>
        <span className="text-xs font-medium text-muted-foreground">
          {phase}
        </span>
        <ThemeControl />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
        <Button variant="outline" asChild>
          <Link to="/"><ArrowLeft /> Back</Link>
        </Button>
        <RoomInvite code={s.code} />
        <div className="sm:justify-self-end">
          <ShareInviteButton code={s.code} />
        </div>
      </div>
    </header>
  );
}

function Members({ s, session, refresh }: { s: State; session: Session; refresh: () => void }) {
  const kick = useServerFn(kickMember);
  const [removing, setRemoving] = useState<string | null>(null);
  const votedCount = s.members.filter((m) => m.voted).length;
  const user = useAccount();
  const addFriend = useServerFn(addFriendFromRoom);
  const [asked, setAsked] = useState<Set<string>>(new Set());
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
      {s.status === "lobby" && (
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone here can add restaurant options to the pool below before voting opens.
        </p>
      )}
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
                <span className="ml-1 rounded bg-secondary px-1.5 text-[10px] font-bold uppercase text-secondary-foreground">
                  host
                </span>
              )}
            </span>
            {s.status === "voting" && (
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${m.voted ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
              >
                {m.voted ? "Voted" : "Not voted yet"}
              </span>
            )}
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
      if (r.sent === 0) {
        toast.info("No invitations sent. Recipients must be accepted friends or members of one of your groups.");
      } else {
        toast.success(`Invited ${r.sent} ${r.sent === 1 ? "person" : "people"}${r.skipped ? `. ${r.skipped} not eligible.` : ""}`);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const groups = d.crews.filter((c) => c.myStatus === "member");
  return (
    <div className="rounded-2xl bg-card p-5 chunky">
      <h2 className="text-xl font-semibold">Invite friends</h2>
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
                className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-bold text-secondary-foreground chunky disabled:opacity-50"
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
      <h2 className="mb-2 text-xl font-semibold">House rules</h2>
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
  const [addr, setAddr] = useState("");
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
      <h2 className="text-xl font-semibold">Host controls</h2>
      <div className="flex flex-wrap gap-1.5 text-xs font-bold">
        <span className="rounded-full border bg-background px-2.5 py-0.5">
          📍 {st.center.label.split(",")[0]} · {st.radiusKm} km
        </span>
        <span className="rounded-full border bg-background px-2.5 py-0.5">
          {priceLabel(st.priceMin)}–{priceLabel(st.priceMax)} · ≤{st.maxWait} min
        </span>
        {st.diets.length > 0 && (
          <span className="rounded-full border bg-background px-2.5 py-0.5">
            {st.diets.join(", ")}
          </span>
        )}
        <span className="rounded-full border bg-background px-2.5 py-0.5">
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
            className={`rounded-lg border px-1 py-2 text-xs font-semibold ${
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
                className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <button
                disabled={addr.trim().length < 2}
                className="rounded-lg bg-secondary px-3 text-sm font-bold text-secondary-foreground disabled:opacity-50"
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
            <label className="text-xs font-bold uppercase">Radius: {st.radiusKm} km</label>
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
                    aria-pressed={on}
                    onClick={() => {
                      if (p < st.priceMin) set({ priceMin: p });
                      else if (p > st.priceMax) set({ priceMax: p });
                      else if (p === st.priceMin && p < st.priceMax) set({ priceMin: p + 1 });
                      else if (p === st.priceMax && p > st.priceMin) set({ priceMax: p - 1 });
                    }}
                    className={`rounded-md border py-1.5 text-sm font-bold ${
                      on ? "bg-primary text-primary-foreground" : "bg-background"
                    }`}
                  >
                    <span className="block">{priceLabel(p)}</span>
                    <span className="block text-xs font-normal">{priceRangeLabel(p)}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Approximate USD per person, before tax and tip. Actual menu prices vary.</p>
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
                    onClick={() =>
                      set({
                        diets: on ? st.diets.filter((x) => x !== d) : [...st.diets, d],
                      })
                    }
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                      on ? "bg-secondary text-secondary-foreground" : "bg-background"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase">Max wait: {st.maxWait} min</label>
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
              onCheckedChange={(c) => set({ visibility: c ? "public" : "private" })}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Anonymous voting</span>
            <Switch checked={st.anonymous} onCheckedChange={(c) => set({ anonymous: c })} />
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
            className="rounded-lg bg-secondary px-4 py-1.5 text-sm font-semibold text-secondary-foreground chunky"
          >
            Next →
          </button>
        ) : (
          <span className="text-sm font-bold">All set — open voting when ready</span>
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
                toast.error(e instanceof Error ? e.message : "Could not save preferences");
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
                toast.error(e instanceof Error ? e.message : "Could not apply preferences");
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

function Pool({
  requestedRestaurant,
  setupFlow,
  onCreateRoom,
  s,
  session,
  refresh,
  rewardRestaurants,
  addRestaurant,
  suggestionsPanel,
}: {
  requestedRestaurant: { id: string } | null;
  setupFlow: boolean;
  onCreateRoom: () => void;
  s: State;
  session: Session;
  refresh: () => void;
  rewardRestaurants: RewardRestaurant[];
  addRestaurant: (restaurant: Restaurant) => Promise<void>;
  suggestionsPanel: ReactNode;
}) {
  useSelectionTracking(session, s.status !== "closed" && !s.myVote);
  const vote = useServerFn(castVote);
  const start = useServerFn(startVoting);
  const close = useServerFn(closeVoting);
  const [want, setWant] = useState<string | null>(s.myVote?.want ?? null);
  const [could, setCould] = useState<string | null>(s.myVote?.could ?? null);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Restaurant[] | null>(null);
  const [searching, setSearching] = useState(false);
  const voting = s.status === "voting";
  const votedCount = s.members.filter((member) => member.voted).length;
  const pool = s.pool;
  const candidates = s.candidates;
  const searchPlacesFn = useServerFn(searchPlaces);
  const removeFromPool = useServerFn(removeRestaurantFromPool);
  useEffect(() => {
    if (!requestedRestaurant) return;
    setFocus(requestedRestaurant.id);
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`restaurant-candidate-${requestedRestaurant.id}`)
        ?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
          block: "center",
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [requestedRestaurant]);
  const dealsByRestaurant = useRestaurantDeals(
    pool.map((restaurant) => restaurant.id),
    pool.map((restaurant) => restaurant.name),
  );
  const filteredPool = useMemo(() => {
    const query = restaurantSearch.trim().toLocaleLowerCase();
    if (!query) return pool;
    return pool.filter((restaurant) =>
      [restaurant.name, restaurant.cuisine, restaurant.address ?? ""]
        .some((value) => value.toLocaleLowerCase().includes(query)),
    );
  }, [pool, restaurantSearch]);

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

  const runRoomAction = async (action: (args: { data: Session }) => Promise<unknown>) => {
    try {
      await action({ data: session });
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the room");
    }
  };

  return (
    <>
      {s.status === "lobby" && (
        <section className="rounded-2xl border-2 border-primary bg-card p-5 chunky">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-extrabold">Voting pool ({pool.length})</h2>
            {s.me.isHost && (
              <p className="text-sm font-semibold text-muted-foreground">
                Select at least 2 restaurants before opening voting.
              </p>
            )}
          </div>
          {pool.length === 0 ? (
            <p className="mt-3 rounded-xl border-2 border-dashed p-5 text-center text-muted-foreground">
              No restaurants selected yet. Add places from search or AI suggestions below.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {pool.map((restaurant) => (
                <li key={restaurant.id} className="flex items-center justify-between gap-3 rounded-xl border-2 bg-background p-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{restaurant.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {restaurant.cuisine} · {restaurant.address ?? "Address unavailable"}
                    </p>
                  </div>
                  {s.me.isHost && (
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border-2 px-3 py-1.5 text-sm font-bold"
                      aria-label={`Remove ${restaurant.name} from voting pool`}
                      onClick={async () => {
                        try {
                          await removeFromPool({ data: { ...session, restaurantId: restaurant.id } });
                          toast.success(`${restaurant.name} removed from the voting pool`);
                          refresh();
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Could not remove restaurant");
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {setupFlow ? (
            <div className="mt-4 border-t pt-4">
              <Button
                type="button"
                className="w-full rounded-xl py-3 font-bold chunky"
                disabled={pool.length < 2}
                onClick={onCreateRoom}

              >
                Create Room
              </Button>
              {pool.length < 2 && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Add {2 - pool.length} more restaurant{pool.length === 1 ? "" : "s"} before creating the room.
                </p>
              )}
            </div>
          ) : s.me.isHost ? (
            <div className="mt-4 border-t pt-4">
              <Button
                type="button"
                className="w-full rounded-xl py-3 font-bold chunky"
                disabled={pool.length < 2}
                onClick={() => void runRoomAction(start)}

              >
                {pool.length < 2
                  ? `Choose at least 2 places (${pool.length} selected)`
                  : "Open voting"}
              </Button>
              {pool.length < 2 && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Add {2 - pool.length} more restaurant{pool.length === 1 ? "" : "s"} to the pool.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Waiting for the host to open voting…
            </p>
          )}
        </section>
      )}

      {s.status === "lobby" && suggestionsPanel}

      {s.status === "lobby" && (
        <section className="space-y-4 rounded-2xl bg-card p-5 chunky">
          <div>
            <h2 className="text-xl font-extrabold">Add a restaurant</h2>
            <p className="mt-1 text-sm text-muted-foreground">Search around the group’s location, or add one of the nearby places shown on the map.</p>
          </div>
          <form

            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (event) => {
              event.preventDefault();
              setSearching(true);
              try {
                setSearchResults(await searchPlacesFn({ data: { ...session, query: addSearch } }));
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Restaurant search failed");
              } finally {
                setSearching(false);
              }
            }}
          >
            <input
              type="search"
              minLength={2}
              value={addSearch}
              onChange={(event) => setAddSearch(event.target.value)}
              placeholder="Restaurant name, cuisine, or neighborhood"
              aria-label="Search for a restaurant to add"
              className="min-w-0 flex-1 rounded-xl border-2 bg-background px-4 py-3"
            />
            <Button type="submit" disabled={searching || addSearch.trim().length < 2}>
              {searching ? "Searching…" : "Search restaurants"}
            </Button>
          </form>
          {searchResults && (
            <div className="grid gap-2 sm:grid-cols-2">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matches found. Try another search.</p>
              ) : searchResults.map((restaurant) => {
                const added = pool.some((item) => item.id === restaurant.id);
                return (
                  <div key={restaurant.id} className="flex items-center justify-between gap-3 rounded-xl border-2 bg-background p-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{restaurant.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{restaurant.cuisine} · {restaurant.address ?? "Address unavailable"} · {restaurant.priceUnknown ? "Price unknown" : priceLabel(restaurant.price)}</p>
                    </div>
                    <Button type="button" size="sm" disabled={added} onClick={() => void addRestaurant(restaurant)}>
                      {added ? "Added" : "+ Add to pool"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="h-72 overflow-hidden rounded-xl border-2 md:h-96">
            <RestaurantMap
              center={s.settings.center}
              radiusKm={s.settings.radiusKm}
              pool={candidates}
              highlight={focus}
              onSelect={(restaurant) => setFocus(restaurant.id)}
              onAdd={addRestaurant}
            />
          </div>
          <div>
            <h3 className="mb-2 font-bold">Nearby restaurants</h3>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No nearby listings are available right now. Search for a restaurant by name.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {candidates.map((restaurant) => {
                  const added = pool.some((item) => item.id === restaurant.id);
                  return (
                    <div
                      id={`restaurant-candidate-${restaurant.id}`}
                      key={restaurant.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border-2 bg-background p-3 ${focus === restaurant.id ? "border-primary ring-2 ring-primary/30" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold">{restaurant.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{restaurant.cuisine} · {restaurant.priceUnknown ? "Price unknown" : priceLabel(restaurant.price)}</p>
                      </div>
                      <Button type="button" size="sm" disabled={added} onClick={() => void addRestaurant(restaurant)}>
                        {added ? "Added" : "+ Add to pool"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {voting && (
        <div className="flex justify-end">
          <Onboarding want={pool.find((restaurant) => restaurant.id === want) ?? null}
            could={pool.find((restaurant) => restaurant.id === could) ?? null}
            submissionCount={submissionCount} hasVoted={!!s.myVote || submissionCount > 0}
            isHost={s.me.isHost} onStart={() => setRestaurantSearch("")} />
        </div>
      )}
      {voting && (
        <div data-vote-guide="submit" className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-secondary p-4 text-secondary-foreground chunky">
          <div className="text-sm">
            <b>Want</b> (2 pts): {pool.find((r) => r.id === want)?.name ?? "—"} · <b>Could</b> (1
            pt): {pool.find((r) => r.id === could)?.name ?? "—"}
          </div>
          <button
            disabled={!want || !could || submitting}
            onClick={async () => {
              if (submitting || !want || !could) return;
              setSubmitting(true);
              try {
                await vote({ data: { ...session, want: want!, could: could! } });
                setSubmissionCount((count) => count + 1);
                toast.success(s.myVote ? "Vote updated" : "Vote locked in");
                refresh();
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setSubmitting(false);
              }
            }}
            className="rounded-xl bg-primary px-5 py-2 font-bold text-primary-foreground chunky disabled:opacity-50"
          >
            {submitting ? "Saving vote…" : s.myVote || submissionCount > 0 ? "Update vote" : "Submit vote"}
          </button>
        </div>
      )}

      {s.me.isHost && voting && (
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            className="rounded-xl px-5 py-3 font-bold chunky"
            disabled={votedCount === 0}
            onClick={() => void runRoomAction(close)}

          >
            End voting & reveal the winner
          </Button>
          {votedCount === 0 && (
            <p className="text-right text-xs text-muted-foreground">
              At least one vote is needed before revealing the winner.
            </p>
          )}
        </div>
      )}

      {voting && <div data-voting-pool>
        <h2 className="mb-3 text-2xl font-extrabold">
          The pool <span className="text-base font-normal text-muted-foreground">({filteredPool.length === pool.length ? `${pool.length}` : `${filteredPool.length} of ${pool.length}`} spots)</span>
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Choose two different restaurants: your top pick is worth 2 points and your second choice is worth 1.
        </p>
        {pool.length > 0 && (
          <label className="mb-3 block">
            <span className="sr-only">Search restaurants in the pool</span>
            <input
              type="search"
              value={restaurantSearch}
              onChange={(event) => setRestaurantSearch(event.target.value)}
              placeholder="Search by restaurant, cuisine, or address"
              className="w-full rounded-xl border-2 bg-background px-4 py-3 text-base"
              aria-label="Search restaurants in the pool"
            />
          </label>
        )}
        {pool.length === 0 && s.status !== "lobby" && (
          <p className="rounded-xl border-2 border-dashed p-6 text-center text-muted-foreground">
            The voting pool is empty. Ask the host to add restaurants before voting.
          </p>
        )}
        {pool.length > 0 && filteredPool.length === 0 && (
          <p className="mb-3 rounded-xl border-2 border-dashed p-6 text-center text-muted-foreground">
            No restaurants match “{restaurantSearch}”. Try another name, cuisine, or address.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredPool.map((r) => (
            <RestaurantCard
              key={r.id}
              r={r}
              center={s.settings.center}
              focused={focus === r.id}
              onFocus={() => setFocus(r.id)}
              voting={voting}
              voteBusy={submitting}
              want={want === r.id}
              could={could === r.id}
              onPick={(slot) => pick(r.id, slot)}
              tally={tally[r.id]}
              deals={dealsByRestaurant.get(r.id) ?? []}
              hasRewards={hasRewardMatch(
                rewardRestaurants,
                r.name,
                r.id.startsWith("g_") ? r.id.slice(2) : null,
              )}
            />
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Live restaurant listings from Google. Known prices are filtered; places without price data
          are included and marked. Popular-times data varies, and wait times and dietary or allergy
          suitability are not verified, so confirm directly with the restaurant.
        </p>
      </div>}
    </>
  );
}

function RestaurantCard({
  r,
  center,
  voting,
  voteBusy,
  want,
  could,
  onPick,
  focused,
  onFocus,
  tally,
  deals,
  hasRewards,
}: {
  r: Restaurant;
  center: RoomSettings["center"];
  voting: boolean;
  voteBusy: boolean;
  want: boolean;
  could: boolean;
  onPick: (s: "want" | "could") => void;
  focused: boolean;
  onFocus: () => void;
  tally?: { want: string[]; could: string[] } | undefined;
  deals: RestaurantDeal[];
  hasRewards: boolean;
}) {
  const unit = useDistanceUnit();
  const [showDeals, setShowDeals] = useState(false);
  const dealsPanelId = `restaurant-deals-${r.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const dealButton = deals.length > 0 && (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md border border-deal-border bg-deal-background px-2.5 py-1 text-xs font-semibold text-deal-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      title="Show this restaurant's deal"
      aria-expanded={showDeals}
      aria-controls={dealsPanelId}
      onClick={() => setShowDeals((visible) => !visible)}
    >
      Deal
      <ChevronDown
        className={`h-3.5 w-3.5 transition-transform ${showDeals ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
  return (
    <div

      onMouseEnter={onFocus}
      className={`min-w-0 rounded-xl border bg-card p-4 transition ${want ? "ring-2 ring-brand" : could ? "ring-2 ring-olive" : ""} ${focused ? "chunky" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-lg font-extrabold leading-tight">
            {r.name}
            {hasRewards && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground"
                title="Your rewards account matches this restaurant"
                aria-label="Your rewards account matches this restaurant"
              >
                <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                Your rewards
              </span>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            {r.cuisine} · {r.priceUnknown ? "Price unknown" : priceLabel(r.price)} ·{" "}
            {formatDistance(distanceKm(center, r), unit)} ·{" "}
            {r.waitUnknown || r.google ? "Wait unknown" : `~${r.wait} min`}
          </p>
          {googlePriceLabel(r) && <p className="mt-1 text-sm font-bold">{googlePriceLabel(r)} <span className="font-normal text-muted-foreground">Google price range</span></p>}
          <p className="mt-1 text-xs text-muted-foreground">Distance shown is straight-line from the group search center.</p>
          <a href={directionsUrl(r)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-semibold underline">Get directions</a>
          {r.address && <p className="mt-1 text-xs text-muted-foreground">{r.address}</p>}
          {r.websiteUri && <a href={r.websiteUri} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold underline">Restaurant website</a>}
{showDeals && (
  <div id={dealsPanelId}>
    <RestaurantDealIndicators deals={deals} />
  </div>
)}

{r.google && r.id.startsWith("g_") && (
  <GooglePopularTimes placeId={r.id.slice(2)} />
)}
        </div>
        {(r.custom || dealButton) && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            {dealButton}
            {r.custom && (
              <span className="rounded bg-success px-1.5 py-0.5 text-[10px] font-bold uppercase text-success-foreground">
                by {r.nominatedBy}
              </span>
            )}
          </div>
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
            type="button"
            data-vote-choice="want"
            data-restaurant-id={r.id}
            aria-label={`Want ${r.name} — 2 points`}
            aria-pressed={want}
            disabled={voteBusy}
            className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-semibold ${want ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}
          >
            {want && <Check className="size-4" aria-hidden="true" />} Want
          </button>
          <button
            onClick={() => onPick("could")}
            type="button"
            data-vote-choice="could"
            data-restaurant-id={r.id}
            aria-label={`Could ${r.name} — 1 point`}
            aria-pressed={could}
            disabled={voteBusy}
            className={`flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-semibold ${could ? "border-olive bg-olive text-olive-foreground" : "bg-card hover:bg-muted"}`}
          >
            {could && <Check className="size-4" aria-hidden="true" />} Could
          </button>
        </div>
      )}
    </div>
  );
}

function Nominate({
  s,
  session,
  refresh,
  rewardRestaurants,
}: {
  s: State;
  session: Session;
  refresh: () => void;
  rewardRestaurants: RewardRestaurant[];
}) {
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
      <h2 className="text-xl font-semibold">Your wildcard pick</h2>
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
            Add one real restaurant to the Melting Pot.
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
              className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2"
            />
            <button
              disabled={busy || q.trim().length < 2}
              className="rounded-lg bg-secondary px-4 font-bold text-secondary-foreground chunky disabled:opacity-50"
            >
              {busy ? "…" : "Search"}
            </button>
          </form>
          {results && (
            <ul className="mt-3 divide-y rounded-lg border">
              {results.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">No matches.</li>
              )}
              {results.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-bold">
                      {r.name}
                      {hasRewardMatch(
                        rewardRestaurants,
                        r.name,
                        r.id.startsWith("g_") ? r.id.slice(2) : null,
                      ) && (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground"
                          aria-label="Your rewards account matches this restaurant"
                          title="Your rewards account matches this restaurant"
                        >
                          <Gift className="h-3 w-3" aria-hidden="true" />
                          Rewards
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{r.address}</p>
                    {r.websiteUri && <a href={r.websiteUri} target="_blank" rel="noreferrer" className="text-xs font-semibold underline">Website</a>}
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
