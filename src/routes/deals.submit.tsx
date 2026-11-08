import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  searchDealPlaces,
  submitCommunityDeal,
  type DealPlaceSearchResult,
} from "@/lib/community-deals.functions";

export const Route = createFileRoute("/deals/submit")({ component: SubmitDealPage });

function SubmitDealPage() {
  const searchPlaces = useServerFn(searchDealPlaces);
  const submitDeal = useServerFn(submitCommunityDeal);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DealPlaceSearchResult[]>([]);
  const [place, setPlace] = useState<DealPlaceSearchResult | null>(null);
  const [scope, setScope] = useState<"location" | "chain">("location");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchComplete, setSearchComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submittedName, setSubmittedName] = useState<string | null>(null);
  const [submissionPolished, setSubmissionPolished] = useState<boolean | null>(null);
  const inputClass = "mt-2 w-full rounded-lg border-2 bg-card px-4 py-3";

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2 || searching) return;
    setSearching(true);
    setSearchComplete(false);
    setPlace(null);
    setResults([]);
    try {
      setResults(await searchPlaces({ data: { query: value } }));
      setSearchComplete(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google Maps search failed");
    } finally {
      setSearching(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!place || busy) return;
    setBusy(true);
    try {
      const result = await submitDeal({
        data: {
          placeId: place.placeId,
          scope,
          title,
          description: description.trim() || null,
          startDate,
          endDate,
        },
      });
      setSubmittedName(result.restaurantName);
      setSubmissionPolished(result.polished);
      setQuery("");
      setResults([]);
      setPlace(null);
      setTitle("");
      setDescription("");
      setStartDate("");
      setEndDate("");
      toast.success(
        result.polished
          ? "Polished deal shared with the community"
          : "Deal shared with the community",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit the deal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <header className="flex items-center justify-between gap-3 border-b-2 pb-5">
        <Link to="/" className="font-display text-2xl font-extrabold">
          GROUP<span className="text-primary"> GRUB</span>
        </Link>
        <Button variant="ghost" asChild>
          <Link to="/">
            <ArrowLeft />
            Back to start
          </Link>
        </Button>
      </header>

      <section className="py-8">
        <p className="text-sm font-bold uppercase text-primary">Good deals are better shared</p>
        <h1 className="mt-2 text-3xl font-extrabold">Share a restaurant deal</h1>
        <p className="mt-3 text-muted-foreground">
          Add a current offer for a restaurant. Community deals appear on matching restaurant cards
          while they are active.
        </p>

        {submittedName && (
          <div
            role="status"
            className="mt-6 rounded-xl border-2 bg-secondary p-4 text-secondary-foreground"
          >
            <p className="font-bold">Thanks for sharing a deal for {submittedName}.</p>
            <p className="mt-1 text-sm text-secondary-foreground/80">
              {submissionPolished
                ? "The AI-polished summary is now shown to the community. Your original entry is saved too."
                : "The deal was saved with your original wording because AI polishing was unavailable."} You
              can add another deal below, or return to the table page.
            </p>
          </div>
        )}

        <section className="mt-6 rounded-xl border-2 p-4">
          <h2 className="font-bold">1. Choose the restaurant on Google Maps</h2>
          <form className="mt-3 flex gap-2" onSubmit={(event) => void search(event)}>
            <label className="sr-only" htmlFor="deal-restaurant-search">
              Search Google Maps for a restaurant
            </label>
            <input
              id="deal-restaurant-search"
              className="min-w-0 flex-1 rounded-lg border-2 bg-card px-4 py-3"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setResults([]);
                setPlace(null);
                setSearchComplete(false);
              }}
              placeholder="Restaurant or chain"
              maxLength={100}
              disabled={busy || searching}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={busy || searching || query.trim().length < 2}
            >
              <Search />
              {searching ? "Searching…" : "Search Maps"}
            </Button>
          </form>

          {results.length > 0 && !place && (
            <>
              <ul className="mt-3 divide-y-2 rounded-lg border-2 px-3">
                {results.map((result) => (
                  <li key={result.placeId} className="py-2">
                    <button
                      type="button"
                      className="w-full rounded-lg p-2 text-left hover:bg-muted"
                      disabled={busy}
                      onClick={() => setPlace(result)}
                    >
                      <span className="block font-bold">{result.name}</span>
                      <span className="mt-1 flex items-start gap-1 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                        {result.address ?? "Address not listed"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Results provided by Google Maps.</p>
            </>
          )}

          {place && (
            <div className="mt-3 rounded-lg bg-secondary p-3 text-secondary-foreground">
              <p className="font-bold">{place.name}</p>
              <p className="mt-1 text-sm text-secondary-foreground/80">
                {place.address ?? "Address not listed"}
              </p>
              <button
                type="button"
                className="mt-2 text-sm font-semibold underline"
                disabled={busy}
                onClick={() => setPlace(null)}
              >
                Choose a different listing
              </button>
            </div>
          )}
          {searchComplete && results.length === 0 && !place && (
            <p className="mt-3 text-sm text-muted-foreground">
              No Maps results yet. Search above to choose a restaurant listing.
            </p>
          )}
        </section>

        <form className="mt-6 space-y-5" onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy} className="space-y-5">
            <fieldset className="rounded-xl border-2 p-4">
              <legend className="px-1 font-bold">2. Where does the deal apply?</legend>
              <label className="flex cursor-pointer items-start gap-3 py-2">
                <input
                  className="mt-1"
                  type="radio"
                  name="deal-scope"
                  value="location"
                  checked={scope === "location"}
                  onChange={() => setScope("location")}
                />
                <span>
                  <span className="block font-semibold">This specific location</span>
                  <span className="text-sm text-muted-foreground">
                    Share it for the selected Maps listing only.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 py-2">
                <input
                  className="mt-1"
                  type="radio"
                  name="deal-scope"
                  value="chain"
                  checked={scope === "chain"}
                  onChange={() => setScope("chain")}
                />
                <span>
                  <span className="block font-semibold">The whole chain</span>
                  <span className="text-sm text-muted-foreground">
                    Share it for other locations with the same Maps name.
                  </span>
                </span>
              </label>
            </fieldset>

            <div>
              <label className="font-bold" htmlFor="deal-title">
                3. What’s the deal?
              </label>
              <input
                id="deal-title"
                className={inputClass}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={3}
                maxLength={120}
                placeholder="e.g. Two tacos for the price of one"
                required
              />
              <p className="mt-1 text-xs text-muted-foreground">
                On submit, Google Gemini creates a clearer community summary from your title and
                details. Your original wording is kept in the database, and AI can’t verify the
                offer.
              </p>
            </div>

            <div>
              <label className="font-bold" htmlFor="deal-details">
                Details or restrictions <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="deal-details"
                className={`${inputClass} min-h-24 resize-y`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1500}
                placeholder="Add a promo code, how to redeem it, or any limits."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="font-bold" htmlFor="deal-start-date">
                Starts
                <input
                  id="deal-start-date"
                  className={inputClass}
                  type="date"
                  min={localDateValue()}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  required
                />
              </label>
              <label className="font-bold" htmlFor="deal-end-date">
                Ends
                <input
                  id="deal-end-date"
                  className={inputClass}
                  type="date"
                  min={startDate || localDateValue()}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  required
                />
              </label>
            </div>

            <Button className="h-12 w-full text-lg font-bold chunky" disabled={busy || !place}>
              {busy ? "Polishing and sharing…" : "Submit deal"}
            </Button>
          </fieldset>
        </form>
      </section>
    </main>
  );
}

function localDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
