import { normalizeRoomCode, RoomCodeSchema } from "@/lib/room-access";
import {
  beginCreationClickTracking,
  resetCreationClickTracking,
} from "@/lib/creation-click-tracking";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createRoom, geocodeSearchCenter, joinRoom, listPublicRooms } from "@/lib/room.functions";
import { loadSession, saveSession } from "@/lib/session";
import { AVATARS, DEFAULT_SETTINGS, DIETS, type Center, type Diet } from "@/lib/restaurants";
import { ProfilePicker } from "@/components/ProfilePicker";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ThemeControl } from "@/components/ThemeControl";
import { Button } from "@/components/ui/button";
import { Onboarding } from "@/components/Onboarding";
import { useAccount } from "@/components/AccountProvider";
import { getAccount } from "@/lib/account.functions";
import { Slider } from "@/components/ui/slider";
import { fromKm, toKm, type DistanceUnit } from "@/lib/settings";
import { ArrowLeft, ArrowRight, MapPin, Plus, Users, UserRound } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GROUP GRUB v1 — vote on where to eat" },
      {
        name: "description",
        content:
          "Start a room, share the code, set filters, and let the group vote on where to eat.",
      },
      { property: "og:title", content: "GROUP GRUB v1 — vote on where to eat" },
      {
        property: "og:description",
        content: "Start a room, share the code, and let the group vote on where to eat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  useEffect(() => {
    beginCreationClickTracking();
  }, []);
  const navigate = useNavigate();
  const user = useAccount();
  const accountFn = useServerFn(getAccount);
  const account = useQuery({
    queryKey: ["account", user?.id],
    queryFn: () => accountFn(),
    enabled: !!user,
  });
  const [mode, setMode] = useState<"host" | "join" | null>(null);
  const [hostStep, setHostStep] = useState<"profile" | "area" | "group">("profile");
  useEffect(() => {
    if (account.data) {
      setNickname(account.data.profile.display_name);
      setAvatar(account.data.profile.avatar);
    }
  }, [account.data]);
  const create = useServerFn(createRoom);
  const join = useServerFn(joinRoom);
  const list = useServerFn(listPublicRooms);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState<string>(AVATARS[0] ?? "🍕");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const geocode = useServerFn(geocodeSearchCenter);
  const [areaBusy, setAreaBusy] = useState(false);
  const [address, setAddress] = useState("");
  const [center, setCenter] = useState<Center>(DEFAULT_SETTINGS.center);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_SETTINGS.radiusKm);
  const [priceLevels, setPriceLevels] = useState<number[]>([]);
  const [diets, setDiets] = useState<Diet[]>([]);
  const [maxWait, setMaxWait] = useState(DEFAULT_SETTINGS.maxWait);
  const unit: DistanceUnit = account.data?.distanceUnit ?? "mi";
  const radiusValue = Math.max(0.5, Number(fromKm(radiusKm, unit).toFixed(1)));
  const priceMin = priceLevels.length ? Math.min(...priceLevels) : 1;
  const priceMax = priceLevels.length ? Math.max(...priceLevels) : 4;
  const rooms = useQuery({
    queryKey: ["public-rooms"],
    queryFn: () => list(),
    refetchInterval: 10000,
  });

  async function go(kind: "host" | "join", joinCode?: string) {
    if (busy) return;
    // Returning to a table must reuse its room pass rather than create another seat.
    if (kind === "join" && RoomCodeSchema.safeParse(joinCode ?? code).success) {
      const saved = loadSession(normalizeRoomCode(joinCode ?? code));
      if (saved) {
        resetCreationClickTracking();
        await navigate({ to: "/room/$code", params: { code: saved.code } });
        return;
      }
    }
    if (!nickname.trim()) {
      toast.error("Pick a nickname first");
      return;
    }
    if (kind === "join" && !RoomCodeSchema.safeParse(joinCode ?? code).success) {
      toast.error("Enter a 6-character room code");
      return;
    }
    setBusy(true);
    try {
      const s =
  kind === "host"
    ? await create({ data: { nickname, avatar, center, radiusKm, priceMin, priceMax, priceLevels, diets, maxWait, setupPending: true } })
    : await join({
        data: { nickname, avatar, code: normalizeRoomCode(joinCode ?? code) },
      });
      saveSession(s);
      if (kind === "join") resetCreationClickTracking();
      if (kind === "host") {
        navigate({ to: "/room/$code", params: { code: s.code }, search: { setup: "pool" } });
      } else {
        navigate({ to: "/room/$code", params: { code: s.code } });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      if (kind === "join") void rooms.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function setSearchAddress() {
    if (address.trim().length < 2 || areaBusy) return;
    setAreaBusy(true);
    try {
      setCenter(await geocode({ data: { address } }));
      setAddress("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Location lookup failed");
    } finally {
      setAreaBusy(false);
    }
  }

  async function continueFromArea() {
    if (address.trim().length >= 2) {
      if (areaBusy) return;
      setAreaBusy(true);
      try {
        setCenter(await geocode({ data: { address } }));
        setAddress("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Location lookup failed");
        return;
      } finally {
        setAreaBusy(false);
      }
    }
    setHostStep("group");
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Location is unavailable in this browser");
      return;
    }
    setAreaBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCenter({ lat: position.coords.latitude, lng: position.coords.longitude, label: "My location" });
        setAreaBusy(false);
      },
      () => {
        toast.error("Couldn't get your location");
        setAreaBusy(false);
      },
      { timeout: 15000 },
    );
  }

  return (
    <main className={`home-shell${mode ? ` home-shell-create${mode === "join" ? " home-shell-join" : ""}` : ""}`}>
      <div className={mode ? "create-photo-area" : "contents"}>
      <header className="home-header">
        <Link to="/" className="brand-wordmark text-4xl" onClick={() => setMode(null)}>
          GROUP<span className="text-primary"> GRUB</span>{" "}
          <span className="sr-only">Group dining, simplified</span>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeControl />
          <Button variant="ghost" className={user ? "h-auto min-h-14 gap-3 px-3 py-2" : undefined} asChild>
            <Link to="/account">
              {user && "Your Account"}
              {user ? (
                <ProfileAvatar
                  avatar={account.data?.profile.avatar ?? avatar}
                  name={account.data?.profile.display_name ?? "Your"}
                  className="h-10 w-10 bg-muted text-2xl"
                />
              ) : <UserRound />}
              {!user && "Sign in"}
            </Link>
          </Button>
        </div>
      </header>
      {!mode ? (
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="home-eyebrow">Good food. Your people.</p>
            <h1 id="home-title" className="home-headline">Big appetites.<br />One decision.</h1>
            <p className="home-hero-description">Find your next great meal. Together.</p>
            <div className="home-hero-actions">
              <Button className="home-start-button" onClick={() => { setHostStep("profile"); setMode("host"); }}>
                <Plus /> Start a table
              </Button>
              <Button className="home-join-button" variant="outline" onClick={() => setMode("join")}>
                <Users /> Join friends
              </Button>
            </div>
            <div className="home-hero-walkthrough">
              <Onboarding discreet />
            </div>
          </div>
        </section>
      ) : null}
      {mode && (
        <section className="home-form">
          <h1 className="mb-4 text-3xl font-semibold">
            {mode === "host"
              ? hostStep === "profile" ? "Create your table" : hostStep === "area" ? "Choose an area" : "Group settings"
              : "Join your friends"}
          </h1>
          <Button variant="ghost" className="mb-4" onClick={() => {
            if (mode === "host" && hostStep === "group") setHostStep("area");
            else if (mode === "host" && hostStep === "area") setHostStep("profile");
            else setMode(null);
          }}>
            <ArrowLeft />
            Back
          </Button>
          <p className="mb-4 text-sm text-muted-foreground">
            {mode === "host" && hostStep === "area"
              ? "Set where restaurant search should start and how far it should reach."
              : mode === "host" && hostStep === "group"
                ? "Choose the price range, dietary needs, and wait time for your group."
                : `No account needed. Pick a nickname to ${mode === "host" ? "start your table" : "join your friends"}.`}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (mode === "host" && hostStep === "profile") {
                if (!nickname.trim()) { toast.error("Pick a nickname first"); return; }
                setHostStep("area");
              } else if (mode === "host" && hostStep === "area") {
                void continueFromArea();
              } else if (mode) {
                void go(mode);
              }
            }}
          >
            <fieldset disabled={busy}>
              {mode === "host" && hostStep === "area" ? (
                <div className="space-y-6">
                  <div>
                    <label htmlFor="search-center" className="font-bold">Search center</label>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{center.label}</p>
                    <div className="mt-2 flex gap-2">
                      <input id="search-center" value={address} maxLength={200} onChange={(event) => setAddress(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void setSearchAddress(); } }} placeholder="Address or neighborhood" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2" />
                      <Button type="button" variant="secondary" disabled={areaBusy || address.trim().length < 2} onClick={() => void setSearchAddress()}>{areaBusy ? "Finding…" : "Set"}</Button>
                    </div>
                    <Button type="button" variant="link" disabled={areaBusy} className="mt-1 px-0" onClick={useMyLocation}>Use my location</Button>
                  </div>
                  <div>
                    <label className="font-bold">Search radius: {radiusValue} {unit}</label>
                    <Slider className="mt-4" min={0.5} max={Number(fromKm(toKm(100, "mi"), unit).toFixed(1))} step={0.5} value={[radiusValue]} onValueChange={([value]) => { if (value !== undefined) setRadiusKm(toKm(value, unit)); }} />
                  </div>
                </div>
              ) : mode === "host" && hostStep === "group" ? (
                <div className="space-y-6">
                  <div>
                    <p className="font-bold">Price range</p>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map((price) => {
                        const selected = priceLevels.includes(price);
                        return <button key={price} type="button" aria-pressed={selected} onClick={() => setPriceLevels(selected ? priceLevels.filter((level) => level !== price) : [...priceLevels, price].sort((a, b) => a - b))} className={`rounded-lg border py-2 text-sm font-bold ${selected ? "bg-primary text-primary-foreground" : "bg-background"}`}>{"$".repeat(price)}</button>;
                      })}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Leave all unselected for any price.</p>
                  </div>
                  <div>
                    <p className="font-bold">Dietary restrictions</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {DIETS.map((diet) => {
                        const selected = diets.includes(diet);
                        return <Button key={diet} type="button" aria-pressed={selected} variant={selected ? "secondary" : "outline"} onClick={() => setDiets(selected ? diets.filter((item) => item !== diet) : [...diets, diet])}>{diet}</Button>;
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="font-bold">Maximum wait: {maxWait} minutes</label>
                    <Slider className="mt-4" min={5} max={120} step={5} value={[maxWait]} onValueChange={([value]) => { if (value !== undefined) setMaxWait(value); }} />
                  </div>
                </div>
              ) : (
                <ProfilePicker autoFocus profilePhoto={user ? account.data?.profile.avatar : undefined} {...{ nickname, setNickname, avatar, setAvatar }} />
              )}
              {mode === "join" && (
                <div className="mt-6">
                  <label htmlFor="room-code" className="text-sm font-bold">
                    Room code
                  </label>
                  <input
                    id="room-code"
                    value={code}
                    onChange={(e) => setCode(normalizeRoomCode(e.target.value).slice(0, 6))}
                    placeholder="6-character code"
                    className="mt-2 w-full rounded-lg border bg-card px-4 py-3 font-display text-xl uppercase"
                  />
                </div>
              )}
              <Button
                disabled={busy || areaBusy || (mode === "host" && hostStep === "profile" && !nickname.trim()) || (mode === "join" && (!nickname.trim() || code.length !== 6))}
                type="submit"
                className="mt-6 h-12 w-full text-lg font-bold chunky"
              >
                {busy ? "Setting the table…" : mode === "host" ? hostStep === "profile" ? "Choose an area" : hostStep === "area" ? "Group settings" : "Choose restaurants" : "Join the table"}
                <ArrowRight />
              </Button>
            </fieldset>
          </form>
          {mode && (
            <div className="mt-4 flex justify-center">
              <Onboarding discreet />
            </div>
          )}
        </section>
      )}
      </div>
      {!mode && (
        <section className="home-steps" aria-label="How Group Grub works">
          {[
            ["01", "Get together", "Start a table and send your friends the room code."],
            ["02", "Find your flavor", "Set your budget and distance. Browse nearby spots."],
            ["03", "Let the crew choose", "Everyone votes. One winner. Time to eat."],
          ].map(([number, title, description]) => (
            <div key={number}>
              <span className="home-step-number" aria-hidden="true">{number}</span>
              <h3 className="home-step-title">{title}</h3>
              <p>{description}</p>
            </div>
          ))}
        </section>
      )}
      {!mode && (
      <details className="mt-8 border-b pb-6">
        <summary className="cursor-pointer font-bold">
          Browse open tables {rooms.data?.length ? `(${rooms.data.length})` : ""}
        </summary>
        <ul className="mt-4 divide-y">
          {rooms.data?.length ? (
            rooms.data.map(
              (r: { code: string; label: string; status: string; members: number }) => (
                <li key={r.code} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-bold">{r.label || r.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.code} · {r.members} at the table
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (nickname.trim()) {
                        void go("join", r.code);
                        return;
                      }
                      setMode("join");
                      setCode(r.code);
                      requestAnimationFrame(() => {
                        const input = document.getElementById("nickname");
                        input?.scrollIntoView({ behavior: "smooth", block: "center" });
                        input?.focus({ preventScroll: true });
                      });
                      toast.info("Enter a nickname, then choose Join the table.");
                    }}
                  >
                    Join
                  </Button>
                </li>
              ),
            )
          ) : (
            <li className="text-sm text-muted-foreground">No public rooms right now.</li>
          )}
        </ul>
      </details>
      )}
      {!mode && (
        <>
      <section className="home-community">
        <div>
        <h2 className="text-3xl uppercase">Good food. Better deals.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Help the group find a great meal for a little less. Share an offer you found.
        </p>
        </div>
        <Button className="shrink-0 font-bold" asChild>
          <Link to="/deals/submit">Share a deal</Link>
        </Button>
      </section>
        </>
      )}
    </main>
  );
}
