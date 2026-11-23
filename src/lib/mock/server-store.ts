import {
  SEED_BLUEPRINTS,
  SEED_DRILL_QUESTIONS,
  SEED_JURISDICTIONS,
  SEED_TOPICS,
} from "@/lib/domain/seed-catalog";
import type {
  BlueprintWeight,
  Jurisdiction,
  ServableQuestion,
  Topic,
} from "@/lib/domain/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  type ClientMockQuestion,
  type ClientMockSession,
  type MockExamResult,
  type SavedMockAnswer,
  type ServerMockSession,
  composeMockExamQuestions,
  computeServerRemainingMs,
  gradeMockSession,
  sanitizeSessionForClient,
  stripAnswersForClient,
} from "./engine";

export class MockSessionNotFoundError extends Error {
  constructor(id: string) {
    super(`Mock session ${id} not found.`);
    this.name = "MockSessionNotFoundError";
  }
}

export class MockSessionExpiredError extends Error {
  constructor(id: string) {
    super(`Mock session ${id} has expired.`);
    this.name = "MockSessionExpiredError";
  }
}

export interface MockStoreResponse {
  session: ClientMockSession;
  questions: ClientMockQuestion[];
  server_now: string;
  remaining_ms: number;
}

interface GlobalMockStore {
  sessions: Map<string, ServerMockSession>;
}

const globalForMock = globalThis as unknown as {
  __bendlineMockStore?: GlobalMockStore;
};

function getMemoryStore(): GlobalMockStore {
  if (!globalForMock.__bendlineMockStore) {
    globalForMock.__bendlineMockStore = {
      sessions: new Map<string, ServerMockSession>(),
    };
  }
  return globalForMock.__bendlineMockStore;
}

export function clearMemoryMockStore(): void {
  getMemoryStore().sessions.clear();
}

async function resolveCatalogForServer(): Promise<{
  jurisdictions: Jurisdiction[];
  topics: Topic[];
  blueprints: BlueprintWeight[];
  questions: ServableQuestion[];
  userId: string | null;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
}> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      jurisdictions: SEED_JURISDICTIONS,
      topics: SEED_TOPICS,
      blueprints: SEED_BLUEPRINTS,
      questions: SEED_DRILL_QUESTIONS,
      userId: null,
      supabase: null,
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;

  if (!userId) {
    return {
      jurisdictions: SEED_JURISDICTIONS,
      topics: SEED_TOPICS,
      blueprints: SEED_BLUEPRINTS,
      questions: SEED_DRILL_QUESTIONS,
      userId: null,
      supabase,
    };
  }

  const [
    { data: jurRows },
    { data: topicRows },
    { data: bpRows },
    { data: qRows },
  ] = await Promise.all([
    supabase.from("jurisdictions").select("*"),
    supabase.from("topics").select("*").order("display_order", { ascending: true }),
    supabase.from("blueprints").select("jurisdiction_id, topic_id, weight_pct"),
    supabase
      .from("servable_questions")
      .select(
        "id, stem, type, options, correct_index, topic_id, jurisdiction_id, difficulty, code_family, edition, code_ref, explanation_seed, status, review_verdict, approval_reviewed_at, reviewed_at, reviewer_license_no, version"
      ),
  ]);

  const mappedQuestions: ServableQuestion[] =
    qRows && qRows.length > 0
      ? (qRows as Array<
          ServableQuestion & { approval_reviewed_at?: string | null }
        >).map((row) => ({
          ...row,
          reviewed_at: row.approval_reviewed_at ?? row.reviewed_at ?? null,
        }))
      : SEED_DRILL_QUESTIONS;

  return {
    jurisdictions:
      jurRows && jurRows.length > 0
        ? (jurRows as Jurisdiction[])
        : SEED_JURISDICTIONS,
    topics:
      topicRows && topicRows.length > 0 ? (topicRows as Topic[]) : SEED_TOPICS,
    blueprints:
      bpRows && bpRows.length > 0
        ? (bpRows as BlueprintWeight[])
        : SEED_BLUEPRINTS,
    questions: mappedQuestions,
    userId,
    supabase,
  };
}

function mapQuestionsForClient(
  questionIds: string[],
  questionsById: Map<string, ServableQuestion>
): ClientMockQuestion[] {
  const list: ClientMockQuestion[] = [];
  for (const id of questionIds) {
    const q = questionsById.get(id);
    if (q) list.push(stripAnswersForClient(q));
  }
  return list;
}

