import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCheck, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const examples = [
  { id: "pizza", name: "Corner Pizza", food: "🍕" },
  { id: "bowl", name: "Garden Bowl", food: "🥗" },
];
const steps = [
  {
    title: "Pick the place you want most",
    text: "Choose Want on your favorite restaurant. It gets 2 points toward the group's decision.",
    label: "Your favorite",
  },
  {
    title: "Give the group a second option",
    text: "Choose Could on a different restaurant. Your backup gets 1 point, so the group has a good compromise.",
    label: "Your backup",
  },
  {
    title: "Send your two picks",
    text: "Choose Submit vote in the voting bar to save your choices. You can update them until the host ends voting and reveals the winner.",
    label: "Submit your vote",
  },
];

export function VotingReminder({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-md">
        {/* Remount the example each time it is opened. No saved onboarding or room state is changed. */}
        {open && <ReminderSteps onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReminderSteps({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [want, setWant] = useState<string | null>(null);
  const [could, setCould] = useState<string | null>(null);
  const item = steps[step]!;
  return (
    <>
      <DialogHeader className="text-left">
        <span className="mb-3 text-xs font-medium text-muted-foreground">
          Voting reminder · {step + 1} of 3
        </span>
        <DialogTitle className="text-2xl font-semibold tracking-tight">{item.title}</DialogTitle>
        <DialogDescription className="pt-2 leading-relaxed">{item.text}</DialogDescription>
      </DialogHeader>
      <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
        {steps.map((entry, index) => (
          <span
            key={entry.label}
            className={`h-1 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
      <section className="rounded-xl border bg-muted/40 p-4" aria-label="Practice ballot">
        <p className="mb-3 text-xs font-medium text-muted-foreground">
          Try an example. This won't change your room or vote.
        </p>
        {step < 2 ? (
          <div className="grid grid-cols-2 gap-3">
            {examples.map((restaurant) => {
              const selected = step === 0 ? want === restaurant.id : could === restaurant.id;
              const unavailable = step === 1 && want === restaurant.id;
              return (
                <div
                  key={restaurant.id}
                  className={`rounded-xl border bg-card p-3 text-center ${selected ? (step === 0 ? "border-brand ring-1 ring-brand" : "border-olive ring-1 ring-olive") : ""}`}
                >
                  <span className="block text-3xl" aria-hidden="true">
                    {restaurant.food}
                  </span>
                  <p className="mb-3 mt-2 text-sm font-semibold">{restaurant.name}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    disabled={unavailable}
                    className={`w-full rounded-lg ${selected && step === 1 ? "border-olive bg-olive text-olive-foreground hover:bg-olive/90" : ""}`}
                    aria-pressed={selected}
                    aria-label={`${step === 0 ? "Want" : "Could"} ${restaurant.name}`}
                    onClick={() => {
                      if (step === 0) {
                        setWant(restaurant.id);
                        if (could === restaurant.id) setCould(null);
                      } else setCould(restaurant.id);
                    }}
                  >
                    {selected ? <Check className="size-3.5" /> : <Heart className="size-3.5" />}
                    {step === 0 ? "Want · 2 pts" : "Could · 1 pt"}
                  </Button>
                  {unavailable && (
                    <p className="mt-2 text-[11px] text-muted-foreground">Already your Want pick</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {[
              { id: want, label: "Want", points: "2 points" },
              { id: could, label: "Could", points: "1 point" },
            ].map((pick) => (
              <div
                key={pick.label}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div>
                  <p className="text-xs text-muted-foreground">
                    {pick.label} · {pick.points}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {examples.find((restaurant) => restaurant.id === pick.id)?.name ??
                      (pick.label === "Want"
                        ? "Your favorite restaurant"
                        : "A different restaurant")}
                  </p>
                </div>
                <CheckCheck
                  className={`size-4 ${pick.label === "Could" ? "text-olive" : "text-brand"}`}
                />
              </div>
            ))}
            <p className="text-xs leading-relaxed text-muted-foreground">
              If secret votes are enabled, individual choices stay hidden. The host reveals the
              group result.
            </p>
          </div>
        )}
      </section>
      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
        <Button
          size="sm"
          className="rounded-lg"
          onClick={() => (step === 2 ? onClose() : setStep(step + 1))}
        >
          {step === 2 ? "Got it" : "Next"}
          {step === 2 ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
        </Button>
      </div>
    </>
  );
}
