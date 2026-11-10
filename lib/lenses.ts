// The six lenses from the session deck (slide 5), in order.
export type Rating = "pass" | "cond" | "fail";

export const RATINGS: Rating[] = ["pass", "cond", "fail"];

export const RATING_LABEL: Record<Rating, string> = {
  pass: "Pass",
  cond: "Pass with conditions",
  fail: "Fail",
};

export const RATING_SHORT: Record<Rating, string> = {
  pass: "Pass",
  cond: "Conditions",
  fail: "Fail",
};

export type Lens = {
  name: string;
  question: string;
  test: string;
  hardGate: boolean;
  prompt: string; // what the presenter asks the volunteer
};

export const LENSES: Lens[] = [
  {
    name: "Viability",
    question: "Can we run it this month with what we have?",
    test: "A repeatable task, usable inputs, a build type that fits and a working foundation.",
    hardGate: false,
    prompt: "Could you start this next month? What's missing?",
  },
  {
    name: "Governance",
    question: "Is the risk tiered and controlled?",
    test: "A risk tier, the controls it needs and an approval gate before publish.",
    hardGate: true,
    prompt: "Who clicks approve before this reaches a customer?",
  },
  {
    name: "Data",
    question: "Do we know what goes into the prompt?",
    test: "Named sources, no personal or regulated data unless approved.",
    hardGate: true,
    prompt: "What goes into the prompt? Any customer data?",
  },
  {
    name: "Brand safety",
    question: "Will the output stay on brand and provable?",
    test: "A published brand kit, proof for claims and a review step.",
    hardGate: true,
    prompt: "Does it make claims? Where is the proof held?",
  },
  {
    name: "Ownership",
    question: "Who answers for it?",
    test: "A business owner, a named approver and someone who maintains it.",
    hardGate: false,
    prompt: "Whose name goes on it? One person, not a team.",
  },
  {
    name: "Measurable return",
    question: "How will we know it paid off?",
    test: "One baseline, one target and one review date.",
    hardGate: false,
    prompt: "What is the number today?",
  },
];

export const LOBBY = -1;
export const DECISION = LENSES.length; // step index after the last lens
