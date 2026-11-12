import { useEffect, useState } from "react";
import type { Result } from "@/lib/room.functions";
import { priceLabel } from "@/lib/restaurants";
import { ShareWaitButton } from "@/components/ShareWaitButton";
import { RestaurantDealIndicators, WinnerDealLinks } from "@/components/RestaurantDeals";
import { useRestaurantDeals } from "@/lib/restaurant-deals";
import { Gift } from "lucide-react";

function CoinFlip({ result, onDone }: { result: Result; onDone: () => void }) {
  const a = result.tie!.candidates[0]!;
  const b = result.tie!.candidates[1]!;
  const winnerIsA = result.winner.id === a.id;
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="text-center">
      <p className="mb-6 font-bold uppercase tracking-wide">Tie! Flipping a coin…</p>
      <div style={{ perspective: 800 }} className="mx-auto h-48 w-48">
        <div
          className="relative h-full w-full"
          style={{
            transformStyle: "preserve-3d",
            animation: "flip 3s cubic-bezier(.2,.7,.3,1) forwards",
            transform: winnerIsA ? undefined : "rotateY(180deg)",
          }}
        >
          <div className="absolute inset-0 grid place-items-center rounded-full bg-secondary p-4 text-center font-display text-xl font-semibold text-secondary-foreground chunky" style={{ backfaceVisibility: "hidden" }}>
            {a.name}
          </div>
          <div className="absolute inset-0 grid place-items-center rounded-full bg-primary p-4 text-center font-display text-xl font-semibold text-primary-foreground chunky" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            {b.name}
          </div>
        </div>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">{a.name} vs {b.name}</p>
    </div>
  );
}

function Wheel({ result, onDone }: { result: Result; onDone: () => void }) {
  const c = result.tie!.candidates;
  const seg = 360 / c.length;
  const idx = c.findIndex((x) => x.id === result.winner.id);
  const target = 360 * 6 + (360 - (idx * seg + seg / 2));
  const [rot, setRot] = useState(0);
  useEffect(() => {
    const r = requestAnimationFrame(() => setRot(target));
    const t = setTimeout(onDone, 4300);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t);
    };
  }, []);
  const colors = ["var(--primary)", "var(--secondary)", "var(--success)", "var(--accent)"];
  const grad = c.map((_, i) => `${colors[i % colors.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(",");
  return (
    <div className="text-center">
      <p className="mb-6 font-bold uppercase tracking-wide">{c.length}-way tie! Spinning the wheel…</p>
      <div className="relative mx-auto aspect-square w-72 max-w-full">
        <div className="absolute left-1/2 top-[-14px] z-10 h-0 w-0 -translate-x-1/2 border-x-[12px] border-t-[22px] border-x-transparent border-t-foreground" />
        <div
          className="h-full w-full rounded-full border-4"
          style={{ background: `conic-gradient(${grad})`, transform: `rotate(${rot}deg)`, transition: "transform 4s cubic-bezier(.15,.8,.2,1)" }}
        >
          {c.map((x, i) => (
            <div
              key={x.id}
              className="absolute left-1/2 top-1/2 origin-left text-xs font-bold"
              style={{ transform: `rotate(${i * seg + seg / 2 - 90}deg) translateX(40px)`, width: 100 }}
            >
              {x.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Reveal({ result, hasRewards = false }: { result: Result; hasRewards?: boolean }) {
  const [stage, setStage] = useState<"tie" | "win">(result.tie ? "tie" : "win");
  const dealsByRestaurant = useRestaurantDeals([result.winner.id], [result.winner.name]);
  useEffect(() => {
    if (stage === "win") document.getElementById("room-header")?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [stage]);
  if (stage === "tie") {
    const done = () => setStage("win");
    return result.tie!.method === "coin" ? <CoinFlip result={result} onDone={done} /> : <Wheel result={result} onDone={done} />;
  }
  const w = result.winner;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}`;
  const max = Math.max(...result.scores.map((s) => s.points), 1);
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className="absolute text-2xl"
            style={{ left: `${(i * 37) % 100}%`, top: 0, animation: `confetti ${3 + (i % 5)}s linear ${(i % 10) * 0.2}s forwards` }}
          >
            {["🎉", "🍕", "🌮", "✨", "🍣"][i % 5]}
          </span>
        ))}
      </div>
      <section id="winner-hero" className="winner-hero relative z-10 text-center" aria-labelledby="winner-title">
        <p className="font-bold uppercase tracking-widest">We're eating at</p>
        <h1 id="winner-title" className="mt-4 flex flex-wrap items-center justify-center gap-3 text-5xl font-semibold md:text-7xl">
          {w.name}
          {hasRewards && (
            <span
              className="text-brand"
              role="img"
              title="Your rewards account matches this restaurant"
              aria-label="Your rewards account matches this restaurant"
            >
              <Gift className="h-8 w-8 md:h-10 md:w-10" aria-hidden="true" />
            </span>
          )}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-white/90">
          {w.cuisine} · {w.priceUnknown ? "Price unknown" : priceLabel(w.price)}
          {w.address ? ` · ${w.address}` : ""}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={directions} target="_blank" rel="noreferrer" className="rounded-full bg-white px-5 py-3 font-semibold text-black hover:bg-white/90">
            Get directions
          </a>
          {w.websiteUri && (
            <a
              href={w.websiteUri}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white bg-black/30 px-5 py-3 font-semibold text-white hover:bg-white/15"
            >
              Restaurant website
            </a>
          )}
        </div>
      </section>
      <div id="winner-details" className="winner-details relative z-10 text-center">
        <div className="mx-auto mt-3 max-w-lg text-left">
          <RestaurantDealIndicators deals={dealsByRestaurant.get(w.id) ?? []} />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ShareWaitButton restaurant={w} />
          <WinnerDealLinks deals={dealsByRestaurant.get(w.id) ?? []} />
        </div>
      </div>
      <div className="relative z-10 mx-auto mt-10 max-w-xl rounded-2xl bg-card p-5 chunky">
        <h3 className="mb-3 text-xl font-semibold">Score breakdown</h3>
        <div className="mb-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-red-600" aria-hidden="true" />Want · 2 points</span>
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-blue-600" aria-hidden="true" />Could · 1 point</span>
        </div>
        <ul className="space-y-4">
          {result.scores.map((s) => (
            <li key={s.id}>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-bold">{s.name}{s.id === w.id && <span className="ml-2 inline-flex rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">★ Winner</span>}</span>
                <span>
                  {s.points} pts · {s.wants} want · {s.coulds} could
                </span>
              </div>
              <div
                className={`mt-2 flex h-4 overflow-hidden rounded-full bg-muted ${s.id === w.id ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}
                role="img"
                aria-label={`${s.name}: ${s.wants} Want votes (${s.wants * 2} points), ${s.coulds} Could votes (${s.coulds} points), ${s.points} total points${s.id === w.id ? ", winner" : ""}`}
              >
                <div className="h-full bg-red-600" style={{ width: `${(s.wants * 2 / max) * 100}%` }} />
                <div className="h-full bg-blue-600" style={{ width: `${(s.coulds / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        {result.tie && <p className="mt-3 text-xs text-muted-foreground">Tie broken by {result.tie.method === "coin" ? "coin flip" : "wheel spin"}.</p>}
      </div>
    </div>
  );
}
