import { NextResponse } from "next/server";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

// Public, identical for every phone, so Vercel's edge cache can absorb the polling.
export async function GET() {
  const s = await getState();
  return NextResponse.json(
    {
      useCase: s.useCase,
      step: s.step,
      open: s.open,
      round: s.round,
      verdicts: s.verdicts,
      updatedAt: s.updatedAt,
    },
    { headers: { "Cache-Control": "public, s-maxage=1, stale-while-revalidate=2" } },
  );
}
