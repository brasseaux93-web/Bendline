const globalForOutboxIdempotency = globalThis as unknown as {
  __bendlineProcessedAttemptIds?: Set<string>;
  __bendlineProcessedDraftKeys?: Set<string>;
};

export function getProcessedAttemptIdSet(): Set<string> {
  if (!globalForOutboxIdempotency.__bendlineProcessedAttemptIds) {
    globalForOutboxIdempotency.__bendlineProcessedAttemptIds = new Set<string>();
  }
  return globalForOutboxIdempotency.__bendlineProcessedAttemptIds;
}

export function getProcessedDraftKeySet(): Set<string> {
  if (!globalForOutboxIdempotency.__bendlineProcessedDraftKeys) {
    globalForOutboxIdempotency.__bendlineProcessedDraftKeys = new Set<string>();
  }
  return globalForOutboxIdempotency.__bendlineProcessedDraftKeys;
}
