import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, CheckCheck, HelpCircle, MousePointer2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VOTING_TOUR_KEY, votingStage, votingSteps } from "@/lib/onboarding";

type Pick = { id: string; name: string } | null;
type Hole = { x: number; y: number; width: number; height: number };

/** A nonmodal coach: real restaurant controls remain clickable throughout. */
export function Onboarding({
  want,
  could,
  submissionCount,
  hasVoted,
  isHost,
  onStart,
}: {
  want: Pick;
  could: Pick;
  submissionCount: number;
  hasVoted: boolean;
  isHost: boolean;
  onStart: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"intro" | "picking" | "done">("intro");
  const [holes, setHoles] = useState<Hole[]>([]);
  const card = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const baseline = useRef(submissionCount);
  const maskId = useId();
  const titleId = useId();
  const stage = votingStage(want?.id ?? null, could?.id ?? null);
  const index = stage === "want" ? 0 : stage === "could" ? 1 : 2;
  const startRef = useRef(onStart);
  startRef.current = onStart;

  useEffect(() => {
    if (hasVoted) return;
    try {
      if (localStorage.getItem(VOTING_TOUR_KEY)) return;
    } catch {
      /* Storage is optional. */
    }
    setOpen(true);
  }, [hasVoted]);

  function dismiss() {
    try {
      localStorage.setItem(VOTING_TOUR_KEY, "done");
    } catch {
      /* Storage is optional. */
    }
    setOpen(false);
    launcher.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (open && submissionCount > baseline.current) {
      setPhase("done");
      try {
        localStorage.setItem(VOTING_TOUR_KEY, "done");
      } catch {
        /* Storage is optional. */
      }
    }
  }, [open, submissionCount]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("voting-guide-active");
    card.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        try {
          localStorage.setItem(VOTING_TOUR_KEY, "done");
        } catch {
          /* Storage is optional. */
        }
        setOpen(false);
        launcher.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      document.body.classList.remove("voting-guide-active");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selector =
      phase !== "picking"
        ? null
        : stage === "submit"
          ? '[data-vote-guide="submit"]'
          : `[data-vote-choice="${stage}"]`;
    let firstMeasure = true;
    function measure() {
      const targets = selector
        ? [...document.querySelectorAll<HTMLElement>(selector)].filter(
            (element) =>
              element.getClientRects().length > 0 &&
              (stage !== "could" || element.dataset["restaurantId"] !== want?.id),
          )
        : [];
      if (firstMeasure && targets[0]) {
        firstMeasure = false;
        if (card.current?.contains(document.activeElement))
          targets[0].focus({ preventScroll: true });
        const rect = targets[0].getBoundingClientRect();
        const dockTop = card.current?.getBoundingClientRect().top ?? window.innerHeight;
        if (rect.top < 100 || rect.bottom > dockTop - 24)
          window.scrollBy({
            top: rect.top - Math.max(100, (dockTop - 100) / 2),
            behavior: "instant",
          });
      }
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      setHoles(
        targets
          .map((element) => {
            const rect = element.getBoundingClientRect();
            const x = Math.max(0, rect.left - 5),
              y = Math.max(0, rect.top - 5);
            return {
              x,
              y,
              width: Math.max(0, Math.min(width, rect.right + 5) - x),
              height: Math.max(0, Math.min(height, rect.bottom + 5) - y),
            };
          })
          .filter((hole) => hole.width > 0 && hole.height > 0),
      );
    }
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    if (card.current) observer.observe(card.current);
    // Keep the spotlight attached during polling, filtering, and responsive layout changes.
    const mutations = new MutationObserver(() => {
      if (selector) measure();
    });
    const pool = document.querySelector("[data-voting-pool]");
    if (pool) mutations.observe(pool, { childList: true, subtree: true });
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, phase, stage, want?.id]);

  const begin = () => {
    startRef.current();
    setPhase("picking");
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          ref={launcher}
          variant="outline"
          size="sm"
          className="rounded-lg gap-2"
          onClick={() => {
            baseline.current = submissionCount;
            setPhase("intro");
            setOpen(true);
          }}
        >
          <HelpCircle className="size-4" /> How voting works
        </Button>
      </div>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <svg className="voting-guide-shade" aria-hidden="true">
              <defs>
                <mask id={maskId}>
                  <rect width="100%" height="100%" fill="white" />
                  {holes.map((hole, i) => (
                    <rect key={i} {...hole} rx="12" fill="black" />
                  ))}
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="black"
                fillOpacity={phase === "picking" ? "0.32" : "0.18"}
                mask={`url(#${maskId})`}
              />
              {holes.map((hole, i) => (
                <rect
                  key={i}
                  {...hole}
                  rx="12"
                  fill="none"
                  stroke={stage === "could" ? "var(--olive)" : "var(--brand)"}
                  strokeWidth="2"
                />
              ))}
            </svg>
            <div
              ref={card}
              className="voting-guide"
              role="region"
              aria-labelledby={titleId}
              tabIndex={-1}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {phase === "done" && <CheckCheck className="size-4 text-success" />}
                  {phase === "done"
                    ? "You're all set"
                    : hasVoted
                      ? "Voting guide"
                      : "Your first vote"}
                </span>
                <button
                  type="button"
                  className="voting-guide-close"
                  aria-label="Close voting guide"
                  onClick={dismiss}
                >
                  <X className="size-4" />
                </button>
              </div>
              {phase === "picking" && (
                <div className="mt-3 flex gap-1.5" aria-label={`Step ${index + 1} of 3`}>
                  {[0, 1, 2].map((item) => (
                    <span
                      key={item}
                      className={`h-1 flex-1 rounded-full transition-colors ${item <= index ? "bg-primary" : "bg-muted"}`}
                    />
                  ))}
                </div>
              )}
              <div className="mt-3" aria-live="polite" aria-atomic="true">
                <h2 id={titleId} className="text-xl font-semibold leading-tight tracking-tight">
                  {phase === "intro"
                    ? "Two picks. One group decision."
                    : phase === "done"
                      ? "Your vote is at the table."
                      : votingSteps[stage].title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {phase === "intro"
                    ? "Choose your favorite and a backup. Try it on the restaurant cards — this guide follows your picks."
                    : phase === "done"
                      ? isHost
                        ? "Everyone's votes count toward the winner. When the group is ready, end voting to reveal the result."
                        : "The host will reveal the winner. You can update your vote until voting closes."
                      : votingSteps[stage].text}
                </p>
              </div>
              <div className="voting-guide-ballot">
                {[
                  { pick: want, label: "Want", points: 2 },
                  { pick: could, label: "Could", points: 1 },
                ].map(({ pick, label, points }) => (
                  <div key={label} className="flex min-w-0 items-center gap-3">
                    <span
                      className={`voting-guide-rank ${pick ? (points === 1 ? "voting-guide-rank-filled voting-guide-rank-backup" : "voting-guide-rank-filled") : ""}`}
                    >
                      {pick ? <Check className="size-3.5" /> : points}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">
                        {label}{" "}
                        <span className="font-normal text-muted-foreground">
                          · {points} {points === 1 ? "point" : "points"}
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {pick?.name ?? (points === 2 ? "Your favorite" : "A different restaurant")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                  onClick={dismiss}
                >
                  {phase === "done" ? "Close guide" : "Skip guide"}
                </button>
                {phase === "intro" ? (
                  <Button size="sm" className="rounded-lg" onClick={begin}>
                    Let's pick <ArrowRight className="size-4" />
                  </Button>
                ) : phase === "done" ? (
                  <Button size="sm" className="rounded-lg" onClick={dismiss}>
                    Got it <Check className="size-4" />
                  </Button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-brand">
                    <MousePointer2 className="size-3.5" />{" "}
                    {stage === "submit"
                      ? "Submit when ready"
                      : `Tap ${stage === "want" ? "Want" : "Could"} on a card`}
                  </span>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
