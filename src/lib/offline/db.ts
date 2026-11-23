"use client";

import Dexie, { type Table } from "dexie";
import type { ServerEntitlement } from "@/lib/billing/entitlements";
import type { CodeTableRecord } from "@/lib/calc/types";
import type {
  AttemptRecord,
  CodeFamily,
  ErrorReportRecord,
  MockSessionRecord,
  PlanTier,
  PracticeSessionRecord,
  Profile,
  ServableQuestion,
  SrsStateRecord,
} from "@/lib/domain/types";
import type {
  DrawingExerciseConfig,
  DrawingRuleRow,
  GradeDrawingOutput,
} from "@/lib/draw/grade";
import type { DrawGraph } from "@/lib/draw/graph";
import type {
  ClientMockQuestion,
  ClientMockSession,
  SavedMockAnswer,
} from "@/lib/mock/engine";
import type { NavAttemptRecord, OutlineNodeRecord } from "@/lib/nav/types";

export interface LocalWaitlistEntry {
  id: string;
  email: string;
  state: string;
  license_level: "journeyman";
  created_at: string;
}

export interface MockDraftRecord {
  id: string;
  jurisdiction_id: string;
  session: ClientMockSession;
  questions: ClientMockQuestion[];
  answers: Record<string, SavedMockAnswer>;
  flagged_question_ids: string[];
  current_index: number;
  pending_sync: boolean;
  updated_at: string;
}

export interface CachedCodeTableRecord extends CodeTableRecord {
  id: string;
}

export interface DrawingDraftRecord {
  id: string;
  exercise_id: string;
  mode: "learn" | "practice" | "exam";
  graph: DrawGraph;
  elapsed_ms: number;
  client_draft_id?: string;
  updated_at: string;
}

export interface CachedDrawingRuleRecord extends DrawingRuleRow {
  id: string;
}

export interface LocalDrawingSubmissionRecord {
  id: string;
  exercise_id: string;
  graph: DrawGraph;
  score: number;
  rubric_breakdown: GradeDrawingOutput["breakdown"];
  time_ms: number;
  mode: "learn" | "practice" | "exam";
  created_at: string;
}

export interface QuestionPackRecord {
  jurisdiction_id: string;
  code_family: CodeFamily;
  edition: string;
  questions: ServableQuestion[];
  synced_at: string;
}

export type OutboxItemKind = "attempt" | "drawing_draft";
export type OutboxItemStatus = "pending" | "synced" | "failed";

export interface OutboxItemRecord {
  id: string;
  idempotency_key: string;
  kind: OutboxItemKind;
  endpoint: string;
  payload: Record<string, unknown>;
  status: OutboxItemStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  synced_at: string | null;
}

export interface CachedSessionRecord {
  id: "active";
  authMode: "logged_out" | "authenticated";
  userEmail: string | null;
  profile: Profile;
  planTier: PlanTier;
  entitlement: ServerEntitlement | null;
  cachedAt: string;
}

export class BendlineOfflineDB extends Dexie {
  profiles!: Table<Profile, string>;
  attempts!: Table<AttemptRecord, string>;
  srsState!: Table<SrsStateRecord, string>;
  mockSessions!: Table<MockSessionRecord, string>;
  stateWaitlist!: Table<LocalWaitlistEntry, string>;
  practiceSessions!: Table<PracticeSessionRecord, string>;
  errorReports!: Table<ErrorReportRecord, string>;
  mockDrafts!: Table<MockDraftRecord, string>;
  codeTables!: Table<CachedCodeTableRecord, string>;
  drawingDrafts!: Table<DrawingDraftRecord, string>;
  drawingRules!: Table<CachedDrawingRuleRecord, string>;
  drawingExercises!: Table<DrawingExerciseConfig, string>;
  drawingSubmissions!: Table<LocalDrawingSubmissionRecord, string>;
  outlineNodes!: Table<OutlineNodeRecord, string>;
  navAttempts!: Table<NavAttemptRecord, string>;
  questionPacks!: Table<QuestionPackRecord, string>;
  outbox!: Table<OutboxItemRecord, string>;
  cachedSession!: Table<CachedSessionRecord, string>;

