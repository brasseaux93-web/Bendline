import type { CodeFamily, PipeSystem, UserRole } from "@/lib/domain/types";
import type { DrawNode } from "@/lib/draw/graph";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_RUBRIC_SCORES,
  applyReviewToDrawingExercise,
  applyReviewToQuestion,
  createNewDrawingExerciseVersion,
  createNewQuestionVersion,
  validateReviewSubmission,
} from "./engine";
import {
  SEED_INITIAL_REVIEWS,
  SEED_REVIEWERS,
  SEED_REVIEW_DRAWING_EXERCISES,
  SEED_REVIEW_QUESTIONS,
} from "./seed-review-queue";
import type {
  ReviewItemStatus,
  ReviewRecord,
  ReviewSubmissionInput,
  ReviewVerdictAction,
  ReviewableDrawingExercise,
  ReviewableQuestion,
  ReviewerRoleRecord,
  RubricScores,
} from "./types";

interface MemoryReviewStore {
  questions: ReviewableQuestion[];
  drawingExercises: ReviewableDrawingExercise[];
  reviews: ReviewRecord[];
  reviewers: ReviewerRoleRecord[];
}

const globalForReview = globalThis as unknown as {
  __bendlineReviewStore?: MemoryReviewStore;
};

function createInitialMemoryStore(): MemoryReviewStore {
  return {
    questions: SEED_REVIEW_QUESTIONS.map((q) => ({
      ...q,
      options: [...q.options],
    })),
    drawingExercises: SEED_REVIEW_DRAWING_EXERCISES.map((ex) => ({
      ...ex,
      fixtures: [...ex.fixtures],
      constraints: { ...ex.constraints },
      scoring_rubric: { ...ex.scoring_rubric },
    })),
    reviews: SEED_INITIAL_REVIEWS.map((r) => ({
      ...r,
      scores: { ...r.scores },
    })),
    reviewers: SEED_REVIEWERS.map((u) => ({ ...u })),
  };
}

function getMemoryStore(): MemoryReviewStore {
  if (!globalForReview.__bendlineReviewStore) {
    globalForReview.__bendlineReviewStore = createInitialMemoryStore();
  }
  return globalForReview.__bendlineReviewStore;
}

export function resetMemoryReviewStore(): void {
  globalForReview.__bendlineReviewStore = createInitialMemoryStore();
}

export class ReviewPermissionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "ReviewPermissionError";
    this.statusCode = statusCode;
  }
}

export class ReviewValidationError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(errors.join(" "));
    this.name = "ReviewValidationError";
    this.errors = errors;
  }
}

export interface ReviewStudioSnapshot {
  questions: ReviewableQuestion[];
  drawingExercises: ReviewableDrawingExercise[];
  reviews: ReviewRecord[];
  reviewers: ReviewerRoleRecord[];
  currentUserId: string;
  currentUserName: string;
  currentRole: UserRole;
  canManageRoles: boolean;
  source: "supabase" | "memory_preview";
}

async function resolveStaffContext() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      supabase: null,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      userName: "Elena Morales (Admin)",
      role: "admin" as UserRole,
      licenseNo: "TX-MP-41892",
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    // Allow local SSR/unconfigured session fallback only when auth session isn't active
    return {
      supabase: null,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      userName: "Elena Morales (Admin)",
      role: "admin" as UserRole,
      licenseNo: "TX-MP-41892",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name, license_no")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role as UserRole | undefined) ?? "user";
  if (role !== "reviewer" && role !== "admin") {
    throw new ReviewPermissionError(
      "Staff reviewer or admin role is required to access the editorial review studio.",
      403
    );
  }

  return {
    supabase,
    userId: user.id,
    userName: profile?.display_name ?? user.email ?? "Licensed Reviewer",
    role,
    licenseNo: profile?.license_no ?? "",
  };
}

