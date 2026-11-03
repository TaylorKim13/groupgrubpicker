import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordSelectionActivity } from "@/lib/room.functions";
import type { Session } from "@/lib/session";

export function useSelectionTracking(session: Session, enabled: boolean) {
  const record = useServerFn(recordSelectionActivity);
  const { code, memberId, token } = session;
  useEffect(() => {
    if (!enabled) return;
    let entered = false;
    let departed = false;
    let activityPending = false;
    let lastSent = 0;
    const send = (event: "enter" | "heartbeat" | "leave") => {
      lastSent = Date.now();
      // Analytics must not block choosing food. The inactivity window covers lost exits.
      void record({
        data: { code, memberId, token, event },
        fetch: (input, init) => fetch(input, { ...init, keepalive: event === "leave" }),
      }).catch(() => {});
    };
    const enter = () => {
      if (document.visibilityState !== "visible") return;
      if (entered && !departed) return;
      entered = true;
      departed = false;
      activityPending = false;
      send("enter");
    };
    const leave = () => {
      if (!entered || departed) return;
      departed = true;
      activityPending = false;
      send("leave");
    };
    const visibility = () => (document.visibilityState === "visible" ? enter() : leave());
    const activity = () => {
      if (document.visibilityState !== "visible" || departed) return;
      activityPending = true;
      if (Date.now() - lastSent >= 30000) {
        activityPending = false;
        send("heartbeat");
      }
    };
    const timer = window.setInterval(() => {
      if (activityPending && !departed && document.visibilityState === "visible") {
        activityPending = false;
        send("heartbeat");
      }
    }, 30000);
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const event of events)
      window.addEventListener(event, activity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", enter);
    enter();
    return () => {
      leave();
      window.clearInterval(timer);
      for (const event of events) window.removeEventListener(event, activity, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", enter);
    };
  }, [record, enabled, code, memberId, token]);
}
