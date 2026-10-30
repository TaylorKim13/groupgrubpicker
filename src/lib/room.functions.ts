import { SettingsSchema, getHostingPreferences, applyHostingPreferences } from "./settings";
import { optionalAccountAuth } from "./account-auth";
import { RoomCodeSchema, RoomProfileSchema } from "./room-access";
import { CreationClickSchema } from "./creation-clicks";
import { createServerFn } from "@tanstack/react-start";
import { mapsFetch as gmaps } from "./maps.server";
import { z } from "zod";
import { authMember, db, getRoomByCode, hashToken, newCode, newToken } from "./room.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildPool,
  distanceKm,
  DEFAULT_SETTINGS,
  DIETS,
  type Restaurant,
  type RoomSettings,
} from "./restaurants";

const Auth = z.object({
  code: z.string().min(6).max(6),
  memberId: z.string().uuid(),
  token: z.string().min(10),
});
const Profile = RoomProfileSchema;

export const kickMember = createServerFn({ method: "POST" })
  .inputValidator((input) => Auth.extend({ targetMemberId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { room } = await requireHost(data);
    if (room.status === "closed") throw new Error("This group has already finished");
    if (data.targetMemberId === data.memberId) throw new Error("The host cannot remove themselves");
    const { error } = await db()
      .from("members")
      .delete()
      .eq("id", data.targetMemberId)
      .eq("room_id", room.id)
      .eq("is_host", false);
    if (error) throw new Error("Could not remove participant");
    return { ok: true };
  });

export const recordGroupCreationClicks = createServerFn({ method: "POST" })
  .inputValidator((input) => Auth.merge(CreationClickSchema).parse(input))
  .handler(async ({ data }) => {
    const { room, member } = await requireHost(data);
    const { error } = await db()
      .from("group_creation_usage")
      .update({ journey_id: data.journeyId, click_count: data.clicks })
      .eq("room_id", room.id)
      .eq("host_member_id", member.id)
      .is("click_count", null);
    if (error) throw new Error("Could not record creation clicks");
    return { ok: true };
  });

export const recordSelectionActivity = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    Auth.extend({ event: z.enum(["enter", "heartbeat", "leave"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { room, member } = await authMember(data.code, data.memberId, data.token);
    const { error } = await db().rpc("record_selection_activity", {
      p_room_id: room.id,
      p_member_id: member.id,
      p_event: data.event,
    });
    if (error) throw new Error("Could not record selection activity");
    return { ok: true };
  });

async function addMember(
  roomId: string,
  p: z.infer<typeof Profile>,
  isHost: boolean,
  userId: string | null = null,
) {
  const token = newToken();
  const { data, error } = await db()
    .from("members")
    .insert({
      room_id: roomId,
      nickname: p.nickname,
      avatar: p.avatar,
      is_host: isHost,
      token_hash: hashToken(token),
      user_id: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { memberId: data.id as string, token };
}

export const createRoom = createServerFn({ method: "POST" })
  .middleware([optionalAccountAuth])
  .inputValidator((d) => Profile.parse(d))
  .handler(async ({ data, context }) => {
    let settings = DEFAULT_SETTINGS;
    if (context.accountUserId) {
      const { data: preset, error } = await db()
        .from("preset_filters")
        .select("settings")
        .eq("user_id", context.accountUserId)
        .maybeSingle();
      if (error) throw new Error("Could not load hosting preferences");
      if (preset) settings = applyHostingPreferences(DEFAULT_SETTINGS, preset.settings);
    }
    for (let i = 0; i < 5; i++) {
      const code = newCode();
      const { data: room, error } = await db()
        .from("rooms")
        .insert({ code, settings })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") continue;
        throw new Error("Could not create your group. Please try again.");
      }
      try {
        const m = await addMember(room.id, data, true, context.accountUserId);
        return { code, ...m };
      } catch (error) {
        // A room without its host cannot be used. Remove only this failed creation.
        await db().from("rooms").delete().eq("id", room.id);
        throw error;
      }
    }
    throw new Error("Could not create room, try again");
  });

export const joinRoom = createServerFn({ method: "POST" })
  .inputValidator((d) => Profile.extend({ code: RoomCodeSchema }).parse(d))
  .handler(async ({ data }) => {
    const room = await getRoomByCode(data.code);
    if (room.status === "closed") throw new Error("Voting in this room is already over");
    const m = await addMember(room.id, data, false);
    return { code: room.code as string, ...m };
  });

export const listPublicRooms = createServerFn({ method: "GET" }).handler(async () => {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString();
  const { data } = await db()
    .from("rooms")
    .select("code, settings, status, created_at, members(count)")
    .neq("status", "closed")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? [])
    .filter((r: any) => r.settings?.visibility === "public")
    .map((r: any) => ({
      code: r.code as string,
      label: (r.settings?.center?.label as string) ?? "",
      status: r.status as string,
      members: (r.members?.[0]?.count as number) ?? 0,
    }));
});

async function loadNominations(roomId: string) {
  const { data } = await db()
    .from("nominations")
    .select("member_id, restaurant")
    .eq("room_id", roomId);
  return (data ?? []) as Array<{ member_id: string; restaurant: Restaurant }>;
}

export const getRoomState = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }) => {
    const { room, member } = await authMember(data.code, data.memberId, data.token);
    const settings = { ...DEFAULT_SETTINGS, ...(room.settings as RoomSettings) };
    const [{ data: members }, { data: votes }, noms] = await Promise.all([
      db()
        .from("members")
        .select("id, nickname, avatar, is_host, created_at, user_id")
        .eq("room_id", room.id)
        .order("created_at"),
      db().from("votes").select("member_id, want_id, could_id").eq("room_id", room.id),
      loadNominations(room.id),
    ]);
    const accountIds = [
      ...new Set<string>(
        (members ?? [])
          .map((m: { user_id: string | null }) => m.user_id)
          .filter((id: string | null): id is string => !!id),
      ),
    ];
    const { data: profiles } = accountIds.length
      ? await db().from("profiles").select("id, avatar").in("id", accountIds)
      : { data: [] };
    const avatars = new Map<string, string>(
      (profiles ?? []).map((p: { id: string; avatar: string }) => [p.id, p.avatar]),
    );
    const voted = new Set((votes ?? []).map((v: any) => v.member_id));
    const showVotes = !settings.anonymous;
    const my = (votes ?? []).find((v: any) => v.member_id === member.id);
    return {
      code: room.code as string,
      status: room.status as "lobby" | "voting" | "closed",
      settings,
      me: { id: member.id as string, isHost: member.is_host as boolean, linked: !!member.user_id },
      members: (members ?? []).map((m: any) => ({
        id: m.id as string,
        nickname: m.nickname as string,
        avatar: avatars.get(m.user_id) ?? (m.avatar as string),
        isHost: m.is_host as boolean,
        hasAccount: !!m.user_id,
        voted: voted.has(m.id),
      })),
      pool: await loadRestaurantPool(
        room,
        noms.map((n) => n.restaurant),
      ),
      myNomination: noms.find((n) => n.member_id === member.id)?.restaurant ?? null,
      myVote: my ? { want: my.want_id as string, could: my.could_id as string } : null,
      publicVotes: showVotes
        ? (votes ?? []).map((v: any) => ({
            memberId: v.member_id as string,
            want: v.want_id as string,
            could: v.could_id as string,
          }))
        : null,
      result: room.result as Result | null,
    };
  });