export async function listMockSessionsOnServer(params: {
  jurisdictionId?: string;
  userIdOverride?: string;
}): Promise<{ sessions: ClientMockSession[]; server_now: string }> {
  const serverNow = new Date().toISOString();
  const catalog = await resolveCatalogForServer();
  const ownerId = params.userIdOverride ?? catalog.userId ?? "local-preview-user";

  if (catalog.supabase && catalog.userId) {
    let query = catalog.supabase
      .from("mock_sessions")
      .select("*")
      .eq("user_id", catalog.userId)
      .order("started_at", { ascending: false })
      .limit(10);

    if (params.jurisdictionId) {
      query = query.eq("jurisdiction_id", params.jurisdictionId);
    }

    const { data } = await query;
    const rows = (data ?? []).map((row) =>
      sanitizeSessionForClient({
        id: row.id,
        user_id: row.user_id,
        jurisdiction_id: row.jurisdiction_id,
        question_ids: row.question_ids ?? [],
        answers: (row.answers ?? {}) as Record<string, SavedMockAnswer>,
        flagged_question_ids: row.flagged_question_ids ?? [],
        current_index: row.current_index ?? 0,
        status: row.status,
        started_at: row.started_at,
        expires_at: row.expires_at,
        submitted_at: row.submitted_at ?? null,
        time_spent_ms: row.time_spent_ms ?? 0,
        pass_pct: Number(row.pass_pct_snapshot ?? 70),
        open_book: Boolean(row.open_book_snapshot),
        allowed_refs:
          catalog.jurisdictions.find((j) => j.id === row.jurisdiction_id)
            ?.allowed_refs ?? [],
        requested_question_count:
          catalog.jurisdictions.find((j) => j.id === row.jurisdiction_id)
            ?.question_count ?? (row.question_ids?.length ?? 0),
        is_scaled_preview:
          (row.question_ids?.length ?? 0) <
          (catalog.jurisdictions.find((j) => j.id === row.jurisdiction_id)
            ?.question_count ?? 0),
        result:
          row.status === "submitted" || row.status === "expired"
            ? ((row.topic_breakdown as { mock_result?: MockExamResult } | null)
                ?.mock_result ?? null)
            : null,
      })
    );
    return { sessions: rows, server_now: serverNow };
  }

  const store = getMemoryStore();
  const sessions = [...store.sessions.values()]
    .filter(
      (s) =>
        s.user_id === ownerId &&
        (!params.jurisdictionId || s.jurisdiction_id === params.jurisdictionId)
    )
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
    .map(sanitizeSessionForClient);

  return { sessions, server_now: serverNow };
}

