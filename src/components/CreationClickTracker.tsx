import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordGroupCreationClicks } from "@/lib/room.functions";
import { loadSession } from "@/lib/session";
import {
  acknowledgeCreationClicks,
  beginCreationClickTracking,
  countCreationClick,
  pendingCreationClicks,
} from "@/lib/creation-click-tracking";

export function CreationClickTracker() {
  const record = useServerFn(recordGroupCreationClicks);
  useEffect(() => {
    let input: "pointer" | "keyboard" | null = null;
    let keyboardClickCounted = false;
    let flushing = false;
    const count = () => {
      if (window.location.pathname === "/") beginCreationClickTracking();
      countCreationClick();
    };
    const pointer = (event: PointerEvent) => {
      if (event.isTrusted && event.button === 0 && event.isPrimary) {
        input = "pointer";
        count();
      }
    };
    const keyboard = () => {
      input = "keyboard";
      keyboardClickCounted = false;
    };
    const click = (event: MouseEvent) => {
      // Pointer presses already counted above; label-generated clicks must not count twice.
      if (event.isTrusted && event.detail === 0 && input !== "pointer") {
        count();
        keyboardClickCounted = true;
      }
    };
    const submit = (event: SubmitEvent) => {
      if (event.isTrusted && input === "keyboard" && !keyboardClickCounted) {
        count();
        keyboardClickCounted = true;
      }
    };
    const flush = async () => {
      if (flushing) return;
      flushing = true;
      try {
        for (const pending of pendingCreationClicks()) {
          const session = loadSession(pending.code);
          if (!session || session.memberId !== pending.memberId) {
            acknowledgeCreationClicks(pending.memberId);
            continue;
          }
          try {
            await record({
              data: { ...session, journeyId: pending.journeyId, clicks: pending.clicks },
              fetch: (url, init) => fetch(url, { ...init, keepalive: true }),
            });
            acknowledgeCreationClicks(pending.memberId);
          } catch {
            /* Keep the measurement for a later retry; never block group creation. */
          }
        }
      } finally {
        flushing = false;
      }
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    window.addEventListener("groupgrub:creation-complete", flush);
    window.addEventListener("online", flush);
    const timer = window.setInterval(flush, 30000);
    void flush();
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
      window.removeEventListener("groupgrub:creation-complete", flush);
      window.removeEventListener("online", flush);
      window.clearInterval(timer);
    };
  }, [record]);
  return null;
}
