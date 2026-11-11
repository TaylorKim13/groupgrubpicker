import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "./room.server";
import {
  DiningPreferencesSchema,
  defaultDiningPreferences,
  rankDiningSuggestions,
  type DiningMember,
  type DiningHistory,
  type DiningRanking,
  type DiningSuggestion,
} from "./dining";
import type { Restaurant, RoomSettings } from "./restaurants";
import { selectDiningSuggestions } from "./dining-ai.server";

type DiningRoom = {
  id: string;
  status: string;
  settings: RoomSettings;
  result?: { winner?: Restaurant };
};
type Seat = { id: string; user_id: string | null };
type PreferenceRow = { member_id: string; preferences: unknown };
type HistoricalSeat = {
  id: string;
  user_id: string;
  room_id: string;
  rooms: {
    status: string;
    result: { winner?: Restaurant } | null;
    closed_at: string | null;
  } | null;
};
type Feedback = {
  member_id: string;
  visited: boolean;
  enjoyed: boolean | null;
  restaurant_id: string;
};
const checkedPreferences = (value: unknown) => {
  const parsed = DiningPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultDiningPreferences();
};
function check(error: { code?: string } | null, message: string) {
  if (error?.code === "42P01" || error?.code === "PGRST205")
    throw new Error("Group suggestions aren't available yet. Please try again later.");
  if (error) throw new Error(message);
}

