import type { RestaurantDeal } from "@/lib/restaurant-deals";

export function RestaurantDealIndicators({ deals }: { deals: RestaurantDeal[] }) {
  if (!deals.length) return null;

  return (
    <div className="mt-2 space-y-1.5" aria-label="Active restaurant deals">
      {deals.map((deal, index) => (
        <div
          key={`${deal.restaurant_id}-${deal.title}-${index}`}
          className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">
              Deal
            </span>
            <span className="font-semibold">{deal.title}</span>
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
          {(deal.description || deal.terms) && (
            <details className="mt-1">
              <summary className="w-fit cursor-pointer font-semibold underline">
                Terms
              </summary>
              {deal.description && <p className="mt-1">{deal.description}</p>}
              {deal.terms && <p className="mt-1">{deal.terms}</p>}
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

export function WinnerDealLinks({ deals }: { deals: RestaurantDeal[] }) {
  return (
    <>
      {deals
        .filter((deal) => deal.redemption_url)
        .map((deal, index) => (
          <a
            key={`${deal.restaurant_id}-${deal.title}-${index}`}
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