async function requireHost(a: z.infer<typeof Auth>) {
  const r = await authMember(a.code, a.memberId, a.token);
  if (!r.member.is_host) throw new Error("Only the host can do that");
  return r;
}

export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ settings: SettingsSchema }).parse(d))
  .handler(async ({ data }) => {
    const { room } = await requireHost(data);
    if (room.status !== "lobby") throw new Error("Settings are locked once voting starts");
    const { data: saved, error } = await db()
      .from("rooms")
      .update({ settings: data.settings })
      .eq("id", room.id)
      .eq("status", "lobby")
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Could not save room settings");
    if (!saved) throw new Error("Settings are locked once voting starts");
    return { ok: true };
  });

export const startVoting = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }) => {
    const { room } = await requireHost(data);
    if (room.status !== "lobby") return { ok: true, alreadyStarted: true };
    const noms = await loadNominations(room.id);
    const pool = await loadRestaurantPool(
      room,
      noms.map((n) => n.restaurant),
    );
    if (pool.length < 2) throw new Error("Choose filters with at least two restaurants");
    const { error: snapshotError } = await db()
      .from("room_restaurants")
      .upsert(
        pool.map((r) => ({
          room_id: room.id,
          restaurant_id: r.id,
          restaurant: r,
          distance_km: distanceKm(room.settings.center, r),
        })),
        { onConflict: "room_id,restaurant_id" },
      );
    if (snapshotError) throw new Error("Could not save the restaurant list");
    const { error } = await db()
      .from("rooms")
      .update({ status: "voting", voting_started_at: new Date().toISOString() })
      .eq("id", room.id);
    if (error) throw new Error("Could not start voting");
    return { ok: true };
  });

