import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { googleMapsRequest } from "./google-maps.server";
import { normalizeRestaurantName } from "./restaurant-rewards";

const DealSearchInputSchema = z.object({ query: z.string().trim().min(2).max(100) });

export const DealPlaceSearchResultSchema = z.object({
  placeId: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).nullable(),
});
export type DealPlaceSearchResult = z.infer<typeof DealPlaceSearchResultSchema>;

export const searchDealPlaces = createServerFn({ method: "POST" })
  .inputValidator((input) => DealSearchInputSchema.parse(input))
  .handler(async ({ data }) => {
    const response = await googleMapsRequest("/v1/places:searchText", {
      method: "POST",
      fieldMask: "places.id,places.displayName,places.formattedAddress,places.businessStatus",
      body: JSON.stringify({ textQuery: data.query, pageSize: 8, languageCode: "en" }),
    });

    return ((response.places ?? []) as any[])
      .filter(
        (place) =>
          place.id &&
          place.displayName?.text &&
          place.businessStatus !== "CLOSED_PERMANENTLY" &&
          place.businessStatus !== "CLOSED_TEMPORARILY",
      )
      .map((place) =>
        DealPlaceSearchResultSchema.parse({
          placeId: place.id,
          name: place.displayName.text,
          address: place.formattedAddress ?? null,
        }),
      );
  });

const SubmitDealSchema = z
  .object({
    placeId: z.string().trim().min(1).max(200),
    scope: z.enum(["location", "chain"]),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1500).nullable(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate),
  })
  .refine((deal) => deal.endDate >= deal.startDate, {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
  });

function isRealDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

type DealWriter = {
  from: (table: "restaurant_deals") => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
};

export const submitCommunityDeal = createServerFn({ method: "POST" })
  .inputValidator((input) => SubmitDealSchema.parse(input))
  .handler(async ({ data }) => {
    const place = await googleMapsRequest(
      `/v1/places/${encodeURIComponent(data.placeId)}?languageCode=en`,
      { method: "GET", fieldMask: "id,displayName" },
    );
    const placeId = typeof place.id === "string" ? place.id : "";
    const restaurantName =
      typeof place.displayName?.text === "string" ? place.displayName.text.trim() : "";
    const restaurantKey = normalizeRestaurantName(restaurantName);
    if (!placeId || !restaurantName || !restaurantKey) {
      throw new Error("Could not confirm that restaurant with Google Maps. Please choose it again.");
    }

    const writer = supabaseAdmin as unknown as DealWriter;
    const { error } = await writer.from("restaurant_deals").insert({
      restaurant_id: `g_${placeId}`,
      restaurant_name: restaurantName,
      restaurant_key: restaurantKey,
      place_id: placeId,
      scope: data.scope,
      title: data.title,
      description: data.description || null,
      promo_code: null,
      redemption_url: null,
      terms: null,
      start_date: data.startDate,
      end_date: data.endDate,
      status: "active",
    });
    if (error) {
      console.error(`[Community deals] Could not save deal: ${error.message}`);
      throw new Error("Could not submit the deal. Please try again.");
    }
    return { restaurantName };
  });
