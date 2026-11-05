import { useEffect, useRef, useState } from "react";
import { ensureGoogleMapsLoaded } from "@/components/RestaurantMap";

type LoadState = "loading" | "ready" | "unavailable" | "error";

export function GooglePopularTimes({
  placeId,
}: {
  placeId?: string;
}) {
  const [state, setState] = useState<LoadState>(placeId ? "loading" : "unavailable");
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!placeId) {
      setState("unavailable");
      return;
    }
    if (!host.current) return;
    let cancelled = false;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    let renderTimer: ReturnType<typeof setTimeout> | undefined;
    const container = host.current;
    setState("loading");

    void ensureGoogleMapsLoaded()
      .then(async () => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const definitions = Promise.all([
          window.customElements.whenDefined("gmp-place-details"),
          window.customElements.whenDefined("gmp-place-details-place-request"),
          window.customElements.whenDefined("gmp-place-popular-times"),
        ]);
        await Promise.race([
          definitions,
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("Places UI Kit did not load")), 10000);
          }),
        ]);
        if (timeoutId) clearTimeout(timeoutId);
        if (cancelled) return;

        const details = document.createElement("gmp-place-details");
        details.style.cssText = "display:block;width:100%;min-width:0;box-sizing:border-box;max-height:280px;overflow:auto;color-scheme:light";
        const request = document.createElement("gmp-place-details-place-request");
        request.setAttribute("place", placeId);
        const popularTimes = document.createElement("gmp-place-popular-times") as HTMLElement & { rendered?: boolean };
        details.addEventListener("gmp-load", () => {
          if (loadTimer) clearTimeout(loadTimer);
          renderTimer = setTimeout(() => {
            if (cancelled) return;
            setState(popularTimes.rendered === false ? "unavailable" : "ready");
            details.scrollTop = details.scrollHeight;
            requestAnimationFrame(() => {
              if (!cancelled) details.scrollTop = details.scrollHeight;
            });
          }, 500);
        });
        details.addEventListener("gmp-error", () => {
          if (loadTimer) clearTimeout(loadTimer);
          if (!cancelled) setState("error");
        });
        details.append(request, popularTimes);
        container.replaceChildren(details);
        loadTimer = setTimeout(() => {
          if (!cancelled) setState("error");
        }, 15000);
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
      if (loadTimer) clearTimeout(loadTimer);
      if (renderTimer) clearTimeout(renderTimer);
      container.replaceChildren();
    };
  }, [placeId]);

  return (
    <div className="mt-2 w-full min-w-0">
      {state === "loading" && <p className="text-xs text-muted-foreground">Loading Google Popular times...</p>}
      {state === "unavailable" && (
        <p className="text-xs text-muted-foreground">
          {placeId
            ? "Google Popular times are not available for this restaurant."
            : "Google Popular times are not available for this listing."}
        </p>
      )}
      {state === "error" && <p className="text-xs text-muted-foreground">Google Popular times could not load here.</p>}
      <div className="w-full min-w-0 overflow-hidden" ref={host} />
    </div>
  );
}