export async function createMockSessionOnServer(params: {
  jurisdictionId: string;
  resumeIfActive?: boolean;
  strictBankSize?: boolean;
  userIdOverride?: string;
  nowIso?: string;
  customQuestions?: ServableQuestion[];
}): Promise<MockStoreResponse> {
  const serverNow = params.nowIso ?? new Date().toISOString();
  const catalog = await resolveCatalogForServer();
  const ownerId = params.userIdOverride ?? catalog.userId ?? "local-preview-user";
  const jurisdiction = catalog.jurisdictions.find(
    (j) => j.id === params.jurisdictionId
  );

  if (!jurisdiction) {
    throw new Error(`Unknown jurisdiction ${params.jurisdictionId}`);
  }

  const questionPool = params.customQuestions ?? catalog.questions;
  const questionsById = new Map(questionPool.map((q) => [q.id, q]));

  // Check for existing resumable in-progress session first
  if (params.resumeIfActive !== false) {
    if (catalog.supabase && catalog.userId) {
      const { data: existingRows } = await catalog.supabase
        .from("mock_sessions")
        .select("*")
        .eq("user_id", catalog.userId)
        .eq("jurisdiction_id", jurisdiction.id)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1);

      const activeRow = existingRows?.[0];
      if (
        activeRow &&
        computeServerRemainingMs(activeRow.expires_at, serverNow) > 0
      ) {
        const mapped: ServerMockSession = {
          id: activeRow.id,
          user_id: activeRow.user_id,
          jurisdiction_id: activeRow.jurisdiction_id,
          question_ids: activeRow.question_ids ?? [],
          answers: (activeRow.answers ?? {}) as Record<string, SavedMockAnswer>,
          flagged_question_ids: activeRow.flagged_question_ids ?? [],
          current_index: activeRow.current_index ?? 0,
          status: activeRow.status,
          started_at: activeRow.started_at,
          expires_at: activeRow.expires_at,
          submitted_at: null,
          time_spent_ms: activeRow.time_spent_ms ?? 0,
          pass_pct: Number(activeRow.pass_pct_snapshot ?? jurisdiction.pass_pct),
          open_book: Boolean(activeRow.open_book_snapshot),
          allowed_refs: jurisdiction.open_book ? jurisdiction.allowed_refs : [],
          requested_question_count: jurisdiction.question_count,
          is_scaled_preview:
            (activeRow.question_ids?.length ?? 0) < jurisdiction.question_count,
          result: null,
        };
        return {
          session: sanitizeSessionForClient(mapped),
          questions: mapQuestionsForClient(mapped.question_ids, questionsById),
          server_now: serverNow,
          remaining_ms: computeServerRemainingMs(mapped.expires_at, serverNow),
        };
      }
    } else {
      const store = getMemoryStore();
      const activeMem = [...store.sessions.values()].find(
        (s) =>
          s.user_id === ownerId &&
          s.jurisdiction_id === jurisdiction.id &&
          s.status === "in_progress" &&
          computeServerRemainingMs(s.expires_at, serverNow) > 0
      );
      if (activeMem) {
        return {
          session: sanitizeSessionForClient(activeMem),
          questions: mapQuestionsForClient(activeMem.question_ids, questionsById),
          server_now: serverNow,
          remaining_ms: computeServerRemainingMs(activeMem.expires_at, serverNow),
        };
      }
    }
  }

  // Compose fresh exam strictly from blueprint & servable_questions
  const strictBank =
    params.strictBankSize ??
    Boolean(
      catalog.supabase &&
        catalog.userId &&
        questionPool.length >= jurisdiction.question_count
    );

  const composed = composeMockExamQuestions({
    jurisdiction,
    topics: catalog.topics,
    questions: questionPool,
    blueprints: catalog.blueprints,
    strictBankSize: strictBank,
  });

  const startedAtMs = Date.parse(serverNow);
  const expiresAtIso = new Date(
    startedAtMs + jurisdiction.time_limit_min * 60_000
  ).toISOString();

  const newSession: ServerMockSession = {
    id: crypto.randomUUID(),
    user_id: ownerId,
    jurisdiction_id: jurisdiction.id,
    question_ids: composed.questions.map((q) => q.id),
    answers: {},
    flagged_question_ids: [],
    current_index: 0,
    status: "in_progress",
    started_at: serverNow,
    expires_at: expiresAtIso,
    submitted_at: null,
    time_spent_ms: 0,
    pass_pct: jurisdiction.pass_pct,
    open_book: jurisdiction.open_book,
    allowed_refs: jurisdiction.open_book ? [...jurisdiction.allowed_refs] : [],
    requested_question_count: composed.requestedQuestionCount,
    is_scaled_preview: composed.isScaledPreview,
    result: null,
  };

  if (catalog.supabase && catalog.userId) {
    await catalog.supabase.from("mock_sessions").insert({
      id: newSession.id,
      user_id: catalog.userId,
      jurisdiction_id: newSession.jurisdiction_id,
      question_ids: newSession.question_ids,
      status: "in_progress",
      started_at: newSession.started_at,
      expires_at: newSession.expires_at,
      answers: {},
      flagged_question_ids: [],
      current_index: 0,
      total_questions: newSession.question_ids.length,
      pass_pct_snapshot: jurisdiction.pass_pct,
      open_book_snapshot: jurisdiction.open_book,
    });
  } else {
    getMemoryStore().sessions.set(newSession.id, newSession);
  }

  return {
    session: sanitizeSessionForClient(newSession),
    questions: composed.questions.map(stripAnswersForClient),
    server_now: serverNow,
    remaining_ms: computeServerRemainingMs(newSession.expires_at, serverNow),
  };
}

