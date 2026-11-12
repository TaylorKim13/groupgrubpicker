import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { useAccount } from "./AccountProvider";
import { SuggestionCards } from "./SuggestionCards";
import { DiningConversation } from "./DiningConversation";
import { CUISINES, DiningPreferencesSchema, type DiningPreferences } from "@/lib/dining";
import { DIETS, priceLabel, type Restaurant } from "@/lib/restaurants";
import { useDistanceUnit } from "@/lib/distance-context";
import type { RewardRestaurant } from "@/lib/restaurant-rewards";
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
  onViewRestaurant,
  selectedPool = pool,
  onAddToPool,
}: {
  onViewRestaurant?: (id: string) => void;
  session: Session;
  status: "lobby" | "voting" | "closed";
  isHost: boolean;
  linked: boolean;
  pool: Restaurant[];
  selectedPool?: Restaurant[];
  onAddToPool?: (restaurant: Restaurant) => Promise<void>;
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
        <h2 className="text-xl font-semibold">Suggestions for your table</h2>
        <p className="my-3 text-sm" role="alert">
          {q.error?.message ?? "Could not load suggestions."}
        </p>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Try again
        </Button>
      </section>
    );
  const data = q.data;
  const recentHistory = data.history.slice(0, 3);
  return (
    <section className="space-y-5 rounded-2xl bg-card p-5 chunky">
      <div>
        <h2 className="text-xl font-semibold">Suggestions for your table</h2>
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
      {status === "lobby" && (
        <PreferenceForm
          key={JSON.stringify(data.preferences)}
          initial={data.preferences}
          session={session}
          canRemember={!!user && linked}
          voiceAvailable={data.voiceAvailable}
          rewardRestaurants={rewardRestaurants}
          selectedPool={selectedPool}
          onAddToPool={onAddToPool}
          onViewRestaurant={onViewRestaurant}
          pool={pool}
          refresh={refresh}
        />
      )}
      <Tabs defaultValue="current">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="current">Current suggestions</TabsTrigger>
            <TabsTrigger value="history">History (up to 3)</TabsTrigger>
          </TabsList>
          {isHost && status === "lobby" && (
            <Button
              variant="outline"
              className="border-primary/40 bg-transparent text-primary shadow-none hover:border-primary hover:bg-primary/10 hover:text-primary"
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
          )}
        </div>
        <TabsContent value="current" className="space-y-4">
          {isHost && status === "lobby" && (
            <p className="text-xs text-muted-foreground">
              {data.generated && data.remaining === 0
                ? "You've seen all matching options. Check History or adjust the group filters."
                : `${data.remaining} more places to explore. No repeats.`}
            </p>
          )}
          {!isHost && status === "lobby" && (
            <p className="text-xs text-muted-foreground">
              The host can refresh suggestions for everyone.
            </p>
          )}
          {data.ranking.suggestions.length > 0 ? (
            <SuggestionCards
              onViewRestaurant={onViewRestaurant}
              selectedIds={new Set(selectedPool.map((restaurant) => restaurant.id))}
              onAddToPool={status === "lobby" ? onAddToPool : undefined}
              suggestions={data.ranking.suggestions}
              rewardRestaurants={rewardRestaurants}
            />
          ) : (
            <div className="space-y-3 rounded-xl border border-dashed p-5 text-center">
              <p className="font-semibold">No suggestions are available yet.</p>
              <p className="text-sm text-muted-foreground">
                {data.ranking.message} You can also search for a restaurant below and add it to the
                pool.
              </p>
              {isHost && status === "lobby" && !data.generated && !generation.isFetching && (
                <Button variant="outline" onClick={() => void generation.refetch()}>
                  Find suggestions
                </Button>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="history" className="space-y-5">
          {recentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Previous sets will appear here when suggestions are refreshed or updated.
            </p>
          ) : (
            recentHistory.map((set) => (
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
    </section>
  );
}

function PreferenceForm({
  initial,
  session,
  canRemember,
  voiceAvailable,
  rewardRestaurants,
  selectedPool,
  onAddToPool,
  onViewRestaurant,
  pool,
  refresh,
}: {
  initial: DiningPreferences;
  session: Session;
  canRemember: boolean;
  voiceAvailable: boolean;
  rewardRestaurants: RewardRestaurant[];
  selectedPool: Restaurant[];
  onAddToPool?: ((restaurant: Restaurant) => Promise<void>) | undefined;
  onViewRestaurant?: ((id: string) => void) | undefined;
  pool: Restaurant[];
  refresh: () => Promise<unknown>;
}) {
  const [preferences, setPreferences] = useState(initial);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  const hasUnsavedChanges = JSON.stringify(preferences) !== JSON.stringify(initial);
  const save = useServerFn(saveRoomDiningPreferences);
  const unit = useDistanceUnit();
  const change = (patch: Partial<DiningPreferences>) =>
    setPreferences((current) => ({ ...current, ...patch }));
  const input = "mt-1 w-full rounded-lg border bg-background px-3 py-2";
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
    <>
      <DiningConversation
        session={session}
        available={voiceAvailable}
        rewardRestaurants={rewardRestaurants}
        selectedPool={selectedPool}
        onAddToPool={onAddToPool}
        onViewRestaurant={onViewRestaurant}
        onReview={(result) => {
          setPreferences((current) => {
            const favorites = result.favoriteCuisines ?? current.favoriteCuisines;
            const dislikes = result.dislikedCuisines ?? current.dislikedCuisines;
            return {
              ...current,
              favoriteCuisines: favorites.filter((c) => !result.dislikedCuisines?.includes(c)),
              dislikedCuisines: dislikes.filter((c) => !result.favoriteCuisines?.includes(c)),
              maxPrice: result.maxPrice ?? current.maxPrice,
              maxDistanceKm: result.maxDistanceKm ?? current.maxDistanceKm,
              diets: result.diets ?? current.diets,
              novelty: result.novelty ?? current.novelty,
            };
          });
          if (details.current) {
            details.current.open = true;
            details.current.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }}
      />
      <details
        ref={details}
        data-tour="dining-preferences"
        className="group relative isolate rounded-xl border bg-background"
      >
        <summary className="flex list-none cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-3 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>
            {initial.participating ? "Edit my dining preferences" : "Share my dining preferences"}
          </span>
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <form
          className="border-t px-4 pb-4 pt-4"
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
    </>
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
    <section className="mx-auto mt-8 max-w-2xl space-y-3 rounded-2xl border-2 border-input bg-card p-5 text-card-foreground shadow-sm dark:border-neutral-500 dark:bg-neutral-800">
      <h2 className="text-xl font-semibold">Did you eat at the winning restaurant?</h2>
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
