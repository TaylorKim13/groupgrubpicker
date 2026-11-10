import type { ReactNode } from "react";
import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { roomJoinUrl } from "@/lib/room-access";
import { Button } from "./ui/button";

export function RoomInvite({ code, children }: { code: string; children?: ReactNode }) {
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold">Room code</span>
        <span className="select-all font-display text-3xl tracking-[0.15em]">{code}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Copy room code"
          title="Copy room code"
          disabled={copying}
          onClick={() => void copy(code, "Room code")}
        >
          <Copy aria-hidden="true" />
        </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button type="button" disabled={copying} onClick={() => void copy(link, "Invite link")}>
          Copy invite link
        </Button>
        </div>
      </div>
    </section>
  );
}