// ---------- Google Maps (direct server-side requests) ----------
export async function gmaps(path: string, init: RequestInit & { fieldMask?: string } = {}) {
  const gk = process.env["GOOGLE_MAPS_API_KEY"];
  if (!gk) throw new Error("Google Maps search is not configured");
  const { fieldMask, ...request } = init;
  const headers = new Headers(request.headers);
  let url: URL;
  if (path.startsWith("/maps/api/geocode/json?")) {
    url = new URL(path, "https://maps.googleapis.com");
    url.searchParams.set("key", gk);
  } else if (path === "/places/v1/places:searchText") {
    url = new URL("https://places.googleapis.com/v1/places:searchText");
    headers.set("X-Goog-Api-Key", gk);
    headers.set("Content-Type", "application/json");
    if (fieldMask) headers.set("X-Goog-FieldMask", fieldMask);
  } else {
    throw new Error("Unsupported Google Maps request");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...request,
      headers,
      signal: request.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    // Fetch errors can include the geocoding URL, which contains the server key.
    throw new Error("Map search could not connect. Please try again.");
  }
  if (!res.ok) {
    throw new Error(`Map search failed (${res.status})`);
  }
  const result = await res.json();
  // Geocoding reports failures inside HTTP 200 responses.
  if (result.status && result.status !== "OK" && result.status !== "ZERO_RESULTS") {
    throw new Error(`Map search failed (${result.status})`);
  }
  return result;
}

// ---------- Google Maps ----------
export const geocodeCenter = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ address: z.string().trim().min(2).max(200) }).parse(d))
  .handler(async ({ data }) => {
    await requireHost(data);
    const j = await gmaps(`/maps/api/geocode/json?address=${encodeURIComponent(data.address)}`);
    const r = j.results?.[0];
    if (!r) throw new Error("Couldn't find that place");
    return {
      lat: r.geometry.location.lat as number,
      lng: r.geometry.location.lng as number,
      label: r.formatted_address as string,
    };
  });

