import { z } from "zod";
import {
  DIETS,
  distanceKm,
  selectedPriceLevels,
  type Restaurant,
  type RoomSettings,
} from "./restaurants";

export const CUISINES = [
  "American",
  "Chinese",
  "Indian",
  "Italian",
  "Japanese",
  "Korean",
  "Mediterranean",
  "Mexican",
  "Thai",
  "Vietnamese",
] as const;
export const DiningPreferencesSchema = z
  .object({
    participating: z.boolean().default(false),
    favoriteCuisines: z.array(z.enum(CUISINES)).max(10).default([]),
    dislikedCuisines: z.array(z.enum(CUISINES)).max(10).default([]),
    favoriteRestaurantIds: z.array(z.string().min(1).max(200)).max(20).default([]),
    maxPrice: z.number().int().min(1).max(4).default(4),
    maxDistanceKm: z.number().min(0.5).max(161).default(20),
    diets: z
      .array(z.enum(DIETS as [(typeof DIETS)[number], ...(typeof DIETS)[number][]]))
      .max(6)
      .default([]),
    novelty: z.enum(["balanced", "familiar", "new"]).default("balanced"),
    useHistory: z.boolean().default(false),
  })
  .refine((p) => !p.favoriteCuisines.some((c) => p.dislikedCuisines.includes(c)), {
    message: "A cuisine cannot be both a favorite and a dislike.",
  });
export type DiningPreferences = z.infer<typeof DiningPreferencesSchema>;
export const defaultDiningPreferences = () => DiningPreferencesSchema.parse({});
export type DiningHistory = {
  restaurantId: string;
  cuisine: string;
  selectedAt: string;
  visited: boolean | null;
  enjoyed: boolean | null;
  shared: boolean;
};
export type DiningMember = { preferences: DiningPreferences; history: DiningHistory[] };
export type DiningSuggestion = {
  restaurant: Restaurant;
  score: number;
  reasons: string[];
  warnings: string[];
  aiExplanation?: string;
};
export type DiningRanking = {
  suggestions: DiningSuggestion[];
  message: string;
  participants: number;
  eligibleCount: number;
};
const cuisineMatch = (cuisine: string, choices: readonly string[]) =>
  choices.some((choice) => cuisine.toLowerCase().includes(choice.toLowerCase()));

