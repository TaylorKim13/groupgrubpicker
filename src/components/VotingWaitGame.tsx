import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const SNACKS = [
  { icon: "🍕", name: "Pizza" },
  { icon: "🌮", name: "Taco" },
  { icon: "🍔", name: "Burger" },
  { icon: "🍣", name: "Sushi" },
  { icon: "🍩", name: "Donut" },
  { icon: "🍦", name: "Ice cream" },
];

function newDeck() {
  const cards = [...SNACKS, ...SNACKS];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards;
}

/** A local-only game: room polling and votes never depend on its state. */
export function VotingWaitGame() {
  const [cards, setCards] = useState(newDeck);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const complete = matched.length === cards.length;

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [first, second] = flipped;
    if (cards[first!]!.name === cards[second!]!.name) return;
    const timeout = window.setTimeout(() => setFlipped([]), 1000);
    return () => window.clearTimeout(timeout);
  }, [cards, flipped]);

  function flip(index: number) {
    if (flipped.length === 2 || flipped.includes(index) || matched.includes(index)) return;
    if (flipped.length === 0) {
      setFlipped([index]);
      return;
    }
    const first = flipped[0]!;
    setMoves((value) => value + 1);
    if (cards[first]!.name === cards[index]!.name) {
      setMatched((value) => [...value, first, index]);
      setFlipped([]);
    } else {
      setFlipped([first, index]);
    }
  }

  function restart() {
    setCards(newDeck());
    setFlipped([]);
    setMatched([]);
    setMoves(0);
  }

  return (
    <section aria-labelledby="snack-match-title" className="rounded-2xl bg-card p-5 chunky">
      <p className="text-sm font-bold text-brand">Vote submitted! Waiting for the table?</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h2 id="snack-match-title" className="text-2xl font-semibold">
          Snack Match
        </h2>
        <Button type="button" variant="outline" onClick={restart}>
          New game
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Flip two cards at a time and find all six food pairs. How few turns can you take?
      </p>
      <p role="status" className="my-4 text-sm font-semibold">
        {complete
          ? `You matched the whole menu in ${moves} turns! Play again while you wait.`
          : `${matched.length / 2} of 6 pairs · ${moves} turns`}
      </p>
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2 sm:gap-3">
        {cards.map((card, index) => {
          const found = matched.includes(index);
          const visible = found || flipped.includes(index);
          return (
            <button
              key={index}
              type="button"
              aria-label={`Card ${index + 1}: ${visible ? `${card.name}${found ? ", matched" : ""}` : "face down"}`}
              aria-pressed={visible}
              aria-disabled={found || flipped.length === 2 || visible}
              onClick={() => flip(index)}
              className={`flex aspect-square min-h-14 items-center justify-center rounded-xl border-2 text-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-4xl ${found ? "border-primary bg-primary/10" : visible ? "border-primary bg-background" : "border-transparent bg-secondary text-secondary-foreground hover:border-primary"}`}
            >
              <span aria-hidden="true">{visible ? card.icon : "?"}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Just for fun — your game stays on this device and does not affect the vote. Results will
        appear when voting closes.
      </p>
    </section>
  );
}
