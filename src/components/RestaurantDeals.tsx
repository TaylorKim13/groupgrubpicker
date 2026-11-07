import type { RestaurantDeal } from "@/lib/restaurant-deals";

export function RestaurantDealIndicators({ deals }: { deals: RestaurantDeal[] }) {
  if (!deals.length) return null;

  return (
    <div className="mt-2 space-y-1.5" aria-label="Active restaurant deals">
      {deals.map((deal, index) => (
        <div
          key={`${deal.id}-${index}`}
          className="rounded-lg border border-deal-border bg-deal-background px-2.5 py-2 text-xs text-deal-foreground"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-full bg-deal-label px-2 py-0.5 font-bold text-deal-label-foreground">
              Deal
            </span>
            <span className="font-semibold">{deal.polished_summary || deal.title}</span>
            {deal.scope === "chain" && (
              <span className="text-muted-foreground">Chain-wide</span>
            )}
            {deal.promo_code && (
              <span className="rounded bg-background px-1.5 py-0.5 font-mono">
                Code: {deal.promo_code}
              </span>
            )}
            {deal.redemption_url && (
              <a
                href={deal.redemption_url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline"
              >
                Offer details
              </a>
            )}
          </div>
          {((!deal.polished_summary && deal.description) || deal.terms) && (
            <details className="mt-1">
              <summary className="w-fit cursor-pointer font-semibold underline">Terms</summary>
              {!deal.polished_summary && deal.description && (
                <p className="mt-1">{deal.description}</p>
              )}
              {deal.terms && <p className="mt-1">{deal.terms}</p>}
            </details>
          )}
          {(deal.start_date || deal.end_date) && (
            <p className="mt-1 text-muted-foreground">
              {deal.start_date && `Starts ${formatDealDate(deal.start_date)}`}
              {deal.start_date && deal.end_date && " · "}
              {deal.end_date && `Ends ${formatDealDate(deal.end_date)}`}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function formatDealDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (year !== new Date().getFullYear()) options.year = "numeric";
  return new Date(year, month - 1, day).toLocaleDateString(undefined, options);
}

export function WinnerDealLinks({ deals }: { deals: RestaurantDeal[] }) {
  return (
    <>
      {deals
        .filter((deal) => deal.redemption_url)
        .map((deal, index) => (
          <a
            key={`${deal.id}-${index}`}
            href={deal.redemption_url!}
            target="_blank"
            rel="noreferrer"
            aria-label={`View deal: ${deal.title}`}
            className="rounded-xl border-2 bg-background px-5 py-3 font-bold chunky"
          >
            View deal
          </a>
        ))}
    </>
  );
}
