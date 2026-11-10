import { NextResponse } from "next/server";
import {
  freshState,
  getCounts,
  getState,
  newRound,
  saveState,
  setCards,
  storageMode,
} from "@/lib/store";
import { DECISION, LENSES, LOBBY, Rating, RATINGS } from "@/lib/lenses";
import { decide, majority, emptyCounts, Counts } from "@/lib/decision";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function authorised(req: Request) {
  const key = process.env.PRESENTER_KEY;
  if (!key) return true; // no key set: open, and the presenter screen shows a warning
  return req.headers.get("x-presenter-key") === key;
}

function combined(c: { phones: Counts; cards: Counts }): Counts {
  return {
    pass: c.phones.pass + c.cards.pass,
    cond: c.phones.cond + c.cards.cond,
    fail: c.phones.fail + c.cards.fail,
  };
}

async function snapshot() {
  const state = await getState();
  const counts =
    state.step >= 0 && state.step < LENSES.length
      ? await getCounts(state.round, state.step)
      : { phones: emptyCounts(), cards: emptyCounts() };
  return {
    state,
    counts,
    storageMode,
    keyConfigured: Boolean(process.env.PRESENTER_KEY),
  };
}

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Wrong presenter key." }, { status: 401, headers: NO_STORE });
  return NextResponse.json(await snapshot(), { headers: NO_STORE });
}

type Action =
  | { action: "setUseCase"; useCase: string }
  | { action: "goto"; step: number }
  | { action: "setOpen"; open: boolean }
  | { action: "record"; lens: number; rating: Rating | null }
  | { action: "cards"; lens: number; counts: Counts }
  | { action: "saveToScorecard" }
  | { action: "restartUseCase" }
  | { action: "deleteRow"; index: number }
  | { action: "resetAll" };

export async function POST(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Wrong presenter key." }, { status: 401, headers: NO_STORE });

  let a: Action;
  try {
    a = await req.json();
  } catch {
    return NextResponse.json({ error: "Send the action as JSON." }, { status: 400, headers: NO_STORE });
  }

  const s = await getState();

  switch (a.action) {
    case "setUseCase":
      s.useCase = String(a.useCase ?? "").slice(0, 140);
      break;

    case "goto": {
      const step = Math.max(LOBBY, Math.min(DECISION, Math.floor(Number(a.step))));
      // Leaving a lens without a recorded verdict: record the room's majority.
      if (s.step >= 0 && s.step < LENSES.length && s.verdicts[s.step] === null && step > s.step) {
        const m = majority(combined(await getCounts(s.round, s.step)));
        if (m) s.verdicts[s.step] = m;
      }
      s.step = step;
      s.open = step >= 0 && step < LENSES.length && s.verdicts[step] === null;
      break;
    }

    case "setOpen":
      s.open = Boolean(a.open) && s.step >= 0 && s.step < LENSES.length;
      break;

    case "record":
      if (a.lens >= 0 && a.lens < LENSES.length && (a.rating === null || RATINGS.includes(a.rating))) {
        s.verdicts[a.lens] = a.rating;
        if (a.rating && a.lens === s.step) s.open = false;
      }
      break;

    case "cards":
      if (a.lens >= 0 && a.lens < LENSES.length) await setCards(s.round, a.lens, a.counts ?? emptyCounts());
      break;

    case "saveToScorecard": {
      const d = decide(s.verdicts);
      if (!d) {
        return NextResponse.json({ error: "Record a verdict on all six lenses first." }, { status: 409, headers: NO_STORE });
      }
      let votes = 0;
      for (let i = 0; i < LENSES.length; i++) {
        const c = combined(await getCounts(s.round, i));
        votes = Math.max(votes, c.pass + c.cond + c.fail);
      }
      s.scorecard.push({
        useCase: s.useCase || `Use case ${s.scorecard.length + 1}`,
        verdicts: s.verdicts as Rating[],
        outcome: d.outcome,
        votes,
        at: new Date().toISOString(),
      });
      const next = freshState(s.scorecard);
      await saveState(next);
      return NextResponse.json(await snapshot(), { headers: NO_STORE });
    }

    case "restartUseCase":
      s.round = newRound();
      s.verdicts = LENSES.map(() => null);
      s.step = LOBBY;
      s.open = false;
      break;

    case "deleteRow":
      if (a.index >= 0 && a.index < s.scorecard.length) s.scorecard.splice(a.index, 1);
      break;

    case "resetAll":
      await saveState(freshState());
      return NextResponse.json(await snapshot(), { headers: NO_STORE });

    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: NO_STORE });
  }

  await saveState(s);
  return NextResponse.json(await snapshot(), { headers: NO_STORE });
}