const PRICE_MAP: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// Reuse discovery across the 2.5s room polls and simultaneous participants.
const discoveryCache = new Map<string, { expires: number; results: Promise<Restaurant[]> }>();
async function loadRestaurantPool(
  room: { id: string; status: string; settings: RoomSettings },
  nominations: Restaurant[],
): Promise<Restaurant[]> {
  if (!process.env["GOOGLE_MAPS_API_KEY"]) return buildPool(room.settings, nominations);
  if (room.status !== "lobby") {
    const { data, error } = await db()
      .from("room_restaurants")
      .select("restaurant")
      .eq("room_id", room.id);
    if (error) throw new Error("Could not load the voting restaurant list");
    if (data?.length) return data.map((row: { restaurant: Restaurant }) => row.restaurant);
  }
  const settings = room.settings;
  const key = JSON.stringify([
    settings.center.lat,
    settings.center.lng,
    settings.radiusKm,
    settings.priceMin,
    settings.priceMax,
    settings.diets,
  ]);
  let entry = discoveryCache.get(key);
  if (!entry || entry.expires < Date.now()) {
    const results = discoverRestaurants(settings);
    entry = { expires: Date.now() + 5 * 60000, results };
    if (discoveryCache.size >= 100) discoveryCache.delete(discoveryCache.keys().next().value!);
    discoveryCache.set(key, entry);
    results.catch(() => {
      if (discoveryCache.get(key)?.results === results) discoveryCache.delete(key);
    });
  }
  const nearby = await entry.results;
  const merged = new Map(nearby.map((r) => [r.id, r]));
  nominations.forEach((r) => merged.set(r.id, r));
  return [...merged.values()];
}

async function discoverRestaurants(settings: RoomSettings): Promise<Restaurant[]> {
  const c = settings.center;
  const latSpan = settings.radiusKm / 110.574;
  const lngSpan = settings.radiusKm / (111.32 * Math.max(0.01, Math.cos((c.lat * Math.PI) / 180)));
  // Google returns a bounded candidate list; enforce the actual circular radius locally.
  const found = new Map<string, Restaurant>();
  let pageToken: string | undefined;
  for (let page = 0; page < 3; page++) {
    const response = await gmaps("/places/v1/places:searchText", {
      method: "POST",
      fieldMask:
        "nextPageToken,places.id,places.displayName,places.formattedAddress,places.location,places.priceLevel,places.primaryTypeDisplayName,places.types,places.businessStatus",
      body: JSON.stringify({
        textQuery: [...settings.diets, "restaurants"].join(" "),
        includedType: "restaurant",
        strictTypeFiltering: true,
        pageSize: 20,
        rankPreference: "DISTANCE",
        locationRestriction: {
          rectangle: {
            low: {
              latitude: Math.max(-90, c.lat - latSpan),
              longitude: Math.max(-180, c.lng - lngSpan),
            },
            high: {
              latitude: Math.min(90, c.lat + latSpan),
              longitude: Math.min(180, c.lng + lngSpan),
            },
          },
        },
        ...(pageToken ? { pageToken } : {}),
      }),
    });
    for (const p of response.places ?? []) {
      if (
        !p.id ||
        !p.location ||
        p.businessStatus === "CLOSED_PERMANENTLY" ||
        p.businessStatus === "CLOSED_TEMPORARILY"
      )
        continue;
      const price = PRICE_MAP[p.priceLevel] ?? (p.priceLevel === "PRICE_LEVEL_FREE" ? 1 : 2);
      const r: Restaurant = {
        id: "g_" + p.id,
        name: p.displayName?.text ?? "Restaurant",
        cuisine: p.primaryTypeDisplayName?.text ?? "Restaurant",
        price,
        wait: 0,
        diets: [],
        fastFood: (p.types ?? []).includes("fast_food_restaurant"),
        lat: p.location.latitude,
        lng: p.location.longitude,
        address: p.formattedAddress ?? "",
        google: true,
        priceUnknown: !p.priceLevel || p.priceLevel === "PRICE_LEVEL_UNSPECIFIED",
      };
      if (distanceKm(c, r) > settings.radiusKm) continue;
      if (!r.priceUnknown && (price < settings.priceMin || price > settings.priceMax)) continue;
      found.set(r.id, r);
    }
    pageToken = response.nextPageToken;
    if (!pageToken) break;
  }
  return [...found.values()];
}

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ query: z.string().trim().min(2).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { room } = await authMember(data.code, data.memberId, data.token);
    const c = (room.settings as RoomSettings).center ?? DEFAULT_SETTINGS.center;
    const j = await gmaps("/places/v1/places:searchText", {
      method: "POST",
      fieldMask:
        "places.id,places.displayName,places.formattedAddress,places.location,places.priceLevel,places.primaryTypeDisplayName,places.types",
      body: JSON.stringify({
        textQuery: data.query,
        pageSize: 6,
        includedType: "restaurant",
        locationBias: { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: 30000 } },
      }),
    });
    return ((j.places ?? []) as any[]).map((p): Restaurant => ({
      id: `g_${p.id}`,
      name: p.displayName?.text ?? "Unknown",
      cuisine: p.primaryTypeDisplayName?.text ?? "Restaurant",
      price: PRICE_MAP[p.priceLevel] ?? 2,
      wait: 20,
      diets: [],
      fastFood: (p.types ?? []).includes("fast_food_restaurant"),
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      address: p.formattedAddress,
      custom: true,
    }));
  });

const RestaurantSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(120),
  cuisine: z.string().max(80),
  price: z.number().int().min(1).max(4),
  wait: z.number().int().min(0).max(300),
  diets: z.array(z.string()).max(10),
  fastFood: z.boolean(),
  lat: z.number(),
  lng: z.number(),
  address: z.string().max(300).optional(),
});

export const nominate = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ restaurant: RestaurantSchema.nullable() }).parse(d))
  .handler(async ({ data }) => {
    const { room, member } = await authMember(data.code, data.memberId, data.token);
    if (room.status === "closed") throw new Error("Voting is over");
    const { data: myVote } = await db()
      .from("votes")
      .select("id")
      .eq("member_id", member.id)
      .maybeSingle();
    if (myVote) throw new Error("You've already voted — nominations are locked for you");
    await db().from("nominations").delete().eq("member_id", member.id);
    if (data.restaurant) {
      await db()
        .from("nominations")
        .insert({
          room_id: room.id,
          member_id: member.id,
          restaurant: {
            ...data.restaurant,
            custom: true,
            nominatedBy: member.nickname,
            nominatedByMemberId: member.id,
          },
        });
    }
    return { ok: true };
  });

export const castVote = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    Auth.extend({ want: z.string().max(200), could: z.string().max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    if (data.want === data.could) throw new Error("Pick two different places");
    const { room, member } = await authMember(data.code, data.memberId, data.token);
    if (room.status !== "voting") throw new Error("Voting isn't open");
    const noms = await loadNominations(room.id);
    const ids = new Set(
      (
        await loadRestaurantPool(
          room,
          noms.map((n) => n.restaurant),
        )
      ).map((r) => r.id),
    );
    if (!ids.has(data.want) || !ids.has(data.could))
      throw new Error("That place isn't in the pool");
    const { error } = await db()
      .from("votes")
      .upsert(
        { room_id: room.id, member_id: member.id, want_id: data.want, could_id: data.could },
        { onConflict: "member_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type Score = { id: string; name: string; points: number; wants: number; coulds: number };
export type Result = {
  winner: Restaurant;
  scores: Score[];
  tie: null | { method: "coin" | "wheel"; candidates: { id: string; name: string }[] };
};

export const closeVoting = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }) => {
    const { room } = await requireHost(data);
    if (room.status === "closed") return { ok: true, alreadyClosed: true };
    if (room.status !== "voting") throw new Error("Voting isn't open");
    const [{ data: votes }, noms] = await Promise.all([
      db().from("votes").select("want_id, could_id").eq("room_id", room.id),
      loadNominations(room.id),
    ]);
    if (!votes?.length) throw new Error("Nobody has voted yet");
    const pool = await loadRestaurantPool(
      room,
      noms.map((n) => n.restaurant),
    );
    const byId = new Map(pool.map((r) => [r.id, r]));
    const tally = new Map<string, Score>();
    const bump = (id: string, pts: number) => {
      const r = byId.get(id);
      if (!r) return;
      const s = tally.get(id) ?? { id, name: r.name, points: 0, wants: 0, coulds: 0 };
      s.points += pts;
      if (pts === 2) s.wants++;
      else s.coulds++;
      tally.set(id, s);
    };
    for (const v of votes) {
      bump(v.want_id, 2);
      bump(v.could_id, 1);
    }
    const scores = [...tally.values()].sort((a, b) => b.points - a.points || b.wants - a.wants);
    const first = scores[0];
    if (!first) throw new Error("No valid votes to count");
    const top = scores.filter((s) => s.points === first.points);
    const pick = top[Math.floor(Math.random() * top.length)];
    const winner = pick ? byId.get(pick.id) : undefined;
    if (!winner) throw new Error("Could not find a winner");
    const result: Result = {
      winner,
      scores,
      tie:
        top.length > 1
          ? {
              method: top.length === 2 ? "coin" : "wheel",
              candidates: top.map((t) => ({ id: t.id, name: t.name })),
            }
          : null,
    };
    const { error: snapshotError } = await db()
      .from("room_restaurants")
      .upsert(
        pool.map((r) => ({
          room_id: room.id,
          restaurant_id: r.id,
          restaurant: r,
          distance_km: distanceKm(room.settings.center, r),
          points: tally.get(r.id)?.points ?? 0,
        })),
        { onConflict: "room_id,restaurant_id" },
      );
    if (snapshotError) throw new Error("Could not save the scores");
    const { error } = await db()
      .from("rooms")
      .update({ status: "closed", result, closed_at: new Date().toISOString() })
      .eq("id", room.id);
    if (error) throw new Error("Could not save the result");
    return { ok: true };
  });

export const linkRoomAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data, context }) => {
    const { member } = await authMember(data.code, data.memberId, data.token);
    if (member.user_id && member.user_id !== context.userId)
      throw new Error("This seat belongs to another account");
    const { error } = await db()
      .from("members")
      .update({ user_id: context.userId })
      .eq("id", member.id);
    if (error) throw new Error("Could not save this group to your account");
    return { ok: true };
  });