export async function getReviewStudioSnapshot(): Promise<ReviewStudioSnapshot> {
  const ctx = await resolveStaffContext();

  if (ctx.supabase) {
    const [
      { data: qRows },
      { data: dRows },
      { data: qrRows },
      { data: drRows },
      { data: pRows },
    ] = await Promise.all([
      ctx.supabase
        .from("questions")
        .select("*")
        .order("updated_at", { ascending: false }),
      ctx.supabase
        .from("drawing_exercises")
        .select("*")
        .order("updated_at", { ascending: false }),
      ctx.supabase
        .from("question_reviews")
        .select("*")
        .order("reviewed_at", { ascending: false }),
      ctx.supabase
        .from("drawing_exercise_reviews")
        .select("*")
        .order("reviewed_at", { ascending: false }),
      ctx.supabase
        .from("profiles")
        .select("id, display_name, role, license_no, updated_at")
        .order("updated_at", { ascending: false }),
    ]);

    const reviewerList: ReviewerRoleRecord[] = (pRows ?? []).map((p) => ({
      id: p.id as string,
      display_name: (p.display_name as string | null) ?? "Reviewer",
      email: "",
      role: p.role as UserRole,
      license_no: (p.license_no as string | null) ?? null,
      updated_at: p.updated_at as string,
    }));

    const reviewerMap = new Map(reviewerList.map((r) => [r.id, r]));

    const questions: ReviewableQuestion[] = (qRows ?? []).map((q) => ({
      id: q.id as string,
      topic_id: q.topic_id as string,
      stem: q.stem as string,
      type: q.type as ReviewableQuestion["type"],
      options: (q.options as string[]) ?? [],
      correct_index: Number(q.correct_index ?? 0),
      difficulty: Number(q.difficulty ?? 3),
      code_family: q.code_family as CodeFamily,
      edition: q.edition as string,
      code_ref: q.code_ref as string,
      explanation_seed: q.explanation_seed as string,
      status: q.status as ReviewItemStatus,
      version: Number(q.version ?? 1),
      reviewer_id: (q.reviewer_id as string | null) ?? null,
      reviewed_at: (q.reviewed_at as string | null) ?? null,
      reviewer_license_no:
        reviewerMap.get(q.reviewer_id as string)?.license_no ?? null,
      latest_review_comments: null,
      latest_suggested_fix: null,
    }));

    const drawingExercises: ReviewableDrawingExercise[] = (dRows ?? []).map(
      (ex) => ({
        id: ex.id as string,
        jurisdiction_id: ex.jurisdiction_id as string,
        topic_id:
          (ex.topic_id as string | null) ??
          "22222222-2222-4222-8222-222222222210",
        title: ex.title as string,
        prompt_md: ex.prompt_md as string,
        fixtures: (ex.fixtures as DrawNode[]) ?? [],
        pipe_system: ex.pipe_system as PipeSystem,
        constraints: (ex.constraints as Record<string, unknown>) ?? {},
        scoring_rubric: (ex.scoring_rubric as Record<string, number>) ?? {},
        code_family: ex.code_family as CodeFamily,
        edition: ex.edition as string,
        status: ex.status as ReviewItemStatus,
        version: Number(ex.version ?? 1),
        reviewer_id: (ex.reviewer_id as string | null) ?? null,
        reviewed_at: (ex.reviewed_at as string | null) ?? null,
        reviewer_license_no:
          reviewerMap.get(ex.reviewer_id as string)?.license_no ?? null,
        latest_review_comments: null,
        latest_suggested_fix: null,
      })
    );

    const qById = new Map(questions.map((q) => [q.id, q]));
    const dById = new Map(drawingExercises.map((d) => [d.id, d]));

    const mapDbVerdictToAction = (v: string): ReviewVerdictAction =>
      v === "approved" ? "approve" : v === "rejected" ? "reject" : "revise";
    const mapDbVerdictToStatus = (v: string): ReviewItemStatus =>
      v === "approved"
        ? "published"
        : v === "rejected"
          ? "archived"
          : "revise";

    const reviews: ReviewRecord[] = [
      ...(qrRows ?? []).map((r) => {
        const q = qById.get(r.question_id as string);
        const rev = reviewerMap.get(r.reviewer_id as string);
        const verdict = mapDbVerdictToAction(r.verdict as string);
        return {
          id: r.id as string,
          item_kind: "question" as const,
          item_id: r.question_id as string,
          item_title: q?.stem ?? "Question",
          item_version: Number(r.question_version ?? 1),
          item_type: q?.type ?? ("mcq" as const),
          topic_id: q?.topic_id ?? "",
          code_family: q?.code_family ?? ("IPC" as const),
          edition: q?.edition ?? "2021",
          reviewer_id: r.reviewer_id as string,
          reviewer_name: rev?.display_name ?? "Reviewer",
          license_no: r.license_no as string,
          reviewed_at: r.reviewed_at as string,
          scores: (r.scores as RubricScores) ?? DEFAULT_RUBRIC_SCORES,
          calc_independently_verified: Boolean(r.calc_independently_verified),
          verdict,
          db_verdict: r.verdict as ReviewRecord["db_verdict"],
          resulting_status: mapDbVerdictToStatus(r.verdict as string),
          comments: (r.comments as string | null) ?? "",
          suggested_fix: (r.suggested_fix as string | null) ?? "",
        };
      }),
      ...(drRows ?? []).map((r) => {
        const d = dById.get(r.exercise_id as string);
        const rev = reviewerMap.get(r.reviewer_id as string);
        const verdict = mapDbVerdictToAction(r.verdict as string);
        return {
          id: r.id as string,
          item_kind: "drawing_exercise" as const,
          item_id: r.exercise_id as string,
          item_title: d?.title ?? "Drawing Exercise",
          item_version: Number(r.exercise_version ?? 1),
          item_type: "drawing" as const,
          topic_id: d?.topic_id ?? "",
          code_family: d?.code_family ?? ("IPC" as const),
          edition: d?.edition ?? "2021",
          reviewer_id: r.reviewer_id as string,
          reviewer_name: rev?.display_name ?? "Reviewer",
          license_no: r.license_no as string,
          reviewed_at: r.reviewed_at as string,
          scores: (r.scores as RubricScores) ?? DEFAULT_RUBRIC_SCORES,
          calc_independently_verified: Boolean(r.calc_independently_verified),
          verdict,
          db_verdict: r.verdict as ReviewRecord["db_verdict"],
          resulting_status: mapDbVerdictToStatus(r.verdict as string),
          comments: (r.comments as string | null) ?? "",
          suggested_fix: (r.suggested_fix as string | null) ?? "",
        };
      }),
    ].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at));

    return {
      questions,
      drawingExercises,
      reviews,
      reviewers: reviewerList,
      currentUserId: ctx.userId,
      currentUserName: ctx.userName,
      currentRole: ctx.role,
      canManageRoles: ctx.role === "admin",
      source: "supabase",
    };
  }

  const store = getMemoryStore();
  return {
    questions: store.questions,
    drawingExercises: store.drawingExercises,
    reviews: store.reviews,
    reviewers: store.reviewers,
    currentUserId: ctx.userId,
    currentUserName: ctx.userName,
    currentRole: ctx.role,
    canManageRoles: ctx.role === "admin",
    source: "memory_preview",
  };
}

