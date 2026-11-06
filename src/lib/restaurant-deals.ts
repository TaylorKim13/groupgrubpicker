import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RestaurantDeal = {
  restaurant_id: string;
  title: string;
  description: string | null;
  promo_code: string | null;
  redemption_url: string | null;
  terms: string | null;
};

type DealQueryResult = {
  data: RestaurantDeal[] | null;
  error: { message: string } | null;
};

type DealQuery = {
  in: (column: "restaurant_id", values: string[]) => {
    eq: (column: "status", value: "active") => PromiseLike<DealQueryResult>;
  };
};

type DealTableReader = {
  from: (table: "restaurant_deals") => {
    select: (columns: string) => DealQuery;
  };
};

async function fetchRestaurantDeals(restaurantIds: string[]): Promise<RestaurantDeal[]> {
  const reader = supabase as unknown as DealTableReader;
  const { data, error } = await reader
    .from("restaurant_deals")
    .select("restaurant_id,title,description,promo_code,redemption_url,terms")
    .in("restaurant_id", restaurantIds)
    .eq("status", "active");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export function useRestaurantDeals(restaurantIds: readonly string[]) {
  const ids = [...new Set(restaurantIds)].sort();
  const query = useQuery({
    queryKey: ["restaurant-deals", ids],
    queryFn: () => fetchRestaurantDeals(ids),
    enabled: ids.length > 0,
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
    return grouped;
  }, [query.data]);

  return dealsByRestaurant;
}