export async function getMockSessionOnServer(params: {
  sessionId: string;
  userIdOverride?: string;
  nowIso?: string;
  customQuestions?: ServableQuestion[];
}): Promise<MockStoreResponse> {
  const serverNow = params.nowIso ?? new Date().toISOString();
  const catalog = await resolveCatalogForServer();
  const ownerId = params.userIdOverride ?? catalog.userId ?? "local-preview-user";
  const questionPool = params.customQuestions ?? catalog.questions;
  const questionsById = new Map(questionPool.map((q) => [q.id, q]));

  let session: ServerMockSession | null = null;

  if (catalog.supabase && catalog.userId) {
    const { data: row } = await catalog.supabase
      .from("mock_sessions")
      .select("*")
      .eq("id", params.sessionId)
      .eq("user_id", catalog.userId)
      .maybeSingle();

    if (row) {
      const jur = catalog.jurisdictions.find(
        (j) => j.id === row.jurisdiction_id
      );
      session = {
        id: row.id,
        user_id: row.user_id,
        jurisdiction_id: row.jurisdiction_id,
        question_ids: row.question_ids ?? [],
        answers: (row.answers ?? {}) as Record<string, SavedMockAnswer>,
        flagged_question_ids: row.flagged_question_ids ?? [],
        current_index: row.current_index ?? 0,
        status: row.status,
        started_at: row.started_at,
        expires_at: row.expires_at,
        submitted_at: row.submitted_at ?? null,
        time_spent_ms: row.time_spent_ms ?? 0,
        pass_pct: Number(row.pass_pct_snapshot ?? jur?.pass_pct ?? 70),
        open_book: Boolean(row.open_book_snapshot),
        allowed_refs: jur?.open_book ? jur.allowed_refs : [],
        requested_question_count:
          jur?.question_count ?? (row.question_ids?.length ?? 0),
        is_scaled_preview:
          (row.question_ids?.length ?? 0) < (jur?.question_count ?? 0),
        result:
          row.status === "submitted" || row.status === "expired"
            ? ((row.topic_breakdown as { mock_result?: MockExamResult } | null)
                ?.mock_result ?? null)
            : null,
      };
    }
  } else {
    const found = getMemoryStore().sessions.get(params.sessionId);
    if (found && found.user_id === ownerId) {
      session = found;
    }
  }

  if (!session) {
    throw new MockSessionNotFoundError(params.sessionId);
  }

  return {
    session: sanitizeSessionForClient(session),
    questions: mapQuestionsForClient(session.question_ids, questionsById),
    server_now: serverNow,
    remaining_ms:
      session.status === "in_progress"
        ? computeServerRemainingMs(session.expires_at, serverNow)
        : 0,
  };
}

export async function patchMockSessionOnServer(params: {
  sessionId: string;
  answers?: Record<string, { selected_index: number; time_ms: number }>;
  flaggedQuestionIds?: string[];
  currentIndex?: number;
  timeSpentMs?: number;
  userIdOverride?: string;
  nowIso?: string;
}): Promise<{ session: ClientMockSession; server_now: string; remaining_ms: number }> {
  const serverNow = params.nowIso ?? new Date().toISOString();
  const catalog = await resolveCatalogForServer();
  const ownerId = params.userIdOverride ?? catalog.userId ?? "local-preview-user";

  const existingRes = await getMockSessionOnServer({
    sessionId: params.sessionId,
    userIdOverride: ownerId,
    nowIso: serverNow,
  });
  const current = existingRes.session;

  if (current.status !== "in_progress") {
    throw new MockSessionExpiredError(params.sessionId);
  }

  const remainingMs = computeServerRemainingMs(current.expires_at, serverNow);
  if (remainingMs <= 0) {
    throw new MockSessionExpiredError(params.sessionId);
  }

  const allowedQuestionSet = new Set(current.question_ids);
  const nextAnswers: Record<string, SavedMockAnswer> = { ...current.answers };

  if (params.answers) {
    for (const [qId, ans] of Object.entries(params.answers)) {
      if (allowedQuestionSet.has(qId)) {
        nextAnswers[qId] = {
          selected_index: ans.selected_index,
          time_ms: Math.max(0, ans.time_ms),
          updated_at: serverNow,
        };
      }
    }
  }

  const nextFlags = params.flaggedQuestionIds
    ? params.flaggedQuestionIds.filter((id) => allowedQuestionSet.has(id))
    : current.flagged_question_ids;

  const nextIndex =
    typeof params.currentIndex === "number"
      ? Math.max(0, Math.min(current.question_ids.length - 1, params.currentIndex))
      : current.current_index;

  const nextTimeSpent =
    typeof params.timeSpentMs === "number"
      ? Math.max(current.time_spent_ms, params.timeSpentMs)
      : current.time_spent_ms;

  if (catalog.supabase && catalog.userId) {
    await catalog.supabase
      .from("mock_sessions")
      .update({
        answers: nextAnswers,
        flagged_question_ids: nextFlags,
        current_index: nextIndex,
        time_spent_ms: nextTimeSpent,
      })
      .eq("id", params.sessionId)
      .eq("user_id", catalog.userId);
  } else {
    const mem = getMemoryStore().sessions.get(params.sessionId);
    if (mem) {
      mem.answers = nextAnswers;
      mem.flagged_question_ids = nextFlags;
      mem.current_index = nextIndex;
      mem.time_spent_ms = nextTimeSpent;
    }
  }

  const updated: ClientMockSession = {
    ...current,
    answers: nextAnswers,
    flagged_question_ids: nextFlags,
    current_index: nextIndex,
    time_spent_ms: nextTimeSpent,
    // Keep answer secrecy intact
    result: null,
  };

  return {
    session: updated,
    server_now: serverNow,
    remaining_ms: remainingMs,
  };
}