  constructor(dbName: string = "bendline_offline_v1") {
    super(dbName);
    this.version(1).stores({
      profiles: "id",
      attempts: "id, topic_id, question_id, attempted_at",
      srsState: "id, question_id, due_at",
      mockSessions: "id, jurisdiction_id, status, started_at",
      stateWaitlist: "id, email, state",
    });

    this.version(2).stores({
      profiles: "id",
      attempts: "id, topic_id, question_id, attempted_at",
      srsState: "id, question_id, due_at",
      mockSessions: "id, jurisdiction_id, status, started_at",
      stateWaitlist: "id, email, state",
      practiceSessions: "id, jurisdiction_id, mode, status, updated_at",
      errorReports: "id, question_id, created_at",
    });

    this.version(3).stores({
      profiles: "id",
      attempts: "id, topic_id, question_id, attempted_at",
      srsState: "id, question_id, due_at",
      mockSessions: "id, jurisdiction_id, status, started_at",
      stateWaitlist: "id, email, state",
      practiceSessions: "id, jurisdiction_id, mode, status, updated_at",
      errorReports: "id, question_id, created_at",
      mockDrafts: "id, jurisdiction_id, updated_at",
    });

    this.version(4).stores({
      profiles: "id",
      attempts: "id, topic_id, question_id, attempted_at",
      srsState: "id, question_id, due_at",
      mockSessions: "id, jurisdiction_id, status, started_at",
      stateWaitlist: "id, email, state",
      practiceSessions: "id, jurisdiction_id, mode, status, updated_at",
      errorReports: "id, question_id, created_at",
      mockDrafts: "id, jurisdiction_id, updated_at",
      codeTables:
        "id, [code_family+edition+table_key], code_family, edition, table_key",
    });

    this.version(5).stores({
      profiles: "id",
      attempts: "id, topic_id, question_id, attempted_at",
      srsState: "id, question_id, due_at",
      mockSessions: "id, jurisdiction_id, status, started_at",
      stateWaitlist: "id, email, state",
      practiceSessions: "id, jurisdiction_id, mode, status, updated_at",
      errorReports: "id, question_id, created_at",
      mockDrafts: "id, jurisdiction_id, updated_at",
      codeTables:
        "id, [code_family+edition+table_key], code_family, edition, table_key",
      drawingDrafts: "id, exercise_id, mode, updated_at",
      drawingRules:
        "id, [code_family+edition+rule_key], code_family, edition, rule_key",
      drawingExercises: "id, jurisdiction_id, status",
      drawingSubmissions: "id, exercise_id, created_at",
    });

    this.version(6).stores({
      profiles: "id",
      attempts: "id, topic_id, question_id, attempted_at",
      srsState: "id, question_id, due_at",
      mockSessions: "id, jurisdiction_id, status, started_at",
      stateWaitlist: "id, email, state",
      practiceSessions: "id, jurisdiction_id, mode, status, updated_at",
      errorReports: "id, question_id, created_at",
      mockDrafts: "id, jurisdiction_id, updated_at",
      codeTables:
        "id, [code_family+edition+table_key], code_family, edition, table_key",
      drawingDrafts: "id, exercise_id, mode, updated_at",
      drawingRules:
        "id, [code_family+edition+rule_key], code_family, edition, rule_key",
      drawingExercises: "id, jurisdiction_id, status",
      drawingSubmissions: "id, exercise_id, created_at",
      outlineNodes: "id, [code_family+edition], code_family, edition, parent_id, node_kind",
      navAttempts: "id, jurisdiction_id, chapter_node_id, outline_node_id, drill_type, completed_at",
    });

    this.version(7).stores({
      profiles: "id",
      attempts: "id, topic_id, question_id, attempted_at",
      srsState: "id, question_id, due_at",
      mockSessions: "id, jurisdiction_id, status, started_at",
      stateWaitlist: "id, email, state",
      practiceSessions: "id, jurisdiction_id, mode, status, updated_at",
      errorReports: "id, question_id, created_at",
      mockDrafts: "id, jurisdiction_id, updated_at",
      codeTables:
        "id, [code_family+edition+table_key], code_family, edition, table_key",
      drawingDrafts: "id, exercise_id, mode, updated_at",
      drawingRules:
        "id, [code_family+edition+rule_key], code_family, edition, rule_key",
      drawingExercises: "id, jurisdiction_id, status",
      drawingSubmissions: "id, exercise_id, created_at",
      outlineNodes:
        "id, [code_family+edition], code_family, edition, parent_id, node_kind",
      navAttempts:
        "id, jurisdiction_id, chapter_node_id, outline_node_id, drill_type, completed_at",
      questionPacks: "jurisdiction_id, code_family, edition, synced_at",
      outbox: "id, &idempotency_key, kind, status, created_at",
      cachedSession: "id",
    });
  }
}

let dbInstance: BendlineOfflineDB | null = null;

export function getOfflineDb(): BendlineOfflineDB | null {
  if (typeof window === "undefined") return null;
  if (!dbInstance) {
    dbInstance = new BendlineOfflineDB();
  }
  return dbInstance;
}
