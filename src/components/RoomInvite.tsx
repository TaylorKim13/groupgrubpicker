import { useState } from "react";
import { toast } from "sonner";
import { roomJoinUrl } from "@/lib/room-access";
import { Button } from "./ui/button";

export function RoomInvite({ code }: { code: string }) {
  const link = typeof window === "undefined" ? "" : roomJoinUrl(window.location.origin, code);
  const [copying, setCopying] = useState(false);
  async function copy(value: string, label: string) {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(
        "Couldn't copy automatically. Select the room code or join link and copy it manually.",
      );
    } finally {
      setCopying(false);
    }
  }
  return (
    <section aria-label="Invite friends" className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">Room code</span>
        <span className="select-all font-display text-3xl tracking-[0.15em]">{code}</span>
        <Button
          type="button"
          variant="outline"
          disabled={copying}
          onClick={() => void copy(code, "Room code")}
        >
          Copy code
        </Button>
        <Button type="button" disabled={copying} onClick={() => void copy(link, "Invite link")}>
          Copy invite link
        </Button>
      </div>
      <input
        aria-label="Join link"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-lg border-2 bg-background px-3 py-2 text-sm"
      />
    </section>
  );
}