export async function submitReviewVerdict(
  rawInput: unknown
): Promise<{
  review: ReviewRecord;
  updatedItem: ReviewableQuestion | ReviewableDrawingExercise;
}> {
  const ctx = await resolveStaffContext();
  const payloadWithActor =
    typeof rawInput === "object" && rawInput !== null
      ? {
          ...rawInput,
          reviewerId: ctx.userId,
          reviewerName:
            (rawInput as { reviewerName?: string }).reviewerName ||
            ctx.userName,
        }
      : rawInput;

  const validated = validateReviewSubmission(payloadWithActor);
  if (!validated.ok) {
    throw new ReviewValidationError(validated.errors);
  }
  const input: ReviewSubmissionInput = validated.data;

  if (ctx.supabase) {
    if (input.itemKind === "question") {
      const { data: qRow, error: qErr } = await ctx.supabase
        .from("questions")
        .select("*")
        .eq("id", input.itemId)
        .single();
      if (qErr || !qRow) {
        throw new ReviewValidationError([`Question "${input.itemId}" not found.`]);
      }

      const target: ReviewableQuestion = {
        id: qRow.id as string,
        topic_id: qRow.topic_id as string,
        stem: qRow.stem as string,
        type: qRow.type as ReviewableQuestion["type"],
        options: (qRow.options as string[]) ?? [],
        correct_index: Number(qRow.correct_index ?? 0),
        difficulty: Number(qRow.difficulty ?? 3),
        code_family: qRow.code_family as CodeFamily,
        edition: qRow.edition as string,
        code_ref: qRow.code_ref as string,
        explanation_seed: qRow.explanation_seed as string,
        status: qRow.status as ReviewItemStatus,
        version: Number(qRow.version ?? 1),
        reviewer_id: (qRow.reviewer_id as string | null) ?? null,
        reviewed_at: (qRow.reviewed_at as string | null) ?? null,
        reviewer_license_no: null,
        latest_review_comments: null,
        latest_suggested_fix: null,
      };

      const { updatedQuestion, review } = applyReviewToQuestion(target, {
        ...input,
        itemVersion: target.version,
        itemType: target.type,
      });

      const { error: revErr } = await ctx.supabase
        .from("question_reviews")
        .insert({
          id: review.id,
          question_id: target.id,
          question_version: target.version,
          reviewer_id: ctx.userId,
          license_no: review.license_no,
          reviewed_at: review.reviewed_at,
          scores: review.scores,
          calc_independently_verified: review.calc_independently_verified,
          verdict: review.db_verdict,
          comments: review.comments || null,
          suggested_fix: review.suggested_fix || null,
        });
      if (revErr) throw new ReviewValidationError([revErr.message]);

      const { error: upErr } = await ctx.supabase
        .from("questions")
        .update({
          status: updatedQuestion.status,
          reviewer_id: updatedQuestion.reviewer_id,
          reviewed_at: updatedQuestion.reviewed_at,
        })
        .eq("id", target.id);
      if (upErr) throw new ReviewValidationError([upErr.message]);

      return { review, updatedItem: updatedQuestion };
    } else {
      const { data: exRow, error: exErr } = await ctx.supabase
        .from("drawing_exercises")
        .select("*")
        .eq("id", input.itemId)
        .single();
      if (exErr || !exRow) {
        throw new ReviewValidationError([
          `Drawing exercise "${input.itemId}" not found.`,
        ]);
      }

      const target: ReviewableDrawingExercise = {
        id: exRow.id as string,
        jurisdiction_id: exRow.jurisdiction_id as string,
        topic_id:
          (exRow.topic_id as string | null) ??
          "22222222-2222-4222-8222-222222222210",
        title: exRow.title as string,
        prompt_md: exRow.prompt_md as string,
        fixtures: (exRow.fixtures as DrawNode[]) ?? [],
        pipe_system: exRow.pipe_system as PipeSystem,
        constraints: (exRow.constraints as Record<string, unknown>) ?? {},
        scoring_rubric: (exRow.scoring_rubric as Record<string, number>) ?? {},
        code_family: exRow.code_family as CodeFamily,
        edition: exRow.edition as string,
        status: exRow.status as ReviewItemStatus,
        version: Number(exRow.version ?? 1),
        reviewer_id: (exRow.reviewer_id as string | null) ?? null,
        reviewed_at: (exRow.reviewed_at as string | null) ?? null,
        reviewer_license_no: null,
        latest_review_comments: null,
        latest_suggested_fix: null,
      };

      const { updatedExercise, review } = applyReviewToDrawingExercise(
        target,
        {
          ...input,
          itemVersion: target.version,
          itemType: "drawing",
        }
      );

      const { error: revErr } = await ctx.supabase
        .from("drawing_exercise_reviews")
        .insert({
          id: review.id,
          exercise_id: target.id,
          exercise_version: target.version,
          reviewer_id: ctx.userId,
          license_no: review.license_no,
          reviewed_at: review.reviewed_at,
          scores: review.scores,
          calc_independently_verified: review.calc_independently_verified,
          verdict: review.db_verdict,
          comments: review.comments || null,
          suggested_fix: review.suggested_fix || null,
        });
      if (revErr) throw new ReviewValidationError([revErr.message]);

      const { error: upErr } = await ctx.supabase
        .from("drawing_exercises")
        .update({
          status: updatedExercise.status,
          reviewer_id: updatedExercise.reviewer_id,
          reviewed_at: updatedExercise.reviewed_at,
        })
        .eq("id", target.id);
      if (upErr) throw new ReviewValidationError([upErr.message]);

      return { review, updatedItem: updatedExercise };
    }
  }

  // Memory store path
  const store = getMemoryStore();
  if (input.itemKind === "question") {
    const idx = store.questions.findIndex((q) => q.id === input.itemId);
    if (idx < 0) {
      throw new ReviewValidationError([`Question "${input.itemId}" not found.`]);
    }
    const existing = store.questions[idx];
    const { updatedQuestion, review } = applyReviewToQuestion(existing, {
      ...input,
      itemVersion: existing.version,
      itemType: existing.type,
    });
    store.questions[idx] = updatedQuestion;
    store.reviews = [review, ...store.reviews];
    return { review, updatedItem: updatedQuestion };
  }

  const idx = store.drawingExercises.findIndex((d) => d.id === input.itemId);
  if (idx < 0) {
    throw new ReviewValidationError([
      `Drawing exercise "${input.itemId}" not found.`,
    ]);
  }
  const existing = store.drawingExercises[idx];
  const { updatedExercise, review } = applyReviewToDrawingExercise(existing, {
    ...input,
    itemVersion: existing.version,
    itemType: "drawing",
  });
  store.drawingExercises[idx] = updatedExercise;
  store.reviews = [review, ...store.reviews];
  return { review, updatedItem: updatedExercise };
}

