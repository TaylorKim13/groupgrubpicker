import type { Restaurant } from "./restaurants";

export function directionsUrl(r: Pick<Restaurant, "lat" | "lng">) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${r.lat},${r.lng}`)}`;
}

export function googlePriceLabel(r: Pick<Restaurant, "priceRange">): string | null {
  const range = r.priceRange;
  if (!range?.startPrice) return null;
  const money = (m: NonNullable<typeof range.startPrice>) => {
    const amount = Number(m.units) + (m.nanos ?? 0) / 1e9;
    if (!Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(m.currencyCode)) return null;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: m.currencyCode, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  };
  const low = money(range.startPrice);
  if (!low) return null;
  if (!range.endPrice) return `${low}+`;
  if (range.endPrice.currencyCode !== range.startPrice.currencyCode) return null;
  const high = money(range.endPrice);
  return high ? `${low}–${high}` : null;
}
