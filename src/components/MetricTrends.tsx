import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getMetricTrends } from "@/lib/metrics.functions";
import { Button } from "./ui/button";

const metrics = {
  filterRate: { label: "Filter usage", unit: "%", target: 60, goal: "Goal: at least 60%" },
  abandonmentRate: { label: "Selection abandonment", unit: "%", target: 20, goal: "Goal: below 20%" },
  averageClicks: { label: "Average creation clicks", unit: " clicks", target: 3, goal: "Goal: 3 clicks or fewer" },
  fastRate: { label: "Selected within 5 minutes", unit: "%", target: null, goal: "Includes unfinished voting sessions in the denominator" },
};
export function MetricTrends({ userId }: { userId: string }) {
  const [metric, setMetric] = useState<keyof typeof metrics>("filterRate");
  const fetchTrends = useServerFn(getMetricTrends);
  const query = useQuery({ queryKey: ["admin-metric-trends", userId], queryFn: () => fetchTrends(), refetchInterval: 30000 });
  const selected = metrics[metric];
  const days = query.data?.days ?? [];
  const hasData = days.some(day => day[metric] !== null);
  return (
    <article className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">Performance over time</h3>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Metric
          <select className="rounded-lg px-3 py-2" value={metric} onChange={e => setMetric(e.target.value as keyof typeof metrics)}>
            {Object.entries(metrics).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </select>
        </label>
      </div>
      <p className="text-sm text-muted-foreground">Last 30 days, grouped by day in Mountain Time. Each point shows that day's results, rather than an all-time average.</p>
      {query.isPending ? <p role="status">Loading trends...</p> : query.error ? (
        <div><p role="alert">Could not load trends.</p><Button variant="link" onClick={() => void query.refetch()}>Retry</Button></div>
      ) : !hasData ? <p className="rounded-lg bg-muted p-6 text-center text-sm">No recorded data for this metric in the last 30 days.</p> : (
        <div className="h-72 w-full min-w-0 text-xs" role="img" aria-label={`${selected.label} daily trend for the last 30 days. Data also available in the table below.`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={days} margin={{ top: 12, right: 12, bottom: 8, left: 0 }} accessibilityLayer>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={date => date.slice(5)} minTickGap={32} stroke="var(--muted-foreground)" />
              <YAxis width={48} domain={selected.unit === "%" ? [0, 100] : [0, "auto"]} stroke="var(--muted-foreground)" tickFormatter={value => `${value}${selected.unit === "%" ? "%" : ""}`} />
              <Tooltip contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--input)", color: "var(--foreground)", borderRadius: 8 }} formatter={value => [`${value}${selected.unit}`, selected.label]} />
              {selected.target !== null && <ReferenceLine y={selected.target} stroke="var(--muted-foreground)" strokeDasharray="5 5" />}
              <Line type="linear" dataKey={metric} name={selected.label} stroke="var(--primary)" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{selected.goal}. Missing days are gaps. Recent abandonment is provisional; unmeasured creation clicks are excluded.</p>
      {days.length > 0 && <details>
        <summary className="cursor-pointer text-sm font-semibold">View daily data</summary>
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead><tr><th className="p-2">Date</th><th className="p-2">{selected.label}</th><th className="p-2">Sample size</th></tr></thead>
            <tbody>{days.map(day => <tr key={day.date} className="border-t">
              <td className="p-2">{day.date}</td>
              <td className="p-2">{day[metric] === null ? "No data" : `${day[metric]}${selected.unit}`}</td>
              <td className="p-2">{metric === "averageClicks" ? `${day.measured} / ${day.created} creations measured` : metric === "abandonmentRate" ? `${day.entered} participants (${day.pending} pending)` : `${day.sessions} voting sessions`}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
    </article>
  );
}