export async function publishNewVersionForItem(params: {
  itemKind: "question" | "drawing_exercise";
  itemId: string;
  titleOrStem?: string;
  explanationOrPrompt?: string;
}): Promise<ReviewableQuestion | ReviewableDrawingExercise> {
  const ctx = await resolveStaffContext();

  if (ctx.supabase) {
    if (params.itemKind === "question") {
      const { data: q } = await ctx.supabase
        .from("questions")
        .select("*")
        .eq("id", params.itemId)
        .single();
      if (!q) throw new ReviewValidationError(["Question not found."]);
      const nextVersion = Number(q.version ?? 1) + 1;
      const { data: updated, error } = await ctx.supabase
        .from("questions")
        .update({
          version: nextVersion,
          stem: params.titleOrStem?.trim() || q.stem,
          explanation_seed:
            params.explanationOrPrompt?.trim() || q.explanation_seed,
        })
        .eq("id", params.itemId)
        .select("*")
        .single();
      if (error || !updated) {
        throw new ReviewValidationError([
          error?.message ?? "Failed to increment version.",
        ]);
      }
      return {
        ...(updated as ReviewableQuestion),
        reviewer_license_no: null,
        latest_review_comments: null,
        latest_suggested_fix: null,
      };
    } else {
      const { data: ex } = await ctx.supabase
        .from("drawing_exercises")
        .select("*")
        .eq("id", params.itemId)
        .single();
      if (!ex) throw new ReviewValidationError(["Drawing exercise not found."]);
      const nextVersion = Number(ex.version ?? 1) + 1;
      const { data: updated, error } = await ctx.supabase
        .from("drawing_exercises")
        .update({
          version: nextVersion,
          title: params.titleOrStem?.trim() || ex.title,
          prompt_md: params.explanationOrPrompt?.trim() || ex.prompt_md,
        })
        .eq("id", params.itemId)
        .select("*")
        .single();
      if (error || !updated) {
        throw new ReviewValidationError([
          error?.message ?? "Failed to increment version.",
        ]);
      }
      return {
        ...(updated as ReviewableDrawingExercise),
        reviewer_license_no: null,
        latest_review_comments: null,
        latest_suggested_fix: null,
      };
    }
  }

  const store = getMemoryStore();
  if (params.itemKind === "question") {
    const idx = store.questions.findIndex((q) => q.id === params.itemId);
    if (idx < 0) throw new ReviewValidationError(["Question not found."]);
    const updated = createNewQuestionVersion(store.questions[idx], {
      ...(params.titleOrStem?.trim()
        ? { stem: params.titleOrStem.trim() }
        : {}),
      ...(params.explanationOrPrompt?.trim()
        ? { explanation_seed: params.explanationOrPrompt.trim() }
        : {}),
    });
    store.questions[idx] = updated;
    return updated;
  }

  const idx = store.drawingExercises.findIndex((d) => d.id === params.itemId);
  if (idx < 0) {
    throw new ReviewValidationError(["Drawing exercise not found."]);
  }
  const updated = createNewDrawingExerciseVersion(store.drawingExercises[idx], {
    ...(params.titleOrStem?.trim()
      ? { title: params.titleOrStem.trim() }
      : {}),
    ...(params.explanationOrPrompt?.trim()
      ? { prompt_md: params.explanationOrPrompt.trim() }
      : {}),
  });
  store.drawingExercises[idx] = updated;
  return updated;
}

