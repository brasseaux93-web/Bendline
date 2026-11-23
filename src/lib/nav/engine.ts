import type { Jurisdiction } from "@/lib/domain/types";
import type {
  ChapterLookupMetric,
  NavAttemptRecord,
  NavDrillPrompt,
  NavDrillType,
  OutlineChapterGroup,
  OutlineNodeRecord,
  OverallNavMetrics,
} from "./types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Navigation trainer is strictly enabled only for open-book jurisdictions
 * (e.g. Colorado is open_book=true; Texas and California are open_book=false).
 */
export function isNavigationTrainerEnabled(jurisdiction: Jurisdiction): boolean {
  return jurisdiction.open_book === true;
}

export function filterOutlineForJurisdiction(
  nodes: OutlineNodeRecord[],
  jurisdiction: Jurisdiction
): OutlineNodeRecord[] {
  return nodes
    .filter(
      (n) =>
        n.code_family === jurisdiction.code_family &&
        n.edition === jurisdiction.edition &&
        (n.jurisdiction_id === null || n.jurisdiction_id === jurisdiction.id)
    )
    .sort((a, b) => a.display_order - b.display_order);
}

export interface OutlineTreeResult {
  chapters: OutlineChapterGroup[];
  nodeById: Map<string, OutlineNodeRecord>;
  chapterByNodeId: Map<string, OutlineNodeRecord>;
}

export function buildOutlineTree(nodes: OutlineNodeRecord[]): OutlineTreeResult {
  const sorted = [...nodes].sort((a, b) => a.display_order - b.display_order);
  const nodeById = new Map<string, OutlineNodeRecord>(
    sorted.map((n) => [n.id, n])
  );

  const chapterNodes = sorted.filter((n) => n.node_kind === "chapter");
  const childrenByChapter = new Map<string, OutlineNodeRecord[]>();
  for (const ch of chapterNodes) {
    childrenByChapter.set(ch.id, []);
  }

  const chapterByNodeId = new Map<string, OutlineNodeRecord>();
  for (const ch of chapterNodes) {
    chapterByNodeId.set(ch.id, ch);
  }

  for (const node of sorted) {
    if (node.node_kind === "chapter") continue;
    let cursor: OutlineNodeRecord | undefined = node;
    let guard = 0;
    while (cursor && cursor.parent_id && guard < 8) {
      const parent = nodeById.get(cursor.parent_id);
      if (!parent) break;
      if (parent.node_kind === "chapter") {
        chapterByNodeId.set(node.id, parent);
        childrenByChapter.get(parent.id)?.push(node);
        break;
      }
      cursor = parent;
      guard += 1;
    }
  }

  const chapters: OutlineChapterGroup[] = chapterNodes.map((ch) => ({
    chapter: ch,
    children: childrenByChapter.get(ch.id) ?? [],
  }));

  return { chapters, nodeById, chapterByNodeId };
}

export interface GenerateNavQueueOptions {
  count?: number;
  chapterId?: string | null;
  seed?: number;
  targetTimeOverrideMs?: number;
}

export function generateNavDrillQueue(
  nodes: OutlineNodeRecord[],
  drillType: NavDrillType,
  options: GenerateNavQueueOptions = {}
): NavDrillPrompt[] {
  const {
    count = 6,
    chapterId = null,
    seed = 42,
    targetTimeOverrideMs,
  } = options;

  const tree = buildOutlineTree(nodes);
  const allTargets = nodes.filter(
    (n) => n.node_kind !== "chapter" && tree.chapterByNodeId.has(n.id)
  );

  const scopedTargets = chapterId
    ? allTargets.filter(
        (n) => tree.chapterByNodeId.get(n.id)?.id === chapterId
      )
    : allTargets;

  if (scopedTargets.length === 0) {
    return [];
  }

  const rng = mulberry32(seed);
  const ordered = shuffleWithRng(scopedTargets, rng).slice(
    0,
    Math.min(count, scopedTargets.length)
  );

  return ordered.map((targetNode, idx) => {
    const chapterNode = tree.chapterByNodeId.get(targetNode.id)!;
    const cuePrompt =
      targetNode.lookup_cues[0] ??
      targetNode.summary_md ??
      `Locate ${targetNode.title} in ${chapterNode.code_ref}.`;

    if (drillType === "index_term") {
      const correctTerm =
        targetNode.index_terms[0] ?? targetNode.title;

      const distractorPool: string[] = [];
      const seenLower = new Set<string>([correctTerm.toLowerCase()]);

      for (const candidate of shuffleWithRng(allTargets, rng)) {
        if (candidate.id === targetNode.id) continue;
        for (const term of candidate.index_terms) {
          const normalized = term.trim().toLowerCase();
          if (!normalized || seenLower.has(normalized)) continue;
          seenLower.add(normalized);
          distractorPool.push(term.trim());
          if (distractorPool.length >= 3) break;
        }
        if (distractorPool.length >= 3) break;
      }

      // Fallback from chapter terms if scoped catalog is small
      if (distractorPool.length < 3) {
        for (const node of nodes) {
          if (node.id === targetNode.id) continue;
          for (const term of node.index_terms) {
            const normalized = term.trim().toLowerCase();
            if (!normalized || seenLower.has(normalized)) continue;
            seenLower.add(normalized);
            distractorPool.push(term.trim());
            if (distractorPool.length >= 3) break;
          }
          if (distractorPool.length >= 3) break;
        }
      }

      const rawOptions = [correctTerm, ...distractorPool.slice(0, 3)];
      const shuffledOptions = shuffleWithRng(rawOptions, rng);
      const correctOptionIndex = shuffledOptions.indexOf(correctTerm);

      return {
        id: `nav-drill-${drillType}-${targetNode.id}-${idx}`,
        drillType,
        targetNode,
        chapterNode,
        cuePrompt,
        targetTimeMs: null,
        options: shuffledOptions,
        correctOptionIndex,
      };
    }

    return {
      id: `nav-drill-${drillType}-${targetNode.id}-${idx}`,
      drillType,
      targetNode,
      chapterNode,
      cuePrompt,
      targetTimeMs:
        drillType === "timed_find"
          ? targetTimeOverrideMs ?? targetNode.target_time_ms
          : null,
    };
  });
}

