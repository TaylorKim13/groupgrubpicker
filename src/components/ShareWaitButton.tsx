import { MessageSquare } from "lucide-react";
import type { Restaurant } from "@/lib/restaurants";
import { waitTimeSmsUrl } from "@/lib/share-wait";

export function ShareWaitButton({ restaurant }: { restaurant: Pick<Restaurant, "name" | "wait"> }) {
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center gap-2 rounded-xl border-2 bg-background px-4 py-2 text-sm font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      aria-label={`Share ${restaurant.name}'s wait time via SMS`}
      onClick={() => {
        window.location.href = waitTimeSmsUrl(restaurant, navigator.userAgent, navigator.platform, navigator.maxTouchPoints, window.location.origin);
      }}
    >
      <MessageSquare className="h-4 w-4" aria-hidden="true" />
      Share wait via SMS
    </button>
  );
}