export async function submitMockSessionOnServer(params: {
  sessionId: string;
  finalAnswers?: Record<string, { selected_index: number; time_ms: number }>;
  flaggedQuestionIds?: string[];
  timeSpentMs?: number;
  userIdOverride?: string;
  nowIso?: string;
  customQuestions?: ServableQuestion[];
}): Promise<{
  session: ClientMockSession;
  result: MockExamResult;
  server_now: string;
}> {
  const serverNow = params.nowIso ?? new Date().toISOString();
  const catalog = await resolveCatalogForServer();
  const ownerId = params.userIdOverride ?? catalog.userId ?? "local-preview-user";
  const questionPool = params.customQuestions ?? catalog.questions;
  const questionsById = new Map(questionPool.map((q) => [q.id, q]));

  const currentRes = await getMockSessionOnServer({
    sessionId: params.sessionId,
    userIdOverride: ownerId,
    nowIso: serverNow,
    customQuestions: questionPool,
  });

  const session = currentRes.session;

  if (session.status !== "in_progress" && session.result) {
    return {
      session,
      result: session.result,
      server_now: serverNow,
    };
  }

  const expiredAtSubmit =
    Date.parse(serverNow) > Date.parse(session.expires_at);
  const withinAutoSubmitGrace =
    Date.parse(serverNow) <= Date.parse(session.expires_at) + 5000;

  const mergedAnswers: Record<string, SavedMockAnswer> = {
    ...session.answers,
  };
  const allowedSet = new Set(session.question_ids);

  if (params.finalAnswers && withinAutoSubmitGrace) {
    for (const [qId, ans] of Object.entries(params.finalAnswers)) {
      if (allowedSet.has(qId)) {
        mergedAnswers[qId] = {
          selected_index: ans.selected_index,
          time_ms: Math.max(0, ans.time_ms),
          updated_at: serverNow,
        };
      }
    }
  }

  const nextFlags = params.flaggedQuestionIds
    ? params.flaggedQuestionIds.filter((id) => allowedSet.has(id))
    : session.flagged_question_ids;

  const finalStatus = expiredAtSubmit ? "expired" : "submitted";

  const fullSession: ServerMockSession = {
    ...session,
    user_id: ownerId,
    answers: mergedAnswers,
    flagged_question_ids: nextFlags,
    status: finalStatus,
    submitted_at: serverNow,
    time_spent_ms: Math.max(session.time_spent_ms, params.timeSpentMs ?? 0),
    result: null,
  };

  const result = gradeMockSession({
    session: fullSession,
    questionsById,
    topics: catalog.topics,
    submittedAtIso: serverNow,
  });
  fullSession.result = result;
  fullSession.time_spent_ms = result.total_time_ms;

  if (catalog.supabase && catalog.userId) {
    await catalog.supabase
      .from("mock_sessions")
      .update({
        answers: mergedAnswers,
        flagged_question_ids: nextFlags,
        status: finalStatus,
        submitted_at: serverNow,
        time_spent_ms: result.total_time_ms,
        score_pct: result.score_pct,
        passed: result.passed,
        correct_count: result.correct_count,
        total_questions: result.total_questions,
        topic_breakdown: { mock_result: result },
      })
      .eq("id", params.sessionId)
      .eq("user_id", catalog.userId);

    // Record graded exam attempts for downstream topic analytics
    const attemptRows = result.question_review
      .filter((item) => item.selected_index !== null)
      .map((item) => {
        const q = questionsById.get(item.question_id);
        return {
          user_id: catalog.userId,
          question_id: item.question_id,
          question_version: q?.version ?? 1,
          mock_session_id: params.sessionId,
          selected_index: item.selected_index!,
          is_correct: item.is_correct,
          time_ms: item.time_ms,
          mode: "exam",
          attempted_at: serverNow,
        };
      });

    if (attemptRows.length > 0) {
      await catalog.supabase.from("attempts").insert(attemptRows);
    }
  } else {
    getMemoryStore().sessions.set(fullSession.id, fullSession);
  }

  return {
    session: sanitizeSessionForClient(fullSession),
    result,
    server_now: serverNow,
  };
}