export function evaluateNavAttempt(input: {
  id?: string;
  jurisdictionId: string;
  prompt: NavDrillPrompt;
  wrongGuesses: number;
  elapsedMs: number;
  completedAt?: string;
}): NavAttemptRecord {
  const safeElapsed = Math.max(0, Math.round(input.elapsedMs));
  const safeWrong = Math.max(0, Math.floor(input.wrongGuesses));
  const metTargetTime =
    input.prompt.drillType === "timed_find" &&
    input.prompt.targetTimeMs !== null
      ? safeElapsed <= input.prompt.targetTimeMs
      : null;

  return {
    id: input.id ?? crypto.randomUUID(),
    jurisdiction_id: input.jurisdictionId,
    outline_node_id: input.prompt.targetNode.id,
    chapter_node_id: input.prompt.chapterNode.id,
    drill_type: input.prompt.drillType,
    elapsed_ms: safeElapsed,
    target_time_ms: input.prompt.targetTimeMs,
    met_target_time: metTargetTime,
    first_try_correct: safeWrong === 0,
    attempt_count: safeWrong + 1,
    completed_at: input.completedAt ?? new Date().toISOString(),
  };
}

export function computeMedianMs(values: number[]): number | null {
  const valid = values
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);

  if (valid.length === 0) return null;

  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    return Math.round(valid[mid]);
  }
  return Math.round((valid[mid - 1] + valid[mid]) / 2);
}

export function computeChapterLookupMetrics(
  nodes: OutlineNodeRecord[],
  attempts: NavAttemptRecord[],
  jurisdictionId?: string
): ChapterLookupMetric[] {
  const chapters = nodes
    .filter((n) => n.node_kind === "chapter")
    .sort((a, b) => a.display_order - b.display_order);

  const filteredAttempts = jurisdictionId
    ? attempts.filter((a) => a.jurisdiction_id === jurisdictionId)
    : attempts;

  return chapters.map((chapter) => {
    const matching = filteredAttempts.filter(
      (a) => a.chapter_node_id === chapter.id
    );
    const totalAttempts = matching.length;
    const firstTryCorrectCount = matching.filter(
      (a) => a.first_try_correct
    ).length;

    const firstTryAccuracyPct =
      totalAttempts > 0
        ? Math.round((firstTryCorrectCount / totalAttempts) * 100)
        : null;

    const medianMs = computeMedianMs(matching.map((a) => a.elapsed_ms));

    const sortedLatest = [...matching].sort((a, b) =>
      b.completed_at.localeCompare(a.completed_at)
    );

    return {
      chapter,
      totalAttempts,
      firstTryCorrectCount,
      firstTryAccuracyPct,
      medianMs,
      lastElapsedMs: sortedLatest[0]?.elapsed_ms ?? null,
    };
  });
}

export function computeOverallNavMetrics(
  attempts: NavAttemptRecord[],
  jurisdictionId?: string
): OverallNavMetrics {
  const filtered = jurisdictionId
    ? attempts.filter((a) => a.jurisdiction_id === jurisdictionId)
    : attempts;

  const totalAttempts = filtered.length;
  if (totalAttempts === 0) {
    return {
      totalAttempts: 0,
      medianMs: null,
      firstTryAccuracyPct: null,
      targetHitRatePct: null,
    };
  }

  const firstTryCount = filtered.filter((a) => a.first_try_correct).length;
  const timedOnly = filtered.filter((a) => a.met_target_time !== null);
  const timedHits = timedOnly.filter((a) => a.met_target_time === true).length;

  return {
    totalAttempts,
    medianMs: computeMedianMs(filtered.map((a) => a.elapsed_ms)),
    firstTryAccuracyPct: Math.round((firstTryCount / totalAttempts) * 100),
    targetHitRatePct:
      timedOnly.length > 0
        ? Math.round((timedHits / timedOnly.length) * 100)
        : null,
  };
}

export function formatLookupMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
