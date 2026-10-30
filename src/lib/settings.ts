import { z } from "zod";
import { DEFAULT_SETTINGS, DIETS, type RoomSettings } from "./restaurants";

export type DistanceUnit = "mi" | "km";
export const fromKm = (km: number, unit: DistanceUnit) => (unit === "mi" ? km / 1.609344 : km);
export const toKm = (value: number, unit: DistanceUnit) =>
  unit === "mi" ? value * 1.609344 : value;
export const formatDistance = (km: number, unit: DistanceUnit) =>
  `${Number(fromKm(km, unit).toFixed(1))} ${unit}`;
const SettingsFields = z.object({
  center: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    label: z.string().min(1).max(200),
  }),
  radiusKm: z.number().min(0.5).max(toKm(100, "mi")),
  priceMin: z.number().int().min(1).max(4),
  priceMax: z.number().int().min(1).max(4),
  diets: z.array(z.enum(DIETS as [(typeof DIETS)[number], ...(typeof DIETS)[number][]])),
  visibility: z.enum(["public", "private"]),
  maxWait: z.number().int().min(5).max(180),
  anonymous: z.boolean(),
});
export const SettingsSchema = SettingsFields.refine((s) => s.priceMin <= s.priceMax, {
  message: "Minimum price must not exceed maximum price",
  path: ["priceMin"],
});
export const PreferencesSchema = SettingsFields.omit({ center: true }).refine(
  (s) => s.priceMin <= s.priceMax,
  { message: "Minimum price must not exceed maximum price", path: ["priceMin"] },
);
export type RoomPreferences = z.infer<typeof PreferencesSchema>;
export const getHostingPreferences = (saved: unknown): RoomPreferences =>
  PreferencesSchema.parse({ ...DEFAULT_SETTINGS, ...(saved as object) });
export const applyHostingPreferences = (current: RoomSettings, saved: unknown): RoomSettings =>
  SettingsSchema.parse({ ...current, ...getHostingPreferences(saved) });