export async function loadDiningContext(
  room: DiningRoom,
  member: Seat,
  accountUserId: string | null,
  pool: Restaurant[],
) {
  const [
    { data: rawMembers, error: memberError },
    { data: rows, error: preferenceError },
    { data: cached, error: cacheError },
    { data: feedback, error: feedbackError },
    { data: history, error: historyError },
  ] = await Promise.all([
    db().from("members").select("id, user_id").eq("room_id", room.id).order("id"),
    db().from("room_dining_preferences").select("member_id, preferences").eq("room_id", room.id),
    db().from("room_dining_suggestions").select("*").eq("room_id", room.id).maybeSingle(),
    db()
      .from("dining_feedback")
      .select("visited, enjoyed")
      .eq("room_id", room.id)
      .eq("member_id", member.id)
      .maybeSingle(),
    db()
      .from("dining_suggestion_history")
      .select("id, context_fingerprint, suggestions, method, generated_at")
      .eq("room_id", room.id)
      .order("generated_at", { ascending: false })
      .limit(100),
  ]);
  check(memberError, "Could not load the group");
  check(preferenceError, "Could not load dining preferences");
  check(cacheError, "Could not load suggestions");
  check(feedbackError, "Could not load your feedback");
  check(historyError, "Could not load suggestion history");
  const suggestionHistory = history as {
    id: number;
    context_fingerprint: string | null;
    suggestions: DiningSuggestion[];
    method: string;
    generated_at: string;
  }[];
  const members = rawMembers as Seat[];
  const bySeat = new Map(
    (rows as PreferenceRow[]).map((row) => [row.member_id, checkedPreferences(row.preferences)]),
  );
  let mine = bySeat.get(member.id) ?? defaultDiningPreferences();
  // Only the signed-in owner can see saved defaults; a room pass alone cannot reveal them.
  if (!bySeat.has(member.id) && accountUserId && member.user_id === accountUserId) {
    const { data: saved, error } = await db()
      .from("dining_preferences")
      .select("preferences")
      .eq("user_id", accountUserId)
      .maybeSingle();
    check(error, "Could not load your saved preferences");
    if (saved) mine = { ...checkedPreferences(saved.preferences), participating: false };
  }
  const historyUsers = [
    ...new Set(
      members
        .filter((m) => {
          const p = bySeat.get(m.id);
          return m.user_id && p?.participating && p.useHistory;
        })
        .map((m) => m.user_id!),
    ),
  ];
  const histories = new Map<string, DiningHistory[]>();
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  // Bound history for each consenting user separately, so prolific users don't crowd others out.
  const historyResults = await Promise.all(
    historyUsers.map((userId) =>
      db()
        .from("members")
        .select("id, user_id, room_id, rooms(status, result, closed_at)")
        .eq("user_id", userId)
        .neq("room_id", room.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(30),
    ),
  );
  const previous: HistoricalSeat[] = [];
  for (const result of historyResults) {
    check(result.error, "Could not load dining history");
    previous.push(...(result.data as HistoricalSeat[]));
  }
  const completed = previous.filter(
    (p) => p.rooms?.status === "closed" && p.rooms.result?.winner && p.rooms.closed_at,
  );
  const { data: pastFeedback, error: pastError } = completed.length
    ? await db()
        .from("dining_feedback")
        .select("member_id, visited, enjoyed, restaurant_id")
        .in(
          "member_id",
          completed.map((p) => p.id),
        )
    : { data: [], error: null };
  check(pastError, "Could not load visit feedback");
  const pastBySeat = new Map((pastFeedback as Feedback[]).map((f) => [f.member_id, f]));
  const sharedRooms = new Map<string, Set<string>>();
  completed.forEach((p) => {
    const users = sharedRooms.get(p.room_id) ?? new Set<string>();
    users.add(p.user_id);
    sharedRooms.set(p.room_id, users);
  });
  for (const p of completed) {
    const winner = p.rooms!.result!.winner!;
    const f = pastBySeat.get(p.id);
    const confirmed = f?.restaurant_id === winner.id ? f : undefined;
    const h = histories.get(p.user_id) ?? [];
    h.push({
      restaurantId: winner.id,
      cuisine: winner.cuisine,
      selectedAt: p.rooms!.closed_at!,
      visited: confirmed?.visited ?? null,
      enjoyed: confirmed?.enjoyed ?? null,
      shared: (sharedRooms.get(p.room_id)?.size ?? 0) > 1,
    });
    histories.set(p.user_id, h);
  }
  // A single account occupying multiple seats must not get extra weight.
  const seen = new Set<string>();
  const inputs: DiningMember[] = [];
  for (const seat of members) {
    const identity = seat.user_id ?? seat.id;
    if (seen.has(identity)) continue;
    const preferences = bySeat.get(seat.id) ?? defaultDiningPreferences();
    // Prefer an explicitly participating seat if the same account has an inactive duplicate.
    if (!preferences.participating) continue;
    seen.add(identity);
    inputs.push({
      preferences,
      history: preferences.useHistory && seat.user_id ? (histories.get(seat.user_id) ?? []) : [],
    });
  }
  const orderedPool = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const settingsForSuggestions = { ...room.settings };
  delete settingsForSuggestions.setupPending;
  const contextFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        version: 4,
        day: new Date().toISOString().slice(0, 10),
        settings: settingsForSuggestions,
        members: members.map((m) => [m.id, m.user_id]),
        inputs,
        pool: orderedPool,
        ai: Boolean(process.env["GEMINI_API_KEY"]),
        model: process.env["GEMINI_MODEL"] || "gemini-3.5-flash-lite",
      }),
    )
    .digest("hex");
  const version = cached?.refresh_version ?? 0;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([contextFingerprint, version]))
    .digest("hex");
  const previouslyShown = suggestionHistory
    .filter((h) => h.context_fingerprint === contextFingerprint)
    .flatMap((h) => h.suggestions.map((s) => s.restaurant.id));
  const currentIds =
    cached?.context_fingerprint === contextFingerprint
      ? ((cached.suggestions as DiningSuggestion[] | null) ?? []).map((s) => s.restaurant.id)
      : [];
  const excluded =
    version > (cached?.generated_version ?? 0)
      ? [...previouslyShown, ...currentIds]
      : previouslyShown;
  const candidates = rankDiningSuggestions(
    orderedPool,
    room.settings,
    inputs,
    Date.now(),
    excluded,
    orderedPool.length,
  );
  const ranking = { ...candidates, suggestions: candidates.suggestions.slice(0, 3) };
  const cuisinePreferences = [
    ...new Set(
      inputs.flatMap(({ preferences }) => [
        ...preferences.favoriteCuisines,
        ...preferences.dislikedCuisines,
      ]),
    ),
  ]
    .sort()
    .map((cuisine) => ({
      cuisine,
      favorites: inputs.filter(({ preferences }) => preferences.favoriteCuisines.includes(cuisine))
        .length,
      avoids: inputs.filter(({ preferences }) => preferences.dislikedCuisines.includes(cuisine))
        .length,
    }));
  const remaining = rankDiningSuggestions(orderedPool, room.settings, inputs, Date.now(), [
    ...previouslyShown,
    ...currentIds,
  ]).eligibleCount;
  return {
    fingerprint,
    contextFingerprint,
    version,
    remaining,
    suggestionHistory,
    ranking,
    candidates: candidates.suggestions,
    cuisinePreferences,
    cached,
    mine,
    feedback: feedback as { visited: boolean; enjoyed: boolean | null } | null,
  };
}

