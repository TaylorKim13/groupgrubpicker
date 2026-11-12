import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdministrator } = await import("./admin-access.server");
    return { administrator: await isAdministrator(context.userId) };
  });

export const listDashboardAdministrators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdministrator } = await import("./admin-access.server");
    if (!(await isAdministrator(context.userId))) throw new Error("Administrator access required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as SupabaseClient;
    const { data, error } = await client
      .from("dashboard_administrators")
      .select("email")
      .order("email");
    if (error) throw new Error("Could not load administrators. Apply dashboard migration 0007.");
    const configured = (process.env["ADMIN_EMAILS"] ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return [
      ...new Set([
        ...configured,
        ...z
          .array(z.object({ email: z.string() }))
          .parse(data)
          .map((row) => row.email),
      ]),
    ].sort();
  });

export const addDashboardAdministrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ email: z.string().trim().toLowerCase().email().max(254) }))
  .handler(async ({ context, data }) => {
    const { isAdministrator } = await import("./admin-access.server");
    if (!(await isAdministrator(context.userId))) throw new Error("Administrator access required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as SupabaseClient;
    const { error } = await client
      .from("dashboard_administrators")
      .upsert(
        { email: data.email, added_by: context.userId },
        { onConflict: "email", ignoreDuplicates: true },
      );
    if (error)
      throw new Error("Could not add administrator. Check dashboard migration 0007 is applied.");
    return { email: data.email };
  });

export const getMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdministrator } = await import("./admin-access.server");
    if (!(await isAdministrator(context.userId))) throw new Error("Administrator access required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as SupabaseClient;
    const reports = await Promise.all([
      client.from("filter_usage_metrics").select("*").single(),
      client.from("selection_abandonment_metrics").select("*").single(),
      client.from("group_creation_click_metrics").select("*").single(),
    ]);
    if (reports.some((report) => report.error || !report.data))
      throw new Error("Could not load metrics. Check that all metrics migrations are applied.");
    return {
      filters: z
        .object({
          total_voting_sessions: z.number(),
          filtered_voting_sessions: z.number(),
          location_filter_sessions: z.number(),
          price_filter_sessions: z.number(),
          filter_usage_rate_percent: z.number().nullable(),
          target_met: z.boolean().nullable(),
        })
        .parse(reports[0]!.data),
      abandonment: z
        .object({
          entered_users: z.number(),
          selected_users: z.number(),
          abandoned_users: z.number(),
          pending_users: z.number(),
          abandonment_rate_percent: z.number().nullable(),
          target_met: z.boolean().nullable(),
        })
        .parse(reports[1]!.data),
      clicks: z
        .object({
          created_groups: z.number(),
          measured_groups: z.number(),
          unmeasured_groups: z.number(),
          average_clicks: z.number().nullable(),
          measurement_coverage_percent: z.number().nullable(),
          target_met: z.boolean().nullable(),
        })
        .parse(reports[2]!.data),
      updatedAt: new Date().toISOString(),
    };
  });

export const getVotingDurationMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdministrator } = await import("./admin-access.server");
    if (!(await isAdministrator(context.userId))) throw new Error("Administrator access required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as SupabaseClient;
    const [report, sessions] = await Promise.all([
      client.from("voting_duration_metrics").select("*").single(),
      client
        .from("voting_session_durations")
        .select("*")
        .order("voting_started_at", { ascending: false })
        .limit(50),
    ]);
    if (report.error || sessions.error) {
      if (
        [report.error, sessions.error].some(
          (error) => error?.code === "PGRST205" || error?.code === "42P01",
        )
      )
        throw new Error(
          "Apply migration 0008_voting_duration.sql in Supabase SQL Editor to enable this report.",
        );
      throw new Error("Could not load voting durations. Try refreshing.");
    }
    return {
      durationSessions: z
        .array(
          z.object({
            session_id: z.string(),
            voting_started_at: z.string(),
            restaurant_selected_at: z.string().nullable(),
            duration_seconds: z.number().nullable(),
            finished_within_five_minutes: z.boolean().nullable(),
          }),
        )
        .parse(sessions.data),
      duration: z
        .object({
          total_voting_sessions: z.number(),
          completed_sessions: z.number(),
          sessions_within_five_minutes: z.number(),
          unfinished_sessions: z.number(),
          within_five_minutes_percent: z.number().nullable(),
        })
        .parse(report.data),
    };
  });


export const getMetricTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdministrator } = await import("./admin-access.server");
    if (!(await isAdministrator(context.userId))) throw new Error("Administrator access required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildMetricTrends } = await import("./metric-trends");
    const client = supabaseAdmin as unknown as SupabaseClient;
    const now = new Date();
    const since = new Date(now.getTime() - 31 * 86400000).toISOString();
    async function rows(table: string, columns: string, timestamp: string) {
      const result: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from(table).select(columns).gte(timestamp, since)
          .order(timestamp).order("id").range(offset, offset + 499);
        if (error) throw new Error("Could not load metric history. Please try refreshing.");
        result.push(...(data ?? []) as unknown as Record<string, unknown>[]);
        if (!data || data.length < 500) return result;
      }
    }
    const [filters, selections, creations] = await Promise.all([
      rows("room_filter_usage", "voting_started_at,location_filter_applied_at,price_filter_applied_at,restaurant_selected_at", "voting_started_at"),
      rows("room_selection_usage", "entered_at,selected_at,last_seen_at", "entered_at"),
      rows("group_creation_usage", "created_at,click_count", "created_at"),
    ]);
    const { z } = await import("zod");
    const nullableDate = z.string().nullable();
    return { days: buildMetricTrends(
      z.array(z.object({ voting_started_at: nullableDate, location_filter_applied_at: nullableDate, price_filter_applied_at: nullableDate, restaurant_selected_at: nullableDate })).parse(filters),
      z.array(z.object({ entered_at: z.string(), selected_at: nullableDate, last_seen_at: z.string() })).parse(selections),
      z.array(z.object({ created_at: z.string(), click_count: z.number().nullable() })).parse(creations), now), updatedAt: now.toISOString() };
  });
