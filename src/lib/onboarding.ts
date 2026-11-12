export const VOTING_TOUR_KEY = "groupgrub:onboarding:v2:voting";
export type VotingStage = "want" | "could" | "submit";

export function votingStage(want: string | null, could: string | null): VotingStage {
  if (!want) return "want";
  if (!could || could === want) return "could";
  return "submit";
}

export const votingSteps = {
  want: {
    title: "Which place is your favorite?",
    text: "Tap Want on a restaurant card. Your first choice gets 2 points.",
    label: "Pick your favorite",
    points: "2 points",
  },
  could: {
    title: "What's your next best option?",
    text: "Tap Could on a different restaurant. This backup choice gets 1 point.",
    label: "Pick your backup",
    points: "1 point",
  },
  submit: {
    title: "Two picks. Ready when you are.",
    text: "Review your choices, then tap Submit vote (or Update vote) in the highlighted bar. You can change your picks while voting stays open.",
    label: "Send your vote",
    points: "3 points total",
  },
} as const;