/** Rankings use no votes. Histories contain selections, separately confirmed visits, and feedback. */
export function rankDiningSuggestions(
  pool: Restaurant[],
  settings: RoomSettings,
  members: DiningMember[],
  now = Date.now(),
  excludedIds: readonly string[] = [],
  limit = 3,
): DiningRanking {
  const active = members.filter((m) => m.preferences.participating);
  const requiredDiets = [
    ...new Set([...settings.diets, ...active.flatMap((m) => m.preferences.diets)]),
  ];
  const budget = Math.min(settings.priceMax, ...active.map((m) => m.preferences.maxPrice));
  const selectedPrices = selectedPriceLevels(settings);
  const allowedPrices = (selectedPrices.length ? selectedPrices : [1, 2, 3, 4]).filter(
    (price) => price <= budget,
  );
  const radius = Math.min(settings.radiusKm, ...active.map((m) => m.preferences.maxDistanceKm));
  const unique = [...new Map(pool.map((r) => [r.id, r])).values()];
  const eligible = unique.filter((r) => {
    if (excludedIds.includes(r.id)) return false;
    if (
      !Number.isFinite(r.lat) ||
      !Number.isFinite(r.lng) ||
      distanceKm(settings.center, r) > radius
    )
      return false;
    if (
      r.priceUnknown
        ? budget < 4 || (selectedPrices.length > 0 && selectedPrices.length < 4)
        : !allowedPrices.includes(r.price)
    )
      return false;
    // Google Places search matches may be suggested for dietary searches, but are
    // unverified. Custom nominations still need explicit dietary data to qualify.
    if (
      requiredDiets.length &&
      (r.custom || (!r.google && !requiredDiets.every((d) => r.diets.includes(d))))
    )
      return false;
    if (!r.google && !r.custom && r.wait > settings.maxWait) return false;
    return true;
  });
  const scored = eligible
    .map((restaurant) => {
      const km = distanceKm(settings.center, restaurant);
      const values = active.map(({ preferences: p, history }) => {
        let value = 60;
        if (cuisineMatch(restaurant.cuisine, p.favoriteCuisines)) value += 25;
        if (cuisineMatch(restaurant.cuisine, p.dislikedCuisines)) value -= 45;
        if (p.favoriteRestaurantIds.includes(restaurant.id)) value += 20;
        const relevant = p.useHistory
          ? history.filter((h) => h.restaurantId === restaurant.id)
          : [];
        // Explicit recent feedback wins over older feedback. Selection alone is not a like.
        const latestFeedback = [...relevant]
          .sort((a, b) => Date.parse(b.selectedAt) - Date.parse(a.selectedAt))
          .find((h) => h.visited && h.enjoyed !== null);
        if (latestFeedback) value += latestFeedback.enjoyed ? 18 : -35;
        if (p.useHistory) {
          const latestByRestaurant = new Map<string, DiningHistory>();
          for (const entry of [...history].sort(
            (a, b) => Date.parse(b.selectedAt) - Date.parse(a.selectedAt),
          )) {
            if (
              entry.visited &&
              entry.enjoyed !== null &&
              !latestByRestaurant.has(entry.restaurantId)
            )
              latestByRestaurant.set(entry.restaurantId, entry);
          }
          // Infer a small cuisine preference only from explicit visit feedback,
          // excluding the exact restaurant already scored above.
          const related = [...latestByRestaurant.values()].filter(
            (h) =>
              h.restaurantId !== restaurant.id &&
              CUISINES.some(
                (c) => cuisineMatch(h.cuisine, [c]) && cuisineMatch(restaurant.cuisine, [c]),
              ),
          );
          value += Math.max(
            -10,
            Math.min(
              10,
              related.reduce((sum, h) => sum + (h.enjoyed ? 4 : -4), 0),
            ),
          );
        }
        const visited = relevant.some((h) => h.visited);
        if (p.novelty === "new" && visited) value -= 20;
        if (p.novelty === "familiar" && visited) value += 12;
        if (
          p.novelty === "balanced" &&
          relevant.some((h) => {
            const age = now - Date.parse(h.selectedAt);
            return age >= 0 && age < 7 * 86400000;
          })
        )
          value -= 12;
        // Shared history gets a small additional repetition penalty, never treated as a vote.
        if (
          p.novelty !== "familiar" &&
          relevant.some((h) => h.shared && now - Date.parse(h.selectedAt) < 7 * 86400000)
        )
          value -= 5;
        value -= (10 * km) / Math.max(radius, 0.5);
        return Math.max(0, Math.min(100, value));
      });
      const mean = values.length
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 60 - (10 * km) / Math.max(radius, 0.5);
      // Protect the least-satisfied member rather than only optimizing the average.
      const score = Math.round(0.65 * mean + 0.35 * (values.length ? Math.min(...values) : mean));
      const reasons = ["Within the group's distance limit."];
      if (!restaurant.priceUnknown) reasons.push("Within the group's price range.");
      if (active.some((m) => cuisineMatch(restaurant.cuisine, m.preferences.favoriteCuisines)))
        reasons.push("Matches cuisine preferences shared for this outing.");
      if (active.some((m) => m.preferences.favoriteRestaurantIds.includes(restaurant.id)))
        reasons.push("Includes a favorite shared for this outing.");
      const warnings: string[] = [];
      if (restaurant.priceUnknown) warnings.push("Price is unknown; confirm before choosing.");
      if (restaurant.google || restaurant.custom)
        warnings.push(
          "Wait time and dietary suitability are unverified; confirm with the restaurant.",
        );
      if (active.some((m) => cuisineMatch(restaurant.cuisine, m.preferences.dislikedCuisines)))
        warnings.push("This cuisine may not suit everyone.");
      return { restaurant, score, reasons, warnings };
    })
    .sort((a, b) => b.score - a.score || a.restaurant.id.localeCompare(b.restaurant.id));
  return {
    suggestions: scored.slice(0, limit),
    eligibleCount: scored.length,
    participants: active.length,
    message: scored.length
      ? active.length
        ? "Ranked for the preferences shared at this table. Your votes still decide."
        : "Using the host's filters. Share your preferences to personalize these picks."
      : requiredDiets.length
        ? "No options have enough dietary information to meet all requirements. Confirm suitable options with the restaurant or review the requirements together."
        : "No restaurants meet the shared budget and distance limits. Review the limits together or search another area.",
  };
}
