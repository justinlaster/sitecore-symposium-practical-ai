import { NextResponse } from "next/server";
import { castVote, getState } from "@/lib/store";
import { LENSES, Rating, RATINGS } from "@/lib/lenses";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { round?: string; lens?: number; voter?: string; rating?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send the vote as JSON." }, { status: 400 });
  }
  const { round, lens, voter, rating } = body;

  if (
    typeof round !== "string" ||
    typeof lens !== "number" ||
    lens < 0 ||
    lens >= LENSES.length ||
    typeof voter !== "string" ||
    !/^[a-zA-Z0-9-]{8,64}$/.test(voter) ||
    !RATINGS.includes(rating as Rating)
  ) {
    return NextResponse.json({ error: "That vote is missing a field." }, { status: 400 });
  }

  const s = await getState();
  if (s.round !== round || s.step !== lens) {
    return NextResponse.json({ error: "The presenter has moved on. Your screen will catch up." }, { status: 409 });
  }
  if (!s.open) {
    return NextResponse.json({ error: "Voting is closed for this lens." }, { status: 409 });
  }

  await castVote(round, lens, voter, rating as Rating);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
