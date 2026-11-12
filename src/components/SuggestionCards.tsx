import { ArrowUpRight, ChevronRight, Clock3, Gift, Info, MapPin } from "lucide-react";
import type { DiningSuggestion } from "@/lib/dining";
import { hasRewardMatch, type RewardRestaurant } from "@/lib/restaurant-rewards";
import { priceLabel } from "@/lib/restaurants";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

// Match cuisine labels from both the curated pool and live place searches.
function foodEmoji(cuisine: string) {
  const label = cuisine.toLowerCase();
  const foods: [RegExp, string][] = [
    [/mexican|taco/, "🌮"],
    [/italian|pizza/, "🍕"],
    [/japanese|sushi/, "🍣"],
    [/chinese|dumpling/, "🥟"],
    [/indian|thai|curry/, "🍛"],
    [/vietnamese|ramen|noodle/, "🍜"],
    [/korean|barbecue|bbq/, "🍖"],
    [/healthy|salad|vegan|vegetarian|mediterranean|greek/, "🥗"],
    [/seafood|fish/, "🍤"],
    [/bakery|dessert|donut/, "🍩"],
    [/cafe|coffee/, "☕"],
    [/american|burger|fast food/, "🍔"],
  ];
  return foods.find(([pattern]) => pattern.test(label))?.[1] ?? "🍽️";
}

export function SuggestionCards({
  suggestions,
  historical = false,
  rewardRestaurants,
  onViewRestaurant,
  selectedIds = new Set<string>(),
  onAddToPool,
}: {
  onViewRestaurant?: ((id: string) => void) | undefined;
  selectedIds?: Set<string>;
  onAddToPool?: ((restaurant: DiningSuggestion["restaurant"]) => Promise<void>) | undefined;
  suggestions: DiningSuggestion[];
  historical?: boolean;
  rewardRestaurants: RewardRestaurant[];
}) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2">
      {suggestions.map((suggestion, index) => {
        const r = suggestion.restaurant;
        const emoji = foodEmoji(r.cuisine);
        const price = r.priceUnknown ? "Price unknown" : priceLabel(r.price);
        const demo = !r.google && !r.custom;
        const backdrop = "bg-muted";
        const mapsQuery = r.address ? `${r.name} ${r.address}` : `${r.lat},${r.lng}`;
        return (
          <li
            key={r.id}
            className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-background transition-shadow hover:shadow-[4px_4px_0_var(--color-border)]"
          >
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  aria-label={`View details for ${r.name}`}
                  className="flex h-full w-full cursor-pointer flex-col text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <div
                    className={`relative flex h-36 w-full items-center justify-center ${backdrop}`}
                  >
                    <span className="absolute left-3 top-3 text-xs font-medium text-muted-foreground">
                      {historical ? `Past pick ${index + 1}` : `Pick ${index + 1}`}
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-3 text-6xl drop-shadow-sm transition-transform motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-6"
                    >
                      {emoji}
                    </span>
                  </div>
                  <div className="flex w-full flex-1 flex-col p-4">
                    <h3 className="flex items-center gap-2 text-lg font-semibold leading-tight">
                      {r.name}
                      {hasRewardMatch(rewardRestaurants, r.name) && (
                        <span
                          className="shrink-0 text-brand"
                          role="img"
                          aria-label="Your rewards account matches this restaurant"
                          title="Your rewards account matches this restaurant"
                        >
                          <Gift className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                    </h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {r.cuisine} · {price}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs font-bold">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        {suggestion.warnings.length > 0 ? (
                          <>
                            <Info className="size-3.5" aria-hidden="true" /> Things to know
                          </>
                        ) : (
                          <>For your table</>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-brand">
                        Details <ChevronRight className="size-4" aria-hidden="true" />
                      </span>
                    </div>
                  </div>
                </button>
              </DialogTrigger>
              <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] gap-0 overflow-y-auto rounded-2xl border bg-card p-0 sm:rounded-2xl">
                <div className={`flex h-36 items-center justify-center ${backdrop}`}>
                  <span aria-hidden="true" className="text-7xl drop-shadow-sm">
                    {emoji}
                  </span>
                </div>
                <div className="space-y-5 p-5 sm:p-6">
                  <DialogHeader className="text-left">
                    <DialogTitle className="pr-4 text-2xl font-semibold">{r.name}</DialogTitle>
                    <DialogDescription>
                      {r.cuisine} · {price}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 rounded-xl bg-muted/60 p-4 text-sm">
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {demo
                        ? "Demo restaurant · sample location"
                        : r.address || "Street address unavailable"}
                    </p>
                    <p className="flex items-center gap-2">
                      <Clock3 className="size-4 shrink-0" aria-hidden="true" />
                      {demo
                        ? `Sample wait: ~${r.wait} min`
                        : r.google
                          ? "Wait time unknown"
                          : `Estimated wait: ~${r.wait} min`}
                    </p>
                  </div>
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-semibold">
                      Why it made the list
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {suggestion.aiExplanation ?? suggestion.reasons.join(" ")}
                    </p>
                  </div>
                  {r.diets.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold">
                        Dietary options{demo ? " (sample)" : ""}
                      </h4>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.diets.map((diet) => (
                          <span
                            key={diet}
                            className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium"
                          >
                            {diet}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(suggestion.warnings.length > 0 || historical || r.google || r.custom) && (
                    <div className="space-y-2 rounded-xl border border-border/15 bg-secondary/15 p-3 text-xs leading-relaxed">
                      <h4 className="flex items-center gap-1.5 font-bold">
                        <Info className="size-3.5" aria-hidden="true" /> Things to know
                      </h4>
                      {suggestion.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                      {(r.google || r.custom) && (
                        <p>
                          Confirm wait times and dietary or allergy suitability with the restaurant.
                        </p>
                      )}
                      {historical && (
                        <p>This earlier suggestion may no longer meet the current group filters.</p>
                      )}
                    </div>
                  )}
                  {!demo && (
                    <Button asChild variant="outline" className="w-full gap-2 rounded-xl">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in Google Maps <ArrowUpRight className="size-4" aria-hidden="true" />
                      </a>
                    </Button>
                  )}
                  {onViewRestaurant && (
                    <Button
                      variant="outline"
                      className="w-full rounded-xl"
                      onClick={() => onViewRestaurant(r.id)}
                    >
                      Show on nearby map
                    </Button>
                  )}
                  {!historical && !onAddToPool && (
                    <p className="text-center text-xs text-muted-foreground">
                      Vote for this spot in the Melting Pot below.
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            {!historical && onAddToPool && (
              <div className="mt-auto px-4 pb-4">
                <Button
                  className="w-full rounded-xl"
                  disabled={selectedIds.has(r.id)}
                  onClick={() => void onAddToPool(r)}
                >
                  {selectedIds.has(r.id) ? "Added to voting pool" : "+ Add to voting pool"}
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
