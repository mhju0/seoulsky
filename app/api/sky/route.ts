import { NextResponse } from "next/server";
import { readProductionLiveSkySnapshot } from "@/lib/liveSkySnapshot.production";

export const dynamic = "force-dynamic";

/** HTTP adapter for the server-side public sky snapshot. */
export async function GET() {
  try {
    const snapshot = await readProductionLiveSkySnapshot();
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // The client keeps the last good snapshot and shows a safe fallback.
    return NextResponse.json({ error: "sky_unavailable" }, { status: 503 });
  }
}
