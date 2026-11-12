import { z } from "zod";

export const RewardRestaurantSchema = z.object({
  placeId: z.string().min(1).max(200).nullable(),
  brandName: z.string().trim().min(1).max(120),
});

export const RewardRestaurantsSchema = z.array(RewardRestaurantSchema).max(50);
export type RewardRestaurant = z.infer<typeof RewardRestaurantSchema>;

export const RewardPlaceSearchResultSchema = z.object({
  placeId: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).nullable(),
});
export type RewardPlaceSearchResult = z.infer<typeof RewardPlaceSearchResultSchema>;

export function parseRewardRestaurants(value: unknown): RewardRestaurant[] {
  if (!Array.isArray(value)) return [];
  const output: RewardRestaurant[] = [];
  const seen = new Map<string, number>();
  for (const item of value) {
    // Preserve names saved before rewards were linked to a Google Maps result.
    const candidate = typeof item === "string" ? { placeId: null, brandName: item } : item;
    const parsed = RewardRestaurantSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const key = normalizeRestaurantName(parsed.data.brandName);
    if (!key) continue;
    const existingIndex = seen.get(key);
    if (existingIndex !== undefined) {
      if (output[existingIndex]?.placeId === null && parsed.data.placeId !== null) {
        output[existingIndex] = parsed.data;
      }
      continue;
    }
    seen.set(key, output.length);
    output.push(parsed.data);
  }
  return output.slice(0, 50);
}

export function normalizeRestaurantName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function hasRewardMatch(
  rewards: RewardRestaurant[],
  restaurantName: string,
  placeId?: string | null,
) {
  const target = normalizeRestaurantName(restaurantName);
  return rewards.some(
    (reward) =>
      reward.placeId !== null &&
      ((placeId != null && reward.placeId === placeId) ||
        (target !== "" && normalizeRestaurantName(reward.brandName) === target)),
  );
}

export function googleMapsPlaceUrl(placeId: string, name: string) {
  const query = new URLSearchParams({ api: "1", query: name, query_place_id: placeId });
  return `https://www.google.com/maps/search/?${query.toString()}`;
}
