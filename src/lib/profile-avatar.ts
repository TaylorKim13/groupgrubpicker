import { z } from "zod";

export const PROFILE_PHOTO_BUCKET = "profile-photos";
export const MAX_PHOTO_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_STORED_PHOTO_BYTES = 1024 * 1024;
export const MAX_PHOTO_BASE64_LENGTH = Math.ceil(MAX_STORED_PHOTO_BYTES / 3) * 4;
const photoPath =
  /^\/storage\/v1\/object\/public\/profile-photos\/([\da-f-]{36})\/([\da-f-]{36}\.jpg)$/i;
export function profilePhotoPath(value: string, userId?: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".supabase.co") ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return null;
    const match = photoPath.exec(url.pathname);
    if (!match || (userId && match[1] !== userId)) return null;
    return `${match[1]}/${match[2]}`;
  } catch {
    return null;
  }
}
export const isProfilePhoto = (value: string) => profilePhotoPath(value) !== null;

const namedAvatars: Record<string, string> = {
  pizza: "\u{1F355}", taco: "\u{1F32E}", sushi: "\u{1F363}",
  burger: "\u{1F354}", dumpling: "\u{1F95F}", ramen: "\u{1F35C}",
  salad: "\u{1F957}", donut: "\u{1F369}", pepper: "\u{1F336}\uFE0F",
  avocado: "\u{1F951}", chicken: "\u{1F357}", boba: "\u{1F9CB}",
};

/** Older saved profiles can contain an avatar name instead of its emoji. */
export function avatarEmoji(value: string): string {
  return namedAvatars[value.trim().toLowerCase().replace(/^:|:$/g, "")] ?? value;
}
export const AvatarSchema = z.union([
  z.string().min(1).max(8),
  z.string().max(2048).refine(isProfilePhoto, "Choose an emoji or upload a profile photo"),
]);
export const PhotoUploadSchema = z
  .string()
  .min(4)
  .max(MAX_PHOTO_BASE64_LENGTH)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
export function validateProfilePhotoFile(file: { type: string; size: number }) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPG, PNG, or WebP photo");
  if (!file.size || file.size > MAX_PHOTO_FILE_BYTES)
    throw new Error("Choose a photo smaller than 5 MB");
}
