import { PreferencesSchema, getHostingPreferences } from "./settings";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { UsernameSchema } from "./recovery";
import { Buffer } from "node:buffer";
import { googleMapsRequest } from "./google-maps.server";
import {
  parseRewardRestaurants,
  RewardPlaceSearchResultSchema,
  RewardRestaurantsSchema,
} from "./restaurant-rewards";
import {
  AvatarSchema,
  PhotoUploadSchema,
  profilePhotoPath,
  PROFILE_PHOTO_BUCKET,
  MAX_STORED_PHOTO_BYTES,
} from "./profile-avatar";

export const getAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    let { data: profile, error } = await context.supabase
      .from("profiles")
      .select("display_name, avatar, distance_unit, username")
      .eq("id", context.userId)
      .single();
    let usernameAvailable = true;
    // Deployments may receive the app update before the recovery migration.
    // Keep existing account features working without the optional new column.
    if (error?.code === "42703" && error.message.includes("username")) {
      const legacy = await context.supabase
        .from("profiles")
        .select("display_name, avatar, distance_unit")
        .eq("id", context.userId)
        .single();
      profile = legacy.data ? { ...legacy.data, username: null } : null;
      error = legacy.error;
      usernameAvailable = false;
    }
    if (error || !profile) throw new Error("Could not load your profile");
    const { data: rewardData, error: rewardError } = await context.supabase
      .from("profiles")
      .select("reward_restaurants")
      .eq("id", context.userId)
      .single();
    // Older deployments may be running before this optional account setting migration.
    let rewardRestaurants = [] as ReturnType<typeof parseRewardRestaurants>;
    const rewardColumnUnavailable =
      rewardError && ["42703", "PGRST204"].includes(rewardError.code ?? "");
    if (!rewardColumnUnavailable) {
      if (rewardError || !rewardData) throw new Error("Could not load your restaurant rewards");
      rewardRestaurants = parseRewardRestaurants(rewardData.reward_restaurants);
    }
    const { data: preset, error: presetError } = await context.supabase
      .from("preset_filters")
      .select("settings")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (presetError) throw new Error("Could not load your preferences");
    return {
      profile,
      usernameAvailable,
      distanceUnit: profile.distance_unit,
      settings: preset ? getHostingPreferences(preset.settings) : null,
      rewardRestaurants,
    };
  });

const RewardSearchInputSchema = z.object({ query: z.string().trim().min(2).max(100) });

export const searchRewardPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RewardSearchInputSchema.parse(input))
  .handler(async ({ data }) => {
    const response = await googleMapsRequest("/v1/places:searchText", {
      method: "POST",
      fieldMask: "places.id,places.displayName,places.formattedAddress,places.businessStatus",
      body: JSON.stringify({
        textQuery: data.query,
        pageSize: 8,
        languageCode: "en",
      }),
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
        RewardPlaceSearchResultSchema.parse({
          placeId: place.id,
          name: place.displayName.text,
          address: place.formattedAddress ?? null,
        }),
      );
  });

export const saveRewardRestaurants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ restaurants: RewardRestaurantsSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const restaurants = parseRewardRestaurants(data.restaurants);
    const { error } = await context.supabase
      .from("profiles")
      .update({ reward_restaurants: restaurants })
      .eq("id", context.userId);
    if (error) throw new Error("Could not save your restaurant rewards. Please try again.");
    return { restaurants };
  });

export const getRewardRestaurants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("reward_restaurants")
      .eq("id", context.userId)
      .single();
    if (error?.code === "42703" || error?.code === "PGRST204") return { restaurants: [] };
    if (error || !data) throw new Error("Could not load your restaurant rewards");
    return { restaurants: parseRewardRestaurants(data.reward_restaurants) };
  });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        display_name: z.string().trim().min(1).max(24),
        avatar: AvatarSchema,
        photo: PhotoUploadSchema.optional(),
        username: UsernameSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: previous, error: readError } = await context.supabase
      .from("profiles")
      .select("avatar")
      .eq("id", context.userId)
      .single();
    if (readError) throw new Error("Could not load your profile");
    const photos = supabaseAdmin.storage.from(PROFILE_PHOTO_BUCKET);
    let avatar = data.avatar;
    let uploaded: string | null = null;
    if (data.photo) {
      const bytes = Buffer.from(data.photo, "base64");
      if (
        bytes.length > MAX_STORED_PHOTO_BYTES ||
        bytes[0] !== 0xff ||
        bytes[1] !== 0xd8 ||
        bytes[2] !== 0xff ||
        bytes[bytes.length - 2] !== 0xff ||
        bytes[bytes.length - 1] !== 0xd9
      )
        throw new Error("Invalid photo. Please choose another image.");
      uploaded = `${context.userId}/${crypto.randomUUID()}.jpg`;
      const { error } = await photos.upload(uploaded, bytes, {
        contentType: "image/jpeg",
        cacheControl: "60",
        upsert: false,
      });
      if (error) throw new Error("Could not upload your photo. Please try again.");
      avatar = photos.getPublicUrl(uploaded).data.publicUrl;
    } else if (avatar.length > 8) {
      const path = profilePhotoPath(avatar, context.userId);
      if (
        !path ||
        photos.getPublicUrl(path).data.publicUrl !== avatar ||
        avatar !== previous.avatar
      )
        throw new Error("Upload your own profile photo or choose an emoji");
    }
    const { error } = await context.supabase
      .from("profiles")
      .update({
        display_name: data.display_name,
        avatar,
        ...(data.username ? { username: data.username } : {}),
      })
      .eq("id", context.userId);
    if (error) {
      if (uploaded) await photos.remove([uploaded]);
      throw new Error(
        error.code === "23505"
          ? "That username is already in use. Choose another."
          : "Could not save your profile",
      );
    }
    const oldPath = profilePhotoPath(previous.avatar, context.userId);
    if (oldPath && previous.avatar !== avatar) {
      const { error: cleanupError } = await photos.remove([oldPath]);
      if (cleanupError) console.error("Could not remove previous profile photo");
    }
    return { ok: true, avatar };
  });
export const savePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ settings: PreferencesSchema, distanceUnit: z.enum(["mi", "km"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("save_grub_preferences", {
      new_settings: data.settings,
      new_unit: data.distanceUnit,
    });
    if (error) throw new Error("Could not save preferences. Please try again.");
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ confirmation: z.literal("DELETE") }).parse(input))
  .handler(async ({ context }) => {
    // Remove through the Storage API, not storage.objects SQL, which leaves files behind.
    const photos = supabaseAdmin.storage.from(PROFILE_PHOTO_BUCKET);
    for (;;) {
      const { data: files, error: listError } = await photos.list(context.userId, { limit: 100 });
      if (listError) throw new Error("Could not remove your profile photos. Please try again.");
      if (!files?.length) break;
      const { error: removeError } = await photos.remove(
        files.map((file) => `${context.userId}/${file.name}`),
      );
      if (removeError) throw new Error("Could not remove your profile photos. Please try again.");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error("Could not delete your account. Please try again.");
    return { ok: true };
  });
