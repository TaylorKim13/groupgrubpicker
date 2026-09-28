import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMember, db, getRoomByCode, hashToken, newCode, newToken } from "./room.server";
import { buildPool, DEFAULT_SETTINGS, DIETS, type Restaurant, type RoomSettings } from "./restaurants";

const Auth = z.object({ code: z.string().min(6).max(6), memberId: z.string().uuid(), token: z.string().min(10) });
const Profile = z.object({ nickname: z.string().trim().min(1).max(24), avatar: z.string().min(1).max(8) });

async function addMember(roomId: string, p: z.infer<typeof Profile>, isHost: boolean) {
  const token = newToken();
  const { data, error } = await db()
    .from("members")
    .insert({ room_id: roomId, nickname: p.nickname, avatar: p.avatar, is_host: isHost, token_hash: hashToken(token) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { memberId: data.id as string, token };
}

export const createRoom = createServerFn({ method: "POST" })
  .inputValidator((d) => Profile.parse(d))
  .handler(async ({ data }) => {
    for (let i = 0; i < 5; i++) {
      const code = newCode();
      const { data: room, error } = await db().from("rooms").insert({ code, settings: DEFAULT_SETTINGS }).select("id").single();
      if (error) continue;
      const m = await addMember(room.id, data, true);
      return { code, ...m };
    }
    throw new Error("Could not create room, try again");
  });

export const joinRoom = createServerFn({ method: "POST" })
  .inputValidator((d) => Profile.extend({ code: z.string().trim().length(6) }).parse(d))
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
  const { data } = await db().from("nominations").select("member_id, restaurant").eq("room_id", roomId);
  return (data ?? []) as Array<{ member_id: string; restaurant: Restaurant }>;
}

export const getRoomState = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }) => {
    const { room, member } = await authMember(data.code, data.memberId, data.token);
    const settings = { ...DEFAULT_SETTINGS, ...(room.settings as RoomSettings) };
    const [{ data: members }, { data: votes }, noms] = await Promise.all([
      db().from("members").select("id, nickname, avatar, is_host, created_at").eq("room_id", room.id).order("created_at"),
      db().from("votes").select("member_id, want_id, could_id").eq("room_id", room.id),
      loadNominations(room.id),
    ]);
    const voted = new Set((votes ?? []).map((v: any) => v.member_id));
    const showVotes = !settings.anonymous || room.status === "closed" && !settings.anonymous;
    const my = (votes ?? []).find((v: any) => v.member_id === member.id);
    return {
      code: room.code as string,
      status: room.status as "lobby" | "voting" | "closed",
      settings,
      me: { id: member.id as string, isHost: member.is_host as boolean },
      members: (members ?? []).map((m: any) => ({
        id: m.id as string,
        nickname: m.nickname as string,
        avatar: m.avatar as string,
        isHost: m.is_host as boolean,
        voted: voted.has(m.id),
      })),
      pool: buildPool(settings, noms.map((n) => n.restaurant)),
      myNomination: noms.find((n) => n.member_id === member.id)?.restaurant ?? null,
      myVote: my ? { want: my.want_id as string, could: my.could_id as string } : null,
      publicVotes: showVotes
        ? (votes ?? []).map((v: any) => ({ memberId: v.member_id as string, want: v.want_id as string, could: v.could_id as string }))
        : null,
      result: room.result as Result | null,
    };
  });

const SettingsSchema = z.object({
  center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), label: z.string().max(200) }),
  radiusKm: z.number().min(0.5).max(40),
  priceMin: z.number().int().min(1).max(4),
  priceMax: z.number().int().min(1).max(4),
  diets: z.array(z.enum(DIETS as [string, ...string[]])),
  visibility: z.enum(["public", "private"]),
  maxWait: z.number().int().min(5).max(180),
  anonymous: z.boolean(),
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
    await db().from("rooms").update({ settings: data.settings }).eq("id", room.id);
    return { ok: true };
  });

export const startVoting = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.parse(d))
  .handler(async ({ data }) => {
    const { room } = await requireHost(data);
    await db().from("rooms").update({ status: "voting" }).eq("id", room.id);
    return { ok: true };
  });

