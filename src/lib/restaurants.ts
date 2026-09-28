export type Diet = "vegetarian" | "vegan" | "gluten-free" | "halal" | "nut-free" | "dairy-free";
export const DIETS: Diet[] = ["vegetarian", "vegan", "gluten-free", "halal", "nut-free", "dairy-free"];

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  price: number; // 1-4
  wait: number; // minutes
  diets: Diet[];
  fastFood: boolean;
  lat: number;
  lng: number;
  address?: string;
  custom?: boolean;
  nominatedBy?: string;
};

export type Center = { lat: number; lng: number; label: string };

export type RoomSettings = {
  center: Center;
  radiusKm: number;
  priceMin: number;
  priceMax: number;
  diets: Diet[];
  visibility: "public" | "private";
  maxWait: number;
  anonymous: boolean;
};

export const DEFAULT_SETTINGS: RoomSettings = {
  center: { lat: 37.7749, lng: -122.4194, label: "San Francisco, CA" },
  radiusKm: 5,
  priceMin: 1,
  priceMax: 4,
  diets: [],
  visibility: "private",
  maxWait: 60,
  anonymous: true,
};

// Mock restaurants positioned relative to the search center (km offsets north/east).
const MOCK: Array<Omit<Restaurant, "lat" | "lng"> & { dn: number; de: number }> = [
  { id: "m1", name: "Taco Tornado", cuisine: "Mexican", price: 1, wait: 10, diets: ["vegetarian", "gluten-free"], fastFood: true, dn: 0.6, de: 0.4 },
  { id: "m2", name: "Saffron & Smoke", cuisine: "Indian", price: 2, wait: 25, diets: ["vegetarian", "vegan", "halal"], fastFood: false, dn: -1.1, de: 0.8 },
  { id: "m3", name: "Nonna's Table", cuisine: "Italian", price: 3, wait: 40, diets: ["vegetarian"], fastFood: false, dn: 1.8, de: -0.9 },
  { id: "m4", name: "Burger Barn", cuisine: "American", price: 1, wait: 8, diets: [], fastFood: true, dn: -0.3, de: -0.5 },
  { id: "m5", name: "Green Bowl Co.", cuisine: "Healthy", price: 2, wait: 12, diets: ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free"], fastFood: false, dn: 0.9, de: 1.6 },
  { id: "m6", name: "Umami Omakase", cuisine: "Japanese", price: 4, wait: 75, diets: ["gluten-free", "dairy-free"], fastFood: false, dn: 3.2, de: 1.1 },
  { id: "m7", name: "Pho Real", cuisine: "Vietnamese", price: 1, wait: 15, diets: ["dairy-free", "nut-free"], fastFood: false, dn: -2.0, de: -1.4 },
  { id: "m8", name: "Seoul Fire BBQ", cuisine: "Korean", price: 3, wait: 45, diets: ["dairy-free", "nut-free"], fastFood: false, dn: 2.5, de: -2.7 },
  { id: "m9", name: "Falafel Freedom", cuisine: "Middle Eastern", price: 1, wait: 10, diets: ["vegetarian", "vegan", "halal", "dairy-free"], fastFood: true, dn: -0.8, de: 2.1 },
  { id: "m10", name: "The Gilded Fork", cuisine: "French", price: 4, wait: 60, diets: ["vegetarian"], fastFood: false, dn: 4.1, de: 0.2 },
  { id: "m11", name: "Slice Society", cuisine: "Pizza", price: 1, wait: 12, diets: ["vegetarian"], fastFood: true, dn: 0.2, de: -1.8 },
  { id: "m12", name: "Bangkok Nights", cuisine: "Thai", price: 2, wait: 20, diets: ["vegan", "gluten-free", "dairy-free"], fastFood: false, dn: -3.1, de: 0.9 },
  { id: "m13", name: "Smokestack Ribs", cuisine: "BBQ", price: 2, wait: 35, diets: ["gluten-free", "dairy-free"], fastFood: false, dn: 1.3, de: 3.4 },
  { id: "m14", name: "Dim Sum Garden", cuisine: "Chinese", price: 2, wait: 30, diets: ["vegetarian", "dairy-free"], fastFood: false, dn: -4.4, de: -2.2 },
  { id: "m15", name: "Mezze & Co.", cuisine: "Mediterranean", price: 3, wait: 25, diets: ["vegetarian", "vegan", "halal", "gluten-free"], fastFood: false, dn: -1.6, de: -3.6 },
  { id: "m16", name: "Chick Chop", cuisine: "Chicken", price: 1, wait: 6, diets: ["halal", "nut-free"], fastFood: true, dn: 2.9, de: 3.9 },
  { id: "m17", name: "Harvest Kitchen", cuisine: "Farm-to-table", price: 3, wait: 50, diets: ["vegetarian", "gluten-free", "nut-free"], fastFood: false, dn: 6.2, de: -3.0 },
  { id: "m18", name: "Curry Up Now", cuisine: "Indian", price: 1, wait: 9, diets: ["vegetarian", "vegan", "halal"], fastFood: true, dn: -5.8, de: 4.2 },
];

const KM_PER_DEG_LAT = 110.574;
const kmPerDegLng = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function mockRestaurants(center: Center): Restaurant[] {
  return MOCK.map(({ dn, de, ...r }) => ({
    ...r,
    lat: center.lat + dn / KM_PER_DEG_LAT,
    lng: center.lng + de / kmPerDegLng(center.lat),
  }));
}

export function matchesFilters(r: Restaurant, s: RoomSettings) {
  if (r.price < s.priceMin || r.price > s.priceMax) return false;
  if (r.wait > s.maxWait) return false;
  if (distanceKm(s.center, r) > s.radiusKm) return false;
  if (!s.diets.every((d) => r.diets.includes(d))) return false;
  return true;
}

/** Full pool: filtered mock list + all custom nominations (always included). */
export function buildPool(s: RoomSettings, nominations: Restaurant[]): Restaurant[] {
  return [...mockRestaurants(s.center).filter((r) => matchesFilters(r, s)), ...nominations];
}

export const priceLabel = (p: number) => "$".repeat(Math.max(1, Math.min(4, p)));

export const AVATARS = ["🍕", "🌮", "🍣", "🍔", "🥟", "🍜", "🥗", "🍩", "🌶️", "🥑", "🍗", "🧋"];
