import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeRestaurantName } from "./restaurant-rewards";

export type RestaurantDeal = {
  id: string;
  restaurant_id: string;
  restaurant_name: string | null;
  restaurant_key: string | null;
  place_id: string | null;
  scope: "location" | "chain" | null;
  title: string;
  description: string | null;
  promo_code: string | null;
  redemption_url: string | null;
  terms: string | null;
  start_date: string | null;
  end_date: string | null;
};

type DealQueryResult = {
  data: RestaurantDeal[] | null;
  error: { message: string } | null;
};

type DealQuery = {
  in: (column: "restaurant_id" | "restaurant_key", values: string[]) => {
    eq: (column: "status", value: "active") => {
      eq: (column: "scope", value: "chain") => PromiseLike<DealQueryResult>;
    } & PromiseLike<DealQueryResult>;
  };
};

type DealTableReader = {
  from: (table: "restaurant_deals") => {
    select: (columns: string) => DealQuery;
  };
};

async function fetchRestaurantDeals(
  restaurantIds: string[],
  restaurantNames: string[],
): Promise<RestaurantDeal[]> {
  const restaurantKeys = [...new Set(restaurantNames.map(normalizeRestaurantName).filter(Boolean))];
  const queries: PromiseLike<DealQueryResult>[] = [];
  const reader = supabase as unknown as DealTableReader;
  if (restaurantIds.length) {
    queries.push(
      reader
        .from("restaurant_deals")
        .select("id,restaurant_id,restaurant_name,restaurant_key,place_id,scope,title,description,promo_code,redemption_url,terms,start_date,end_date")
        .in("restaurant_id", restaurantIds)
        .eq("status", "active"),
    );
  }
  if (restaurantKeys.length) {
    queries.push(
      reader
        .from("restaurant_deals")
        .select("id,restaurant_id,restaurant_name,restaurant_key,place_id,scope,title,description,promo_code,redemption_url,terms,start_date,end_date")
        .in("restaurant_key", restaurantKeys)
        .eq("status", "active")
        .eq("scope", "chain"),
    );
  }

  const results = await Promise.all(queries);
  const errors = results.find((result) => result.error);
  if (errors?.error) throw new Error(errors.error.message);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const unique = new Map<string, RestaurantDeal>();
  for (const result of results) {
    for (const deal of result.data ?? []) {
      if (
        (deal.start_date && deal.start_date > today) ||
        (deal.end_date && deal.end_date < today)
      ) {
        continue;
      }
      unique.set(deal.id, deal);
    }
  }
  return [...unique.values()];
}

export function useRestaurantDeals(
  restaurantIds: readonly string[],
  restaurantNames: readonly string[] = [],
) {
  const restaurants = restaurantIds
    .map((id, index) => ({ id, name: restaurantNames[index] ?? "" }))
    .filter((restaurant, index, all) => all.findIndex((item) => item.id === restaurant.id) === index)
    .sort((a, b) => a.id.localeCompare(b.id));
  const ids = restaurants.map((restaurant) => restaurant.id);
  const names = restaurants.map((restaurant) => restaurant.name);
  const query = useQuery({
    queryKey: ["restaurant-deals", ids, names],
    queryFn: () => fetchRestaurantDeals(ids, names),
    enabled: ids.length > 0 || names.length > 0,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    retry: 1,
  });

  const dealsByRestaurant = useMemo(() => {
    const grouped = new Map<string, RestaurantDeal[]>();
    for (const deal of query.data ?? []) {
      const deals = grouped.get(deal.restaurant_id) ?? [];
      deals.push(deal);
      grouped.set(deal.restaurant_id, deals);
    }
    for (const deal of query.data ?? []) {
      if (deal.scope !== "chain" || !deal.restaurant_key) continue;
      for (const restaurant of restaurants) {
        if (normalizeRestaurantName(restaurant.name) !== deal.restaurant_key) continue;
        const deals = grouped.get(restaurant.id) ?? [];
        if (!deals.some((item) => item.id === deal.id)) grouped.set(restaurant.id, [...deals, deal]);
      }
    }
    return grouped;
  }, [query.data, restaurants]);

  return dealsByRestaurant;
}
