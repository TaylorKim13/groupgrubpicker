import { useEffect, useState } from "react";
import type { Result } from "@/lib/room.functions";
import { priceLabel } from "@/lib/restaurants";

function CoinFlip({ result, onDone }: { result: Result; onDone: () => void }) {
  const [a, b] = result.tie!.candidates;
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
          <div className="absolute inset-0 grid place-items-center rounded-full bg-secondary p-4 text-center font-display text-xl font-extrabold chunky" style={{ backfaceVisibility: "hidden" }}>
            {a.name}
          </div>
          <div className="absolute inset-0 grid place-items-center rounded-full bg-primary p-4 text-center font-display text-xl font-extrabold text-primary-foreground chunky" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
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
      <div className="relative mx-auto h-72 w-72">
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

export function Reveal({ result }: { result: Result }) {
  const [stage, setStage] = useState<"tie" | "win">(result.tie ? "tie" : "win");
  if (stage === "tie") {
    const done = () => setStage("win");
    return result.tie!.method === "coin" ? <CoinFlip result={result} onDone={done} /> : <Wheel result={result} onDone={done} />;
  }
  const w = result.winner;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${w.lat},${w.lng}`;
  const reserve = `https://www.opentable.com/s?term=${encodeURIComponent(w.name)}&latitude=${w.lat}&longitude=${w.lng}`;
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
      <div className="relative z-10 text-center" style={{ animation: "pop .6s ease-out" }}>
        <p className="font-bold uppercase tracking-widest text-primary">We're eating at</p>
        <h2 className="mt-2 text-5xl font-extrabold md:text-7xl">{w.name}</h2>
        <p className="mt-3 text-lg text-muted-foreground">
          {w.cuisine} · {priceLabel(w.price)} · ~{w.wait} min wait
          {w.address ? ` · ${w.address}` : ""}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href={directions} target="_blank" rel="noreferrer" className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground chunky">
            Get directions
          </a>
          {!w.fastFood && (
            <a href={reserve} target="_blank" rel="noreferrer" className="rounded-xl bg-secondary px-5 py-3 font-bold chunky">
              Reserve a table
            </a>
          )}
        </div>
      </div>
      <div className="relative z-10 mx-auto mt-10 max-w-xl rounded-2xl bg-card p-5 chunky">
        <h3 className="mb-3 text-xl font-extrabold">Score breakdown</h3>
        <ul className="space-y-2">
          {result.scores.map((s) => (
            <li key={s.id}>
              <div className="flex justify-between text-sm">
                <span className="font-bold">{s.name}</span>
                <span>
                  {s.points} pts · {s.wants} want · {s.coulds} could
                </span>
              </div>
              <div className="mt-1 h-3 rounded-full border-2 bg-muted">
                <div className={`h-full rounded-full ${s.id === w.id ? "bg-primary" : "bg-secondary"}`} style={{ width: `${(s.points / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        {result.tie && <p className="mt-3 text-xs text-muted-foreground">Tie broken by {result.tie.method === "coin" ? "coin flip" : "wheel spin"}.</p>}
      </div>
    </div>
  );
}
