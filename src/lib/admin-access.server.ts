import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function isAdministrator(userId: string) {
  const emails = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return false;
  const email = data.user.email.trim().toLowerCase();
  if (emails.includes(email)) return true;
  const client = supabaseAdmin as unknown as SupabaseClient;
  const { data: administrator, error: lookupError } = await client
    .from("dashboard_administrators")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  return !lookupError && !!administrator;
}
