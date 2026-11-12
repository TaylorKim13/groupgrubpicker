import { MessageSquare } from "lucide-react";
import { roomInviteMessage, roomInviteSmsUrl } from "@/lib/share-invite";

export function ShareInviteButton({ code }: { code: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-input bg-card px-3 text-sm font-medium shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        const message = roomInviteMessage(window.location.origin, code);
        window.location.href = roomInviteSmsUrl(
          message,
          navigator.userAgent,
          navigator.platform,
          navigator.maxTouchPoints,
        );
      }}
    >
      <MessageSquare className="h-4 w-4" aria-hidden="true" />
      Invite via text
    </button>
  );
}