// ---------- Google Maps (through the connector gateway) ----------
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
async function gmaps(path: string, init: RequestInit & { fieldMask?: string } = {}) {
  const lk = process.env["LOVABLE_API_KEY"];
  const gk = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lk || !gk) throw new Error("Google Maps is not connected");
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lk}`,
      "X-Connection-Api-Key": gk,
      "Content-Type": "application/json",
      ...(init.fieldMask ? { "X-Goog-FieldMask": init.fieldMask } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google Maps request failed [${res.status}]: ${body}`);
    throw new Error(`Map search failed (${res.status})`);
  }
  return res.json();
}

export const geocodeCenter = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ address: z.string().trim().min(2).max(200) }).parse(d))
  .handler(async ({ data }) => {
    await requireHost(data);
    const j = await gmaps(`/maps/api/geocode/json?address=${encodeURIComponent(data.address)}`);
    const r = j.results?.[0];
    if (!r) throw new Error("Couldn't find that place");
    return { lat: r.geometry.location.lat as number, lng: r.geometry.location.lng as number, label: r.formatted_address as string };
  });

const PRICE_MAP: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ query: z.string().trim().min(2).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { room } = await authMember(data.code, data.memberId, data.token);
    const c = (room.settings as RoomSettings).center ?? DEFAULT_SETTINGS.center;
    const j = await gmaps("/places/v1/places:searchText", {
      method: "POST",
      fieldMask: "places.id,places.displayName,places.formattedAddress,places.location,places.priceLevel,places.primaryTypeDisplayName,places.types",
      body: JSON.stringify({
        textQuery: data.query,
        pageSize: 6,
        includedType: "restaurant",
        locationBias: { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: 30000 } },
      }),
    });
    return ((j.places ?? []) as any[]).map(
      (p): Restaurant => ({
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
      }),
    );
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
    const { data: myVote } = await db().from("votes").select("id").eq("member_id", member.id).maybeSingle();
    if (myVote) throw new Error("You've already voted — nominations are locked for you");
    await db().from("nominations").delete().eq("member_id", member.id);
    if (data.restaurant) {
      await db().from("nominations").insert({
        room_id: room.id,
        member_id: member.id,
        restaurant: { ...data.restaurant, custom: true, nominatedBy: member.nickname },
      });
    }
    return { ok: true };
  });

export const castVote = createServerFn({ method: "POST" })
  .inputValidator((d) => Auth.extend({ want: z.string().max(200), could: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    if (data.want === data.could) throw new Error("Pick two different places");
    const { room, member } = await authMember(data.code, data.memberId, data.token);
    if (room.status !== "voting") throw new Error("Voting isn't open");
    const noms = await loadNominations(room.id);
    const ids = new Set(buildPool(room.settings, noms.map((n) => n.restaurant)).map((r) => r.id));
    if (!ids.has(data.want) || !ids.has(data.could)) throw new Error("That place isn't in the pool");
    const { error } = await db()
      .from("votes")
      .upsert({ room_id: room.id, member_id: member.id, want_id: data.want, could_id: data.could }, { onConflict: "member_id" });
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
    if (room.status !== "voting") throw new Error("Voting isn't open");
    const [{ data: votes }, noms] = await Promise.all([
      db().from("votes").select("want_id, could_id").eq("room_id", room.id),
      loadNominations(room.id),
    ]);
    if (!votes?.length) throw new Error("Nobody has voted yet");
    const pool = buildPool(room.settings, noms.map((n) => n.restaurant));
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
    const top = scores.filter((s) => s.points === scores[0].points);
    const pick = top[Math.floor(Math.random() * top.length)];
    const result: Result = {
      winner: byId.get(pick.id)!,
      scores,
      tie: top.length > 1 ? { method: top.length === 2 ? "coin" : "wheel", candidates: top.map((t) => ({ id: t.id, name: t.name })) } : null,
    };
    await db().from("rooms").update({ status: "closed", result }).eq("id", room.id);
    return { ok: true };
  });
