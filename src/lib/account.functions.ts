import { PreferencesSchema, getHostingPreferences } from "./settings";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
      .object({ display_name: z.string().trim().min(1).max(24), avatar: z.string().min(1).max(8) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles").update(data).eq("id", context.userId);
    if (error) throw new Error("Could not save your profile");
    return { ok: true };
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
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error("Could not delete your account. Please try again.");
    return { ok: true };
  });
