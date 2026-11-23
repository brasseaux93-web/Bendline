import { exportReviewsToCsv } from "@/lib/review/engine";
import {
  ReviewPermissionError,
  getReviewStudioSnapshot,
} from "@/lib/review/server-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getReviewStudioSnapshot();
    const csv = exportReviewsToCsv(snapshot.reviews);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="bendline-reviews.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ReviewPermissionError) {
      return new Response(err.message, { status: err.statusCode });
    }
    return new Response("Failed to export review CSV.", { status: 500 });
  }
}
