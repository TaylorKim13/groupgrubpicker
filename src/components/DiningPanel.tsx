import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { useAccount } from "./AccountProvider";
import { SuggestionCards } from "./SuggestionCards";
import { CUISINES, DiningPreferencesSchema, type DiningPreferences } from "@/lib/dining";
import { DIETS, priceLabel, type Restaurant } from "@/lib/restaurants";
import { useDistanceUnit } from "@/lib/distance-context";
import { hasRewardMatch, type RewardRestaurant } from "@/lib/restaurant-rewards";
import { Gift } from "lucide-react";
import { fromKm, toKm } from "@/lib/settings";
import {
  getRoomDiningState,
  prepareRoomDiningSuggestions,
  saveRoomDiningPreferences,
  saveRoomDiningFeedback,
  refreshRoomDiningSuggestions,
} from "@/lib/room.functions";
import type { Session } from "@/lib/session";

export function DiningPanel({
  session,
  status,
  isHost,
  linked,
  pool,
  rewardRestaurants,
}: {
  session: Session;
  status: "lobby" | "voting" | "closed";
  isHost: boolean;
  linked: boolean;
  pool: Restaurant[];
  rewardRestaurants: RewardRestaurant[];
}) {
  const user = useAccount();
  const qc = useQueryClient();
  const load = useServerFn(getRoomDiningState);
  const prepare = useServerFn(prepareRoomDiningSuggestions);
  const requestRefresh = useServerFn(refreshRoomDiningSuggestions);
  const [refreshing, setRefreshing] = useState(false);
  const key = ["dining", session.code, session.memberId, user?.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => load({ data: session }),
    refetchInterval: status === "closed" ? false : 2500,
    retry: 1,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  async function newSuggestions() {
    setRefreshing(true);
    try {
      await requestRefresh({ data: session });
      await qc.invalidateQueries({ queryKey: ["dining", session.code] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh suggestions");
    } finally {
      setRefreshing(false);
    }
  }
  const generation = useQuery({
    queryKey: ["dining-generation", session.code, q.data?.fingerprint],
    queryFn: async () => {
      const result = await prepare({ data: session });
      if (!result.pending) void qc.invalidateQueries({ queryKey: ["dining", session.code] });
      return result;
    },
    enabled: isHost && status === "lobby" && !!q.data && !q.data.generated,
    staleTime: Infinity,
    retry: 1,
    refetchInterval: (query) => (query.state.data?.pending ? 3000 : false),
  });
  if (q.isPending)
    return (
      <p className="p-4" role="status">
        Finding suggestions for your table...
      </p>
    );
  if (q.error || !q.data)
    return (
      <section className="rounded-2xl bg-card p-5 chunky">
        <h2 className="text-xl font-extrabold">Suggestions for your table</h2>
        <p className="my-3 text-sm" role="alert">
          {q.error?.message ?? "Could not load suggestions."}
        </p>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Try again
        </Button>
      </section>
    );
  const data = q.data;
  return (
    <section className="space-y-5 rounded-2xl bg-card p-5 chunky">
      <div>
        <h2 className="text-xl font-extrabold">Suggestions for your table</h2>
        <p className="mt-2 text-sm text-muted-foreground">{data.ranking.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.ranking.participants} sharing preferences. Personal histories and votes stay
          private.
        </p>
        {data.demo && (
          <p className="mt-2 text-sm font-bold">
            Demo restaurants — these are examples, not live local listings.
          </p>
        )}
        {data.generated && (
          <p className="mt-1 text-xs text-muted-foreground">
            {data.method === "gemini"
              ? "Picked by Gemini for your table"
              : "Using preference-based picks · Gemini unavailable"}
          </p>
        )}
        {status === "lobby" && (
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm">
            {data.preferences.participating ? (
              <>
                <span className="font-bold">Your preferences are included.</span>{" "}
                {data.preferences.favoriteCuisines.length > 0 &&
                  `Favorites: ${data.preferences.favoriteCuisines.join(", ")}. `}
                {data.preferences.dislikedCuisines.length > 0 &&
                  `Avoiding ${data.preferences.dislikedCuisines.length} cuisine${data.preferences.dislikedCuisines.length === 1 ? "" : "s"}.`}
              </>
            ) : (
              <>
                <span className="font-bold">Your preferences aren’t included yet.</span> Open “Share
                my dining preferences” below and click “Use for this outing.”
              </>
            )}
          </p>
        )}
        {(data.pending || generation.isFetching) && (
          <p className="mt-2 text-sm" role="status">
            Updating the group's suggestions...
          </p>
        )}
        {generation.error && (
          <Button variant="link" onClick={() => void generation.refetch()}>
            Retry suggestion update
          </Button>
        )}
      </div>
      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current">Current suggestions</TabsTrigger>
          <TabsTrigger value="history">History ({data.history.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="current" className="space-y-4">
          {isHost && status === "lobby" && (
            <div className="space-y-2">
              <Button
                variant="outline"
                disabled={
                  refreshing ||
                  generation.isFetching ||
                  data.pending ||
                  !data.generated ||
                  data.remaining === 0
                }
                onClick={() => void newSuggestions()}
              >
                {refreshing || data.pending ? "Refreshing..." : "Refresh suggestions"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {data.generated && data.remaining === 0
                  ? "You've seen all matching options. Check History or adjust the group filters."
                  : `${data.remaining} more places to explore. No repeats.`}
              </p>
            </div>
          )}
          {!isHost && status === "lobby" && (
            <p className="text-xs text-muted-foreground">
              The host can refresh suggestions for everyone.
            </p>
          )}
          <SuggestionCards
            suggestions={data.ranking.suggestions}
            rewardRestaurants={rewardRestaurants}
          />
        </TabsContent>
        <TabsContent value="history" className="space-y-5">
          {data.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Previous sets will appear here when suggestions are refreshed or updated.
            </p>
          ) : (
            data.history.map((set) => (
              <section key={set.id} className="space-y-2">
                <h3 className="text-sm font-bold">
                  Suggested {new Date(set.generatedAt).toLocaleString()}
                </h3>
                <SuggestionCards
                  suggestions={set.suggestions}
                  historical
                  rewardRestaurants={rewardRestaurants}
                />
              </section>
            ))
          )}
        </TabsContent>
      </Tabs>
      {status === "closed" && (
        <VisitFeedback session={session} initial={data.feedback} refresh={refresh} />
      )}
      {status === "lobby" && (
        <PreferenceForm
          key={JSON.stringify(data.preferences)}
          initial={data.preferences}
          session={session}
          canRemember={!!user && linked}
          pool={pool}
          refresh={refresh}
        />
      )}
    </section>
  );
}

function SuggestionCards({
  suggestions,
  historical = false,
  rewardRestaurants,
}: {
  suggestions: DiningSuggestion[];
  historical?: boolean;
  rewardRestaurants: RewardRestaurant[];
}) {
  return (
    <ol className="grid gap-3 md:grid-cols-3">
      {suggestions.map((suggestion, index) => (
        <li key={suggestion.restaurant.id} className="rounded-xl border-2 bg-background p-4">
          <p className="text-xs font-bold text-muted-foreground">Suggestion {index + 1}</p>
          <h3 className="mt-1 flex items-center gap-2 font-bold">
            {suggestion.restaurant.name}
            {hasRewardMatch(rewardRestaurants, suggestion.restaurant.name) && (
              <span
                className="shrink-0 text-primary"
                role="img"
                aria-label="Your rewards account matches this restaurant"
                title="Your rewards account matches this restaurant"
              >
                <Gift className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
          </h3>
          <p className="text-sm">
            {suggestion.restaurant.cuisine} ·{" "}
            {suggestion.restaurant.priceUnknown
              ? "Price unknown"
              : priceLabel(suggestion.restaurant.price)}
          </p>
          <p className="mt-2 text-sm">{suggestion.aiExplanation ?? suggestion.reasons.join(" ")}</p>
          {suggestion.warnings.map((warning) => (
            <p key={warning} className="mt-2 text-xs text-muted-foreground">
              {warning}
            </p>
          ))}
          <p className="mt-2 text-xs">
            {historical
              ? "Earlier suggestion; it may no longer meet the current group filters."
              : "Find this place in the restaurant list below to vote."}
          </p>
        </li>
      ))}
    </ol>
  );
}

function PreferenceForm({
  initial,
  session,
  canRemember,
  pool,
  refresh,
}: {
  initial: DiningPreferences;
  session: Session;
  canRemember: boolean;
  pool: Restaurant[];
  refresh: () => Promise<unknown>;
}) {
  const [preferences, setPreferences] = useState(initial);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasUnsavedChanges = JSON.stringify(preferences) !== JSON.stringify(initial);
  const save = useServerFn(saveRoomDiningPreferences);
  const unit = useDistanceUnit();
  const change = (patch: Partial<DiningPreferences>) =>
    setPreferences((current) => ({ ...current, ...patch }));
  const input = "mt-1 w-full rounded-lg border-2 bg-background px-3 py-2";
  async function persist(participating: boolean) {
    setBusy(true);
    try {
      const checked = DiningPreferencesSchema.parse({
        ...preferences,
        participating,
        useHistory: canRemember && preferences.useHistory,
      });
      await save({ data: { ...session, preferences: checked, remember: canRemember && remember } });
      await refresh();
      toast.success(
        participating ? "Your preferences are included" : "Your preferences are no longer included",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save preferences");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary className="cursor-pointer font-bold">
        {initial.participating ? "Edit my dining preferences" : "Share my dining preferences"}
      </summary>
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void persist(true);
        }}
      >
        <fieldset disabled={busy} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Only your current outing choices are included. Other members won't see your individual
            preferences or past outings.
          </p>
          {(["favoriteCuisines", "dislikedCuisines"] as const).map((field) => (
            <fieldset key={field}>
              <legend className="text-sm font-bold">
                {field === "favoriteCuisines" ? "Favorite cuisines" : "Cuisines I'd rather avoid"}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {CUISINES.map((cuisine) => (
                  <label key={cuisine} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={preferences[field].includes(cuisine)}
                      onChange={(event) =>
                        change({
                          [field]: event.target.checked
                            ? [...preferences[field], cuisine]
                            : preferences[field].filter((c) => c !== cuisine),
                        })
                      }
                    />
                    {cuisine}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold">
              Maximum price
              <select
                className={input}
                value={preferences.maxPrice}
                onChange={(event) => change({ maxPrice: Number(event.target.value) })}
              >
                {[1, 2, 3, 4].map((p) => (
                  <option key={p} value={p}>
                    {priceLabel(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              Maximum distance ({unit})
              <input
                type="number"
                required
                min={unit === "mi" ? 0.4 : 0.5}
                max={unit === "mi" ? 100 : 161}
                step="any"
                className={input}
                value={Number(fromKm(preferences.maxDistanceKm, unit).toFixed(2))}
                onChange={(event) =>
                  change({ maxDistanceKm: toKm(Number(event.target.value), unit) })
                }
              />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-bold">Required dietary options</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIETS.map((diet) => (
                <label key={diet} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.diets.includes(diet)}
                    onChange={(event) =>
                      change({
                        diets: event.target.checked
                          ? [...preferences.diets, diet]
                          : preferences.diets.filter((d) => d !== diet),
                      })
                    }
                  />
                  {diet}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Unknown dietary suitability cannot satisfy a requirement. Always confirm allergies
              directly with the restaurant.
            </p>
          </fieldset>
          <label className="block text-sm font-bold">
            Something familiar or new?
            <select
              className={input}
              value={preferences.novelty}
              onChange={(event) =>
                change({ novelty: event.target.value as DiningPreferences["novelty"] })
              }
            >
              <option value="balanced">A balance</option>
              <option value="familiar">Prefer familiar places</option>
              <option value="new">Prefer somewhere new</option>
            </select>
          </label>
          <label className="block text-sm font-bold">
            Favorite from this restaurant list
            <select
              className={input}
              value=""
              onChange={(event) => {
                if (
                  event.target.value &&
                  !preferences.favoriteRestaurantIds.includes(event.target.value)
                )
                  change({
                    favoriteRestaurantIds: [
                      ...preferences.favoriteRestaurantIds,
                      event.target.value,
                    ].slice(0, 20),
                  });
              }}
            >
              <option value="">Choose a favorite (optional)</option>
              {pool.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {preferences.favoriteRestaurantIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {preferences.favoriteRestaurantIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="rounded-full border-2 px-3 py-1 text-xs"
                  onClick={() =>
                    change({
                      favoriteRestaurantIds: preferences.favoriteRestaurantIds.filter(
                        (f) => f !== id,
                      ),
                    })
                  }
                >
                  Remove {pool.find((r) => r.id === id)?.name ?? "saved favorite"}
                </button>
              ))}
            </div>
          )}
          {canRemember ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preferences.useHistory}
                  onChange={(event) => change({ useHistory: event.target.checked })}
                />
                Use my past group selections and visit feedback for this outing
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                Remember these preferences for future outings
              </label>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Sign in and link your seat to remember preferences or use history. Guests can share
              preferences for this outing.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Use for this outing"}
            </Button>
            {initial.participating && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void persist(false)}
              >
                Stop sharing for this outing
              </Button>
            )}
          </div>
          {hasUnsavedChanges && (
            <p role="status" className="rounded-lg bg-secondary/25 px-3 py-2 text-sm font-bold">
              These changes aren’t used in suggestions until you click “Use for this outing.”
            </p>
          )}
        </fieldset>
      </form>
    </details>
  );
}

function VisitFeedback({
  session,
  initial,
  refresh,
}: {
  session: Session;
  initial: { visited: boolean; enjoyed: boolean | null } | null;
  refresh: () => Promise<unknown>;
}) {
  const save = useServerFn(saveRoomDiningFeedback);
  const [busy, setBusy] = useState(false);
  async function record(visited: boolean, enjoyed: boolean | null) {
    setBusy(true);
    try {
      await save({ data: { ...session, visited, enjoyed } });
      await refresh();
      toast.success("Visit feedback saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save feedback");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto mt-8 max-w-2xl space-y-3 rounded-2xl bg-card p-5 chunky">
      <h2 className="text-xl font-extrabold">Did you eat at the winning restaurant?</h2>
      <p className="text-sm text-muted-foreground">
        A winning vote isn't a confirmed visit. Your private feedback can improve future suggestions
        when you choose to use history.
      </p>
      {initial && (
        <p className="text-sm" role="status">
          Saved:{" "}
          {initial.visited
            ? initial.enjoyed === null
              ? "Visited"
              : initial.enjoyed
                ? "Visited and liked it"
                : "Visited and didn't like it"
            : "Didn't visit"}
          . You can update this.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void record(true, true)}>
          Went and liked it
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void record(true, false)}>
          Went, wasn't for me
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void record(true, null)}>
          Went, no rating
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void record(false, null)}>
          Didn't go
        </Button>
      </div>
    </section>
  );
}
