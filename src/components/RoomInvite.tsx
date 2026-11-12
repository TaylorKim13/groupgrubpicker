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
    <section aria-label="Invite friends" className="min-w-0 rounded-xl border bg-muted/40 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="shrink-0">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Room code</p>
          <div className="flex items-center gap-2">
            <span className="select-all font-mono text-2xl font-semibold leading-none tracking-[0.12em]">
              {code}
            </span>
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
        </div>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:flex sm:items-center">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg bg-card px-3 font-medium"
            disabled={copying}
            onClick={() => void copy(link, "Invite link")}
          >
            Copy invite link
          </Button>
          {children}
        </div>
      </div>
    </section>
  );
}
