export interface ForegroundTimerState {
  accumulatedMs: number;
  activeStartedAtMs: number | null;
  isPaused: boolean;
  pauseCount: number;
}

/**
 * Starts a monotonic stopwatch in the foreground.
 */
export function createForegroundTimer(nowMs: number): ForegroundTimerState {
  return {
    accumulatedMs: 0,
    activeStartedAtMs: nowMs,
    isPaused: false,
    pauseCount: 0,
  };
}

/**
 * Bank accumulated foreground time and stop ticking while backgrounded/hidden.
 * Idempotent if called repeatedly while already paused.
 */
export function pauseForBackground(
  state: ForegroundTimerState,
  nowMs: number
): ForegroundTimerState {
  if (state.isPaused || state.activeStartedAtMs === null) {
    return state;
  }

  const delta = Math.max(0, nowMs - state.activeStartedAtMs);
  return {
    accumulatedMs: state.accumulatedMs + delta,
    activeStartedAtMs: null,
    isPaused: true,
    pauseCount: state.pauseCount + 1,
  };
}

/**
 * Resumes ticking when the tab/window returns to the foreground.
 * Backgrounded intervals are completely excluded from elapsed time.
 * Idempotent if already running in the foreground.
 */
export function resumeFromBackground(
  state: ForegroundTimerState,
  nowMs: number
): ForegroundTimerState {
  if (!state.isPaused && state.activeStartedAtMs !== null) {
    return state;
  }

  return {
    accumulatedMs: state.accumulatedMs,
    activeStartedAtMs: nowMs,
    isPaused: false,
    pauseCount: state.pauseCount,
  };
}

/**
 * Returns total foreground-only elapsed milliseconds rounded cleanly.
 */
export function getElapsedForegroundMs(
  state: ForegroundTimerState,
  nowMs: number
): number {
  if (state.isPaused || state.activeStartedAtMs === null) {
    return Math.max(0, Math.round(state.accumulatedMs));
  }
  const activeDelta = Math.max(0, nowMs - state.activeStartedAtMs);
  return Math.max(0, Math.round(state.accumulatedMs + activeDelta));
}

/**
 * Captures the final foreground elapsed time and freezes the stopwatch.
 */
export function completeForegroundTimer(
  state: ForegroundTimerState,
  nowMs: number
): { elapsedMs: number; paused: ForegroundTimerState } {
  const paused = pauseForBackground(state, nowMs);
  return {
    elapsedMs: Math.max(0, Math.round(paused.accumulatedMs)),
    paused,
  };
}
