import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Every privileged operation checks the current server-side administrator allowlist.
async function admin(userId: string) {
  const { isAdministrator } = await import("./admin-access.server");
  if (!(await isAdministrator(userId))) throw new Error("Administrator access required");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
    const client = await admin(context.userId);
    const users: { id: string; email: string; createdAt: string }[] = [];
    // Supabase returns users in pages; continue until the complete list is loaded.
    for (let page = 1; ; page++) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error("Could not load users");
      users.push(...data.users.map((user) => ({ id: user.id, email: user.email ?? "", createdAt: user.created_at })));
      if (data.users.length < 1000) break;
    }
    return users;
  });

export const saveManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid().optional(), email: z.string().trim().email().max(254), password: z.string().max(128).optional() }).refine((v) => v.id ? !v.password || v.password.length >= 8 : !!v.password && v.password.length >= 8, "Password must be at least 8 characters"))
  .handler(async ({ context, data }) => {
    const client = await admin(context.userId);
    const attributes = { email: data.email, ...(data.password ? { password: data.password } : {}) };
    const result = data.id
      ? await client.auth.admin.updateUserById(data.id, attributes)
      : await client.auth.admin.createUser({ ...attributes, email_confirm: true });
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

export const deleteManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const client = await admin(context.userId);
    if (context.userId === data.id) throw new Error("You cannot delete your own account here");
    const { error } = await client.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listManagedDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
    const client = await admin(context.userId) as unknown as SupabaseClient;
    const deals: { id: string; restaurant_name: string; title: string; description: string | null; status: string }[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await client.from("restaurant_deals").select("id,restaurant_name,title,description,status").order("created_at", { ascending: false }).order("id").range(start, start + 499);
      if (error) throw new Error("Could not load deals");
      deals.push(...data as typeof deals);
      if (data.length < 500) break;
    }
    return deals;
  });

export const updateManagedDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), title: z.string().trim().min(3).max(120), description: z.string().trim().max(1500), status: z.enum(["active", "inactive"]) }))
  .handler(async ({ context, data }) => {
    const client = await admin(context.userId) as unknown as SupabaseClient;
    // Clear the generated summary so stale text never contradicts an edited deal.
    const { error } = await client.from("restaurant_deals").update({ title: data.title, description: data.description || null, status: data.status, polished_summary: null }).eq("id", data.id);
    if (error) throw new Error("Could not update deal");
    return { ok: true };
  });

export const deleteManagedDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const client = await admin(context.userId) as unknown as SupabaseClient;
    const { error } = await client.from("restaurant_deals").delete().eq("id", data.id);
    if (error) throw new Error("Could not delete deal");
    return { ok: true };
  });