export async function getDiningState(
  room: DiningRoom,
  member: Seat,
  accountUserId: string | null,
  pool: Restaurant[],
) {
  const context = await loadDiningContext(room, member, accountUserId, pool);
  const current =
    !!context.cached?.fingerprint &&
    (context.cached.fingerprint === context.fingerprint || room.status !== "lobby");
  return {
    preferences: context.mine,
    feedback: context.feedback,
    fingerprint: context.fingerprint,
    generated: current,
    remaining: context.remaining,
    history: context.suggestionHistory.map((h) => ({
      id: h.id,
      suggestions: h.suggestions,
      generatedAt: h.generated_at,
    })),
    pending: !current && Date.parse(context.cached?.lease_until ?? "") > Date.now(),
    ranking: current
      ? ({ ...context.ranking, suggestions: context.cached.suggestions } as DiningRanking)
      : context.ranking,
    method: current ? (context.cached.method as "rules" | "gemini") : ("rules" as const),
    demo: !process.env["GOOGLE_MAPS_API_KEY"] && !process.env["MAPS_API"],
  };
}

export async function saveDiningPreferences(
  room: DiningRoom,
  member: Seat,
  accountUserId: string | null,
  raw: unknown,
  remember: boolean,
) {
  if (room.status !== "lobby") throw new Error("Preferences are locked once voting starts");
  const preferences = DiningPreferencesSchema.parse(raw);
  const ownsSeat = accountUserId && accountUserId === member.user_id;
  if ((remember || preferences.useHistory) && !ownsSeat)
    throw new Error("Sign in and link your seat to use saved preferences or history");
  // Save account defaults first; a failed defaults write must not report success.
  if (remember) {
    const { error } = await db()
      .from("dining_preferences")
      .upsert({ user_id: accountUserId, preferences, updated_at: new Date().toISOString() });
    check(error, "Could not remember dining preferences");
  }
  const { error } = await db().from("room_dining_preferences").upsert({
    member_id: member.id,
    room_id: room.id,
    preferences,
    updated_at: new Date().toISOString(),
  });
  check(error, "Could not save dining preferences");
  return { ok: true };
}

export async function generateDiningSuggestions(
  room: DiningRoom,
  member: Seat,
  accountUserId: string | null,
  pool: Restaurant[],
) {
  if (room.status !== "lobby") throw new Error("Suggestions are locked once voting starts");
  const { fingerprint, contextFingerprint, version, candidates, cuisinePreferences, cached } =
    await loadDiningContext(room, member, accountUserId, pool);
  if (cached?.fingerprint === fingerprint) return { pending: false };
  const { data: claimed, error } = await db().rpc("claim_dining_suggestions", {
    p_room_id: room.id,
    p_fingerprint: fingerprint,
  });
  check(error, "Could not prepare suggestions");
  if (!claimed) return { pending: true };
  const explained = await selectDiningSuggestions(
    candidates,
    undefined,
    undefined,
    cuisinePreferences,
  );
  const { error: saveError } = await db().rpc("complete_dining_suggestions", {
    p_room_id: room.id,
    p_fingerprint: fingerprint,
    p_context_fingerprint: contextFingerprint,
    p_version: version,
    p_suggestions: explained.suggestions,
    p_method: explained.method,
  });
  check(saveError, "Could not save suggestions");
  return { pending: false };
}

export async function refreshDiningSuggestions(
  room: DiningRoom,
  member: Seat,
  accountUserId: string | null,
  pool: Restaurant[],
) {
  if (room.status !== "lobby") throw new Error("Suggestions are locked once voting starts");
  const context = await loadDiningContext(room, member, accountUserId, pool);
  if (context.cached?.fingerprint !== context.fingerprint)
    throw new Error("Wait for the current suggestions to finish updating");
  if (!context.remaining)
    throw new Error(
      "No more matching restaurants. Review previous suggestions or adjust the group filters.",
    );
  const { data: changed, error } = await db().rpc("refresh_dining_suggestions", {
    p_room_id: room.id,
    p_expected_fingerprint: context.fingerprint,
  });
  check(error, "Could not refresh suggestions");
  if (!changed)
    throw new Error("Suggestions are already updating. Please wait a few seconds and try again.");
  return { ok: true };
}

export async function saveDiningFeedback(room: DiningRoom, member: Seat, input: unknown) {
  if (room.status !== "closed" || !room.result?.winner)
    throw new Error("Choose a restaurant before adding visit feedback");
  const feedback = z
    .object({ visited: z.boolean(), enjoyed: z.boolean().nullable() })
    .refine((f) => f.visited || f.enjoyed === null, "Only rate restaurants you visited")
    .parse(input);
  const { error } = await db()
    .from("dining_feedback")
    .upsert({
      member_id: member.id,
      room_id: room.id,
      restaurant_id: room.result.winner.id,
      ...feedback,
      updated_at: new Date().toISOString(),
    });
  check(error, "Could not save visit feedback");
  return { ok: true };
}
