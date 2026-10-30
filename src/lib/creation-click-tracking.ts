import { z } from "zod";
import { CreationClickSchema } from "./creation-clicks";
import type { Session } from "./session";

const Pending = CreationClickSchema.extend({
  code: z.string().length(6),
  memberId: z.string().uuid(),
});
const State = z.object({ active: CreationClickSchema.nullable(), pending: z.array(Pending) });
type TrackingState = z.infer<typeof State>;
const key = "groupgrub:creation-clicks";
let memory: TrackingState | undefined;
function read(): TrackingState {
  if (memory) return memory;
  try {
    memory = State.parse(JSON.parse(sessionStorage.getItem(key) ?? "null"));
  } catch {
    memory = { active: null, pending: [] };
  }
  return memory;
}
function persist() {
  try {
    sessionStorage.setItem(key, JSON.stringify(read()));
  } catch {
    /* Keep counting in memory if storage is unavailable. */
  }
}
export function beginCreationClickTracking() {
  if (!read().active) {
    read().active = { journeyId: crypto.randomUUID(), clicks: 0 };
    persist();
  }
}
export function countCreationClick() {
  const active = read().active;
  if (active && active.clicks < 1000000) {
    active.clicks += 1;
    persist();
  }
}
export function resetCreationClickTracking() {
  read().active = null;
  persist();
}
export function completeCreationClickTracking(session: Session) {
  const state = read();
  if (state.active) {
    state.pending.push({ ...state.active, code: session.code, memberId: session.memberId });
    state.active = null;
    persist();
    window.dispatchEvent(new Event("groupgrub:creation-complete"));
  }
}
export function pendingCreationClicks() {
  return [...read().pending];
}
export function acknowledgeCreationClicks(memberId: string) {
  read().pending = read().pending.filter((item) => item.memberId !== memberId);
  persist();
}
