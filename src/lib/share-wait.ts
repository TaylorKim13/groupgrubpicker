import type { Restaurant } from "./restaurants";

export function waitTimeMessage(restaurant: Pick<Restaurant, "name" | "wait">): string {
  return `${restaurant.name} currently has an estimated wait time of ${restaurant.wait} ${restaurant.wait === 1 ? "minute" : "minutes"}.`;
}

export function waitTimeCardUrl(restaurant: Pick<Restaurant, "name" | "wait">, origin: string): string {
  const url = new URL("/wait", origin);
  url.searchParams.set("name", restaurant.name);
  url.searchParams.set("minutes", String(restaurant.wait));
  return url.href;
}

export function waitTimeSmsUrl(
  restaurant: Pick<Restaurant, "name" | "wait">,
  userAgent: string,
  platform = "",
  maxTouchPoints = 0,
  origin?: string,
): string {
  // iPadOS can identify as a Mac; Apple's SMS composer uses &body=.
  const isAppleMobile = /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  const message = origin ? waitTimeCardUrl(restaurant, origin) : waitTimeMessage(restaurant);
  return `sms:${isAppleMobile ? "&" : "?"}body=${encodeURIComponent(message)}`;
}
