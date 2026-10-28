import { MessageSquare } from "lucide-react";
import { roomInviteMessage, roomInviteSmsUrl } from "@/lib/share-invite";

export function ShareInviteButton({ code }: { code: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center gap-2 rounded-lg border-2 bg-background px-3 py-2 text-sm font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={() => {
        const message = roomInviteMessage(window.location.origin, code);
        window.location.href = roomInviteSmsUrl(message, navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
      }}
    >
      <MessageSquare className="h-4 w-4" aria-hidden="true" />
      Invite via text
    </button>
  );
}
