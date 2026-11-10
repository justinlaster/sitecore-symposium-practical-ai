import { LENSES, Rating } from "./lenses";

export type Counts = { pass: number; cond: number; fail: number };

export const emptyCounts = (): Counts => ({ pass: 0, cond: 0, fail: 0 });

export function total(c: Counts) {
  return c.pass + c.cond + c.fail;
}

/** The room's verdict: the most votes wins; a tie goes to the more cautious rating. */
export function majority(c: Counts): Rating | null {
  if (total(c) === 0) return null;
  const order: Rating[] = ["fail", "cond", "pass"]; // cautious first, so ties resolve to it
  let best: Rating = order[0];
  for (const r of order) if (c[r] > c[best]) best = r;
  return best;
}

export type Decision = {
  outcome: "build" | "pilot" | "park";
  label: string;
  reason: string;
};

export const OUTCOME_LABEL = {
  build: "Build now",
  pilot: "Pilot with conditions",
  park: "Park",
} as const;

/**
 * The deck's decision rule (slide 26), with one gap closed:
 * a Fail on a non-gate lens also parks the use case until that Fail has an owner and a date.
 */
export function decide(verdicts: (Rating | null)[]): Decision | null {
  if (verdicts.length !== LENSES.length || verdicts.some((v) => v === null)) return null;

  const hardFails = LENSES.filter((l, i) => l.hardGate && verdicts[i] === "fail").map((l) => l.name);
  if (hardFails.length) {
    return {
      outcome: "park",
      label: OUTCOME_LABEL.park,
      reason: `Hard-gate Fail on ${list(hardFails)}. Do not build yet. Fix the gap, then rate again.`,
    };
  }

  const otherFails = LENSES.filter((l, i) => !l.hardGate && verdicts[i] === "fail").map((l) => l.name);
  if (otherFails.length) {
    return {
      outcome: "park",
      label: OUTCOME_LABEL.park,
      reason: `Fail on ${list(otherFails)}. Park it until that gap has an owner and a date.`,
    };
  }

  if (verdicts.every((v) => v === "pass")) {
    return {
      outcome: "build",
      label: OUTCOME_LABEL.build,
      reason: "All six lenses pass. Start with the simplest build that does the job.",
    };
  }

  const conditions = LENSES.filter((_, i) => verdicts[i] === "cond").map((l) => l.name);
  return {
    outcome: "pilot",
    label: OUTCOME_LABEL.pilot,
    reason: `No hard-gate Fail. Conditions on ${list(conditions)} each need an owner and a date. Pilot for four to six weeks with weekly reviews.`,
  };
}

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}
