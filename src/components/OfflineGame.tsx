import { useEffect, useState } from "react";
import { Button } from "./ui/button";

export function OfflineGame() {
  const [offline, setOffline] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!navigator.onLine) {
        if (active) setOffline(true);
        return;
      }
      try {
        await fetch(`/robots.txt?connection=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (active) setOffline(false);
      } catch {
        if (active) setOffline(true);
      }
    };
    void check();
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    const timer = window.setInterval(check, 30000);
    // Cache only the standalone game. Room/account responses are never cached.
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/offline-sw.js").catch(() => {});
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, []);
  if (!offline && !playing) return null;
  return (
    <section className="mx-auto max-w-2xl space-y-3 px-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 bg-card p-3">
        <p role="status" className="text-sm font-medium">
          {offline
            ? "Connection lost. Grab a snack break while we reconnect."
            : "You're back online! Finish your game or return to your table."}
        </p>
        <Button size="sm" variant="secondary" onClick={() => setPlaying(!playing)}>
          {playing ? "Close game" : "Play Snack Dash"}
        </Button>
      </div>
      {playing && (
        <iframe
          src="/offline.html"
          title="Snack Dash food game"
          className="h-[650px] w-full rounded-lg border-2 bg-card"
        />
      )}
    </section>
  );
}
