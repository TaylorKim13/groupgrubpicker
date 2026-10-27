import { z } from "zod";
import { DIETS } from "./restaurants";

export type DistanceUnit = "mi" | "km";
export const fromKm = (km: number, unit: DistanceUnit) => (unit === "mi" ? km / 1.609344 : km);
export const toKm = (value: number, unit: DistanceUnit) =>
  unit === "mi" ? value * 1.609344 : value;
export const formatDistance = (km: number, unit: DistanceUnit) =>
  `${Number(fromKm(km, unit).toFixed(1))} ${unit}`;
export const SettingsSchema = z
  .object({
    center: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      label: z.string().min(1).max(200),
    }),
    radiusKm: z.number().min(0.5).max(40),
    priceMin: z.number().int().min(1).max(4),
    priceMax: z.number().int().min(1).max(4),
    diets: z.array(z.enum(DIETS as [(typeof DIETS)[number], ...(typeof DIETS)[number][]])),
    visibility: z.enum(["public", "private"]),
    maxWait: z.number().int().min(5).max(180),
    anonymous: z.boolean(),
  })
  .refine((s) => s.priceMin <= s.priceMax, {
    message: "Minimum price must not exceed maximum price",
    path: ["priceMin"],
  });
