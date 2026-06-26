import { NextResponse } from "next/server";
import { recentRadarFrames } from "@/lib/radar/kma";

/**
 * GET /api/radar/frames — the KMA radar composite timeline: the recent observed
 * frames (oldest → newest, 5-min cadence) the scrubber plays through. Pure time
 * math + a single cached probe; never exposes the service key. Returns
 * { available:false, frames:[] } (not an error) when the source is unavailable.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await recentRadarFrames();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
