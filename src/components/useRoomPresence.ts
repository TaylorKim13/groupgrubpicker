import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordRoomPresence } from "@/lib/room.functions";
import type { Session } from "@/lib/session";

export function useRoomPresence(session: Session, enabled: boolean) {
  const record = useServerFn(recordRoomPresence);
  const { code, memberId, token } = session;
  useEffect(() => {
    if (!enabled) return;
    const tabId = crypto.randomUUID();
    let pending = Promise.resolve();
    const send = (visible: boolean) => {
      // Preserve event order when a visibility change follows a slow heartbeat.
      pending = pending.then(async () => {
        await record({
          data: { code, memberId, token, tabId, visible },
          fetch: (input, init) => fetch(input, { ...init, keepalive: true }),
        });
      }).catch(() => {});
    };
    const update = () => send(document.visibilityState === "visible");
    const leave = () => send(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") send(true);
    }, 20000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", update);
    update();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", update);
      leave();
    };
  }, [record, enabled, code, memberId, token]);
}
