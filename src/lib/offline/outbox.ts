import type {
  AttemptRecord,
  SrsStateRecord,
} from "@/lib/domain/types";
import type {
  BendlineOfflineDB,
  CachedSessionRecord,
  DrawingDraftRecord,
  OutboxItemRecord,
  QuestionPackRecord,
} from "./db";

export const OUTBOX_UPDATED_EVENT = "bendline:outbox-updated";

export function notifyOutboxUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OUTBOX_UPDATED_EVENT));
  }
}

export async function writeAttemptAndEnqueueOutbox(
  db: BendlineOfflineDB,
  input: {
    attempt: AttemptRecord;
    srsState: SrsStateRecord;
    requestPayload: Record<string, unknown>;
    idempotencyKey?: string;
  }
): Promise<OutboxItemRecord> {
  const idempotencyKey = input.idempotencyKey ?? input.attempt.id;
  const outboxItem: OutboxItemRecord = {
    id: crypto.randomUUID(),
    idempotency_key: idempotencyKey,
    kind: "attempt",
    endpoint: "/api/practice/attempt",
    payload: {
      ...input.requestPayload,
      clientAttemptId: idempotencyKey,
    },
    status: "pending",
    retry_count: 0,
    last_error: null,
    created_at: input.attempt.attempted_at,
    synced_at: null,
  };

  await db.transaction("rw", [db.attempts, db.srsState, db.outbox], async () => {
    await db.attempts.put(input.attempt);
    await db.srsState.put(input.srsState);
    await db.outbox.put(outboxItem);
  });

  notifyOutboxUpdated();
  return outboxItem;
}

export async function rollbackAttemptAndOutbox(
  db: BendlineOfflineDB,
  input: {
    attemptId: string;
    outboxId: string;
    previousSrsState: SrsStateRecord | null;
    newSrsId: string;
  }
): Promise<void> {
  await db.transaction("rw", [db.attempts, db.srsState, db.outbox], async () => {
    await db.attempts.delete(input.attemptId);
    await db.outbox.delete(input.outboxId);
    if (input.previousSrsState) {
      await db.srsState.put(input.previousSrsState);
    } else {
      await db.srsState.delete(input.newSrsId);
    }
  });
  notifyOutboxUpdated();
}

export async function writeDrawingDraftAndEnqueueOutbox(
  db: BendlineOfflineDB,
  draft: Omit<DrawingDraftRecord, "client_draft_id">,
  idempotencyKey: string = crypto.randomUUID()
): Promise<OutboxItemRecord> {
  const draftWithKey: DrawingDraftRecord = {
    ...draft,
    client_draft_id: idempotencyKey,
  };

  const outboxItem: OutboxItemRecord = {
    id: crypto.randomUUID(),
    idempotency_key: idempotencyKey,
    kind: "drawing_draft",
    endpoint: "/api/draw/drafts",
    payload: {
      idempotencyKey,
      draftId: draft.id,
      exerciseId: draft.exercise_id,
      mode: draft.mode,
      graph: draft.graph,
      elapsedMs: draft.elapsed_ms,
      updatedAt: draft.updated_at,
    },
    status: "pending",
    retry_count: 0,
    last_error: null,
    created_at: draft.updated_at,
    synced_at: null,
  };

  await db.transaction("rw", [db.drawingDrafts, db.outbox], async () => {
    await db.drawingDrafts.put(draftWithKey);
    await db.outbox.put(outboxItem);
  });

  notifyOutboxUpdated();
  return outboxItem;
}

export async function getPendingOutboxCount(
  db: BendlineOfflineDB
): Promise<number> {
  return db.outbox.where("status").equals("pending").count();
}

export interface ReplayOutboxResult {
  attempted: number;
  synced: number;
  failed: number;
  remainingPending: number;
}

const activeReplays = new WeakMap<BendlineOfflineDB, Promise<ReplayOutboxResult>>();

export async function replayPendingOutbox(
  db: BendlineOfflineDB,
  fetcher: typeof fetch = fetch
): Promise<ReplayOutboxResult> {
  const existing = activeReplays.get(db);
  if (existing) return existing;

  const runPromise = (async (): Promise<ReplayOutboxResult> => {
    const pending = await db.outbox
      .where("status")
      .equals("pending")
      .sortBy("created_at");

    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        const response = await fetcher(item.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": item.idempotency_key,
          },
          body: JSON.stringify(item.payload),
        });

        if (response.ok || response.status === 409) {
          await db.outbox.update(item.id, {
            status: "synced",
            synced_at: new Date().toISOString(),
            last_error: null,
          });
          synced += 1;
        } else if (response.status >= 400 && response.status < 500) {
          await db.outbox.update(item.id, {
            status: "failed",
            retry_count: item.retry_count + 1,
            last_error: `HTTP_${response.status}`,
          });
          failed += 1;
        } else {
          await db.outbox.update(item.id, {
            retry_count: item.retry_count + 1,
            last_error: `HTTP_${response.status}`,
          });
        }
      } catch (err) {
        await db.outbox.update(item.id, {
          retry_count: item.retry_count + 1,
          last_error: err instanceof Error ? err.message : "NETWORK_ERROR",
        });
      }
    }

    const remainingPending = await getPendingOutboxCount(db);
    notifyOutboxUpdated();

    return {
      attempted: pending.length,
      synced,
      failed,
      remainingPending,
    };
  })();

  activeReplays.set(db, runPromise);
  try {
    return await runPromise;
  } finally {
    activeReplays.delete(db);
  }
}

export async function saveQuestionPack(
  db: BendlineOfflineDB,
  pack: QuestionPackRecord
): Promise<void> {
  await db.questionPacks.put(pack);
}

export async function loadQuestionPack(
  db: BendlineOfflineDB,
  jurisdictionId: string
): Promise<QuestionPackRecord | undefined> {
  return db.questionPacks.get(jurisdictionId);
}

export async function saveCachedSession(
  db: BendlineOfflineDB,
  session: Omit<CachedSessionRecord, "id" | "cachedAt">
): Promise<void> {
  await db.cachedSession.put({
    id: "active",
    ...session,
    cachedAt: new Date().toISOString(),
  });
}

export async function loadCachedSession(
  db: BendlineOfflineDB
): Promise<CachedSessionRecord | undefined> {
  return db.cachedSession.get("active");
}

export async function clearCachedSession(db: BendlineOfflineDB): Promise<void> {
  await db.cachedSession.delete("active");
}
