import { NextResponse } from "next/server";
import { loadPublicAccuracyMetrics } from "@/lib/accuracy/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadPublicAccuracyMetrics();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "public, max-age=60",
    },
  });
}