export async function updateReviewerRoleByAdmin(params: {
  targetUserId: string;
  role: UserRole;
  licenseNo?: string | null;
}): Promise<ReviewerRoleRecord> {
  const ctx = await resolveStaffContext();
  if (ctx.role !== "admin") {
    throw new ReviewPermissionError(
      "Only administrators may manage reviewer roles.",
      403
    );
  }

  if (ctx.supabase) {
    const { data, error } = await ctx.supabase.rpc("admin_set_user_role", {
      p_target_user_id: params.targetUserId,
      p_role: params.role,
      p_license_no: params.licenseNo ?? null,
    });
    if (error || !data) {
      throw new ReviewValidationError([
        error?.message ?? "Role update failed.",
      ]);
    }
    const row = data as {
      id: string;
      display_name: string | null;
      role: UserRole;
      license_no: string | null;
      updated_at: string;
    };
    return {
      id: row.id,
      display_name: row.display_name ?? "Reviewer",
      email: "",
      role: row.role,
      license_no: row.license_no,
      updated_at: row.updated_at,
    };
  }

  const store = getMemoryStore();
  const idx = store.reviewers.findIndex((r) => r.id === params.targetUserId);
  if (idx < 0) {
    throw new ReviewValidationError(["Target user profile not found."]);
  }

  const nextLicense =
    params.licenseNo !== undefined
      ? params.licenseNo && params.licenseNo.trim().length > 0
        ? params.licenseNo.trim()
        : null
      : store.reviewers[idx].license_no;

  const updated: ReviewerRoleRecord = {
    ...store.reviewers[idx],
    role: params.role,
    license_no: nextLicense,
    updated_at: new Date().toISOString(),
  };
  store.reviewers[idx] = updated;
  return updated;
}
