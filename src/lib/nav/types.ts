import { z } from "zod";
import type { CodeFamily } from "@/lib/domain/types";

export const outlineNodeKindSchema = z.enum(["chapter", "section", "table"]);
export type OutlineNodeKind = z.infer<typeof outlineNodeKindSchema>;

export const navDrillTypeSchema = z.enum([
  "where_is_it",
  "timed_find",
  "index_term",
]);
export type NavDrillType = z.infer<typeof navDrillTypeSchema>;

export const outlineNodeSchema = z.object({
  id: z.string().min(1),
  topic_id: z.string().min(1),
  parent_id: z.string().nullable(),
  jurisdiction_id: z.string().nullable(),
  code_family: z.enum(["IPC", "UPC"]),
  edition: z.string().min(1),
  code_ref: z.string().min(1),
  title: z.string().min(1),
  summary_md: z.string().default(""),
  display_order: z.number().int().default(0),
  node_kind: outlineNodeKindSchema.default("section"),
  index_terms: z.array(z.string()).default([]),
  lookup_cues: z.array(z.string()).default([]),
  target_time_ms: z.number().int().positive().default(25_000),
});
export type OutlineNodeRecord = z.infer<typeof outlineNodeSchema>;

export const createCustomOutlineNodeSchema = z.object({
  topic_id: z.string().min(1),
  parent_id: z.string().nullable(),
  code_family: z.enum(["IPC", "UPC"]),
  edition: z.string().min(1),
  code_ref: z.string().trim().min(2).max(60),
  title: z.string().trim().min(3).max(140),
  summary_md: z.string().trim().max(400).default(""),
  node_kind: outlineNodeKindSchema,
  index_terms: z.array(z.string().trim().min(1)).min(1),
  lookup_cues: z.array(z.string().trim().min(1)).min(1),
  target_time_ms: z.number().int().min(5000).max(180000).default(22000),
});

export interface OutlineChapterGroup {
  chapter: OutlineNodeRecord;
  children: OutlineNodeRecord[];
}

export interface NavDrillPrompt {
  id: string;
  drillType: NavDrillType;
  targetNode: OutlineNodeRecord;
  chapterNode: OutlineNodeRecord;
  cuePrompt: string;
  targetTimeMs: number | null;
  options?: string[];
  correctOptionIndex?: number;
}

export const navAttemptSchema = z.object({
  id: z.string().min(1),
  jurisdiction_id: z.string().min(1),
  outline_node_id: z.string().min(1),
  chapter_node_id: z.string().min(1),
  drill_type: navDrillTypeSchema,
  elapsed_ms: z.number().int().nonnegative(),
  target_time_ms: z.number().int().positive().nullable(),
  met_target_time: z.boolean().nullable(),
  first_try_correct: z.boolean(),
  attempt_count: z.number().int().min(1),
  completed_at: z.string().min(1),
});
export type NavAttemptRecord = z.infer<typeof navAttemptSchema>;

export interface ChapterLookupMetric {
  chapter: OutlineNodeRecord;
  totalAttempts: number;
  firstTryCorrectCount: number;
  firstTryAccuracyPct: number | null;
  medianMs: number | null;
  lastElapsedMs: number | null;
}

export interface OverallNavMetrics {
  totalAttempts: number;
  medianMs: number | null;
  firstTryAccuracyPct: number | null;
  targetHitRatePct: number | null;
}

export interface TabbingGuideItem {
  chapterRef: string;
  title: string;
  tabColor: string;
  tabSide: "Top edge" | "Right edge";
  focusSummary: string;
}

export interface TabbingGuide {
  jurisdictionName: string;
  codeFamily: CodeFamily;
  edition: string;
  openBook: boolean;
  allowedRefs: string[];
  bulletinUrl: string | null;
  lastVerifiedAt: string | null;
  bulletinVerificationNotice: string;
  disclaimer: string;
  recommendedTabs: TabbingGuideItem[];
  examDayChecklist: string[];
}
