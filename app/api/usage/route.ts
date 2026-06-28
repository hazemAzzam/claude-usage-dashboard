import { NextResponse } from "next/server";
import { getRecords, summarize } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Parse a YYYY-MM-DD string into a local epoch-ms boundary. `endOfDay` pushes
// to 23:59:59.999 so the end date is inclusive.
function parseDay(s: string | null, endOfDay: boolean): number | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999)
    : new Date(y, m - 1, d, 0, 0, 0, 0);
  const ms = dt.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("refresh") === "1";

  let start = parseDay(url.searchParams.get("start"), false);
  let end = parseDay(url.searchParams.get("end"), true);
  if (start !== null && end !== null && start > end) [start, end] = [end, start];

  try {
    const { records, builtAt, ms } = await getRecords(force);
    // Explicit window when both bounds are valid; otherwise default to last 30 days.
    const sel = start !== null && end !== null ? { from: start, to: end } : "30d";
    const summary = summarize(records, sel, { builtAt, parseMs: ms });
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read usage logs" },
      { status: 500 },
    );
  }
}