export const saveRoomPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data, context }) => {
    const { room } = await authMember(data.code, data.memberId, data.token);
    const { error } = await context.supabase.from("preset_filters").upsert({
      user_id: context.userId,
      settings: getHostingPreferences(room.settings),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Could not save preferences");
    return { ok: true };
  });

export const applyRoomPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data, context }) => {
    const { room } = await requireHost(data);
    if (room.status !== "lobby") throw new Error("Settings are locked once voting starts");
    const { data: preset, error } = await context.supabase
      .from("preset_filters")
      .select("settings")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error || !preset) throw new Error("No saved preferences yet");
    const settings = applyHostingPreferences(room.settings as RoomSettings, preset.settings);
    const { data: saved, error: saveError } = await db()
      .from("rooms")
      .update({ settings })
      .eq("id", room.id)
      .eq("status", "lobby")
      .select("id")
      .maybeSingle();
    if (saveError) throw new Error("Could not apply preferences");
    if (!saved) throw new Error("Settings are locked once voting starts");
    return { ok: true };
  });

export type GroupHistoryEntry = {
  joinedAt: string;
  code: string;
  label: string | undefined;
  status: string;
  winner: string | undefined;
  votingStartedAt: string | null;
  closedAt: string | null;
};

export const getGroupHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GroupHistoryEntry[]> => {
    const { data, error } = await db()
      .from("members")
      .select("created_at, rooms(code, settings, status, result, voting_started_at, closed_at)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error("Could not load group history");
    return (data ?? []).map((row: any) => ({
      joinedAt: row.created_at as string,
      code: row.rooms.code as string,
      label: row.rooms.settings?.center?.label as string,
      status: row.rooms.status as string,
      winner: row.rooms.result?.winner?.name as string | undefined,
      votingStartedAt: row.rooms.voting_started_at as string | null,
      closedAt: row.rooms.closed_at as string | null,
    }));
  });
