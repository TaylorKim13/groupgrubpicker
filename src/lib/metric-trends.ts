export type FilterRecord = { voting_started_at: string | null; location_filter_applied_at: string | null; price_filter_applied_at: string | null; restaurant_selected_at: string | null };
export type SelectionRecord = { entered_at: string; selected_at: string | null; last_seen_at: string };
export type CreationRecord = { created_at: string; click_count: number | null };
export function buildMetricTrends(filters: FilterRecord[], selections: SelectionRecord[], creations: CreationRecord[], now = new Date()) {
  const day = (date: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
  const buckets = new Map<string, { date: string; sessions: number; filtered: number; fast: number; entered: number; abandoned: number; pending: number; created: number; measured: number; clicks: number }>();
  // Sample midday UTC to keep consecutive Mountain calendar days stable across DST.
  const today = new Date(day(now) + "T12:00:00Z");
  for (let i = 29; i >= 0; i--) {
    const date = day(new Date(today.getTime() - i * 86400000));
    buckets.set(date, { date, sessions: 0, filtered: 0, fast: 0, entered: 0, abandoned: 0, pending: 0, created: 0, measured: 0, clicks: 0 });
  }
  for (const r of filters) {
    if (!r.voting_started_at) continue;
    const b = buckets.get(day(r.voting_started_at)); if (!b) continue;
    b.sessions++;
    if (r.location_filter_applied_at || r.price_filter_applied_at) b.filtered++;
    const duration = r.restaurant_selected_at ? Date.parse(r.restaurant_selected_at) - Date.parse(r.voting_started_at) : null;
    if (duration !== null && duration >= 0 && duration <= 300000) b.fast++;
  }
  for (const r of selections) {
    const b = buckets.get(day(r.entered_at)); if (!b) continue;
    b.entered++;
    if (!r.selected_at) {
      if (now.getTime() - Date.parse(r.last_seen_at) >= 900000) b.abandoned++;
      else b.pending++;
    }
  }
  for (const r of creations) {
    const b = buckets.get(day(r.created_at)); if (!b) continue;
    b.created++;
    if (r.click_count !== null) { b.measured++; b.clicks += r.click_count; }
  }
  const percent = (n: number, total: number) => total ? Math.round(n / total * 1000) / 10 : null;
  return [...buckets.values()].map(b => ({ ...b,
    filterRate: percent(b.filtered, b.sessions), fastRate: percent(b.fast, b.sessions),
    abandonmentRate: percent(b.abandoned, b.entered),
    averageClicks: b.measured ? Math.round(b.clicks / b.measured * 10) / 10 : null,
  }));
}
