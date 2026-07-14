import { NextResponse } from "next/server";
import { readProductionWeatherIntelligence } from "@/lib/weatherIntelligence.production";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readProductionWeatherIntelligence());
}
