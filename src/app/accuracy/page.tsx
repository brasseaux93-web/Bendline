import { PublicAccuracyView } from "@/components/accuracy/public-accuracy-view";
import { loadPublicAccuracyMetrics } from "@/lib/accuracy/metrics";

export const dynamic = "force-dynamic";

export default async function AccuracyPage() {
  const snapshot = await loadPublicAccuracyMetrics();
  return <PublicAccuracyView snapshot={snapshot} />;
}
