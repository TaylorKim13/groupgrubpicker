import { PreferencesSchema, getHostingPreferences } from "./settings";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { Buffer } from "node:buffer";
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
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("display_name, avatar, distance_unit")
      .eq("id", context.userId)
      .single();
    if (error) throw new Error("Could not load your profile");
    const { data: preset, error: presetError } = await context.supabase
      .from("preset_filters")
      .select("settings")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (presetError) throw new Error("Could not load your preferences");
    return {
      profile,
      distanceUnit: profile.distance_unit,
      settings: preset ? getHostingPreferences(preset.settings) : null,
    };
  });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        display_name: z.string().trim().min(1).max(24),
        avatar: AvatarSchema,
        photo: PhotoUploadSchema.optional(),
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
      .update({ display_name: data.display_name, avatar })
      .eq("id", context.userId);
    if (error) {
      if (uploaded) await photos.remove([uploaded]);
      throw new Error("Could not save your profile");
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
