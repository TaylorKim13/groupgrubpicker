import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tourStorageKey, type TourStep } from "@/lib/onboarding";

type Spotlight = { top: number; left: number; width: number; height: number };

export function Onboarding({
  tour = "home",
  steps,
  onStep,
  discreet = false,
}: {
  tour?: string;
  steps: readonly TourStep[];
  onStep?: (step: TourStep) => void;
  discreet?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [position, setPosition] = useState({ left: 16, top: 16, width: 360 });
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const maskId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const item = steps[step];
  const hasItem = !!item;
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    setStep(0);
    try {
      setOpen(
        !localStorage.getItem(tourStorageKey(tour)) &&
          !localStorage.getItem(tourStorageKey("skipped")),
      );
    } catch {
      setOpen(true);
    }
  }, [tour]);

  function finish(skipped = false) {
    try {
      localStorage.setItem(tourStorageKey(tour), "done");
      if (skipped) localStorage.setItem(tourStorageKey("skipped"), "done");
    } catch {
      /* Browser storage is optional. */
    }
    setOpen(false);
  }

  useEffect(() => {
    if (!open || !hasItem) return;
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, hasItem]);

  useEffect(() => {
    if (!open || !item) return;
    onStepRef.current?.(item);
    let target: Element | null = null;
    let observer: ResizeObserver | undefined;
    let mutations: MutationObserver | undefined;
    function measure() {
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      const bounds = target?.getBoundingClientRect();
      const hole =
        bounds && bounds.width > 0 && bounds.height > 0
          ? {
              top: Math.max(4, bounds.top - 6),
              left: Math.max(4, bounds.left - 6),
              width: Math.max(
                0,
                Math.min(width - 4, bounds.right + 6) - Math.max(4, bounds.left - 6),
              ),
              height: Math.max(
                0,
                Math.min(height - 4, bounds.bottom + 6) - Math.max(4, bounds.top - 6),
              ),
            }
          : null;
      setSpotlight(hole);
      const cardWidth = Math.min(360, width - 32);
      const cardHeight = card.current?.offsetHeight ?? 320;
      let top = (height - cardHeight) / 2;
      if (hole) {
        if (hole.top + hole.height + cardHeight + 28 <= height) top = hole.top + hole.height + 16;
        else if (hole.top >= cardHeight + 28) top = hole.top - cardHeight - 16;
        else top = height - cardHeight - 16;
      }
      setPosition({
        width: cardWidth,
        left: Math.max(
          16,
          Math.min(hole ? hole.left : (width - cardWidth) / 2, width - cardWidth - 16),
        ),
        top: Math.max(16, top),
      });
    }
    // Wait for the page to reveal any controls associated with this step.
    function resolveTarget() {
      const candidate = item?.target
        ? document.querySelector(`[data-tour="${item.target}"]`)
        : null;
      if (candidate === target) return;
      if (target) observer?.unobserve(target);
      target = candidate;
      target?.scrollIntoView({ block: "center", behavior: "instant" });
      if (target) observer?.observe(target);
      measure();
    }
    const frame = requestAnimationFrame(() => {
      observer = new ResizeObserver(measure);
      if (card.current) observer.observe(card.current);
      resolveTarget();
      measure();
      // Account panels and live restaurant listings can load after a step starts.
      mutations = new MutationObserver(resolveTarget);
      mutations.observe(document.body, { childList: true, subtree: true });
      nextButton.current?.focus({ preventScroll: true });
    });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, item]);

  return (
    <>
      <Button
        variant="link"
        className={discreet ? "h-auto p-0 text-sm font-medium" : undefined}
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
      >
        <Sparkles className="size-4" /> Quick walkthrough
      </Button>
      {open &&
        item &&
        typeof document !== "undefined" &&
        createPortal(
          <dialog
            ref={dialog}
            className="onboarding-dialog"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onCancel={(event) => {
              event.preventDefault();
              finish(true);
            }}
          >
            <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
              <defs>
                <mask id={maskId}>
                  <rect width="100%" height="100%" fill="white" />
                  {spotlight && (
                    <rect
                      x={spotlight.left}
                      y={spotlight.top}
                      width={spotlight.width}
                      height={spotlight.height}
                      rx="14"
                      fill="black"
                    />
                  )}
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="black"
                fillOpacity="0.48"
                mask={`url(#${maskId})`}
              />
              {spotlight && (
                <rect
                  x={spotlight.left}
                  y={spotlight.top}
                  width={spotlight.width}
                  height={spotlight.height}
                  rx="14"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="3"
                />
              )}
            </svg>
            <div
              ref={card}
              style={position}
              className="absolute max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl border bg-card p-6 text-card-foreground shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                  <Sparkles className="size-4" /> Your seat at the table
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Skip walkthrough"
                  onClick={() => finish(true)}
                >
                  <X />
                </Button>
              </div>
              <p className="text-xs font-bold text-muted-foreground">
                Step {step + 1} of {steps.length}
              </p>
              <div aria-live="polite" aria-atomic="true">
                <h2 id={titleId} className="mt-2 font-display text-2xl font-extrabold">
                  {item.title}
                </h2>
                <p
                  id={descriptionId}
                  className="mt-3 text-sm leading-relaxed text-muted-foreground"
                >
                  {item.text}
                </p>
              </div>
              <div className="mt-5 flex gap-1.5" aria-hidden="true">
                {steps.map((entry, index) => (
                  <span
                    key={entry.id}
                    className={`h-1 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`}
                  />
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => finish(true)}>
                  Skip tour
                </Button>
                <div className="flex gap-2">
                  {step > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Previous step"
                      onClick={() => setStep(step - 1)}
                    >
                      <ArrowLeft /> Back
                    </Button>
                  )}
                  <Button
                    ref={nextButton}
                    size="sm"
                    onClick={() => (step === steps.length - 1 ? finish() : setStep(step + 1))}
                  >
                    {step === steps.length - 1 ? "Got it" : "Next"}
                    <ArrowRight />
                  </Button>
                </div>
              </div>
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
