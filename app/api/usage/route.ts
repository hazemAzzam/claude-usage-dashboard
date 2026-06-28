import { NextResponse } from "next/server";
import { getRecords, summarize, type Range } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RANGES: Range[] = ["7d", "30d", "90d", "all"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rangeParam = url.searchParams.get("range") as Range | null;
  const range: Range = rangeParam && RANGES.includes(rangeParam) ? rangeParam : "30d";
  const force = url.searchParams.get("refresh") === "1";

  try {
    const { records, builtAt, ms } = await getRecords(force);
    const summary = summarize(records, range, { builtAt, parseMs: ms });
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read usage logs" },
      { status: 500 },
    );
  }
}
