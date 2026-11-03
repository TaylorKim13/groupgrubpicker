import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMetrics, getVotingDurationMetrics } from "@/lib/metrics.functions";
import { Button } from "./ui/button";
import { DashboardAdministrators } from "./DashboardAdministrators";

const number = (value: number | null, suffix = "") =>
  value === null ? "No data" : `${value}${suffix}`;
const status = (value: boolean | null) =>
  value === null ? "Awaiting complete data" : value ? "Target met" : "Below target";

export function MetricsDashboard({ userId }: { userId: string }) {
  const fetchMetrics = useServerFn(getMetrics);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-metrics", userId],
    queryFn: () => fetchMetrics(),
    refetchInterval: 30000,
  });
  const data = query.data;
  return (
    <section className="space-y-5 py-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Tracking metrics</h2>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
            void queryClient.invalidateQueries({ queryKey: ["admin-voting-duration", userId] });
          }}
        >
          {query.isFetching ? "Refreshing..." : "Refresh"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        All-time results. Updates every 30 seconds while this tab is open.
      </p>
      {query.isPending && <p role="status">Loading metrics...</p>}
      {query.error && <p role="alert">Could not load metrics. Try refreshing.</p>}
      {data && (
        <>
          <VotingDurationCard userId={userId} />
          <article className="space-y-2 rounded-lg border-2 bg-card p-5">
            <h3 className="text-lg font-bold">Location and price filters</h3>
            <p className="text-3xl font-extrabold">
              {number(data.filters.filter_usage_rate_percent, "%")}
            </p>
            <p>
              {data.filters.filtered_voting_sessions} of {data.filters.total_voting_sessions} voting
              sessions used filters.
            </p>
            <p className="text-sm">
              Location: {data.filters.location_filter_sessions} · Price:{" "}
              {data.filters.price_filter_sessions}
            </p>
            <p className="font-bold">{status(data.filters.target_met)} · Goal: at least 60%</p>
          </article>
          <article className="space-y-2 rounded-lg border-2 bg-card p-5">
            <h3 className="text-lg font-bold">Selection abandonment</h3>
            <p className="text-3xl font-extrabold">
              {number(data.abandonment.abandonment_rate_percent, "%")}
            </p>
            <p>
              {data.abandonment.entered_users} participants entered ·{" "}
              {data.abandonment.selected_users} voted
            </p>
            <p>
              {data.abandonment.abandoned_users} abandoned · {data.abandonment.pending_users}{" "}
              pending
            </p>
            <p className="font-bold">{status(data.abandonment.target_met)} · Goal: below 20%</p>
            <p className="text-sm text-muted-foreground">
              A participant counts as abandoned after 15 minutes without activity or a successful
              vote. Pending participants make this rate provisional.
            </p>
          </article>
          <article className="space-y-2 rounded-lg border-2 bg-card p-5">
            <h3 className="text-lg font-bold">Room creation clicks</h3>
            <p className="text-3xl font-extrabold">
              {number(data.clicks.average_clicks)}{" "}
              <span className="text-base font-medium">average clicks</span>
            </p>
            <p>
              {data.clicks.measured_groups} of {data.clicks.created_groups} creations measured ·{" "}
              {data.clicks.unmeasured_groups} missing
            </p>
            <p>Coverage: {number(data.clicks.measurement_coverage_percent, "%")}</p>
            <p className="font-bold">{status(data.clicks.target_met)} · Goal: 3 clicks or fewer</p>
            <p className="text-sm text-muted-foreground">
              The average uses measured creations. Target status requires complete coverage.
            </p>
          </article>
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(data.updatedAt).toLocaleString()}
          </p>
        </>
      )}
      <DashboardAdministrators userId={userId} />
    </section>
  );
}

function VotingDurationCard({ userId }: { userId: string }) {
  const fetchDuration = useServerFn(getVotingDurationMetrics);
  const query = useQuery({
    queryKey: ["admin-voting-duration", userId],
    queryFn: () => fetchDuration(),
    refetchInterval: 30000,
    retry: false,
  });
  const queryClient = useQueryClient();
  const data = query.data;
  if (query.isPending) return <p role="status">Loading five-minute selection report...</p>;
  if (query.error)
    return (
      <article className="space-y-2 rounded-lg border-2 bg-card p-5">
        <h3 className="text-lg font-bold">Restaurant selected within 5 minutes</h3>
        <p role="alert">{query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </article>
    );
  if (!data) return null;
  return (
    <article className="space-y-2 rounded-lg border-2 bg-card p-5">
      <h3 className="text-lg font-bold">Restaurant selected within 5 minutes</h3>
      <p className="text-3xl font-extrabold">
        {data.duration.sessions_within_five_minutes} of {data.duration.total_voting_sessions}{" "}
        sessions
      </p>
      <p>
        {number(data.duration.within_five_minutes_percent, "%")} finished within five minutes of
        voting starting.
      </p>
      <p>
        {data.duration.completed_sessions} completed · {data.duration.unfinished_sessions}{" "}
        unfinished
      </p>
      <p className="text-sm text-muted-foreground">
        Includes all tracked sessions that started voting. Exactly 5 minutes qualifies. Unfinished
        sessions stay in the total.
      </p>
      <details>
        <summary className="cursor-pointer font-bold">Recent session times (latest 50)</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Voting started</th>
                <th className="p-2">Time to selection</th>
                <th className="p-2">Within 5 min</th>
              </tr>
            </thead>
            <tbody>
              {data.durationSessions.map((session) => (
                <tr key={session.session_id} className="border-t">
                  <td className="p-2">{new Date(session.voting_started_at).toLocaleString()}</td>
                  <td className="p-2">
                    {session.duration_seconds === null
                      ? "Unfinished"
                      : `${Math.floor(session.duration_seconds / 60)}m ${Math.floor(session.duration_seconds % 60)}s`}
                  </td>
                  <td className="p-2">
                    {session.finished_within_five_minutes === null
                      ? "Pending"
                      : session.finished_within_five_minutes
                        ? "Yes"
                        : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.durationSessions.length && <p>No voting sessions yet.</p>}
        </div>
      </details>
    </article>
  );
}
