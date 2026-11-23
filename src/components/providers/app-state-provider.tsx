"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig } from "motion/react";
import {
  resolveEntitlement,
  type ServerEntitlement,
} from "@/lib/billing/entitlements";
import {
  SEED_BLUEPRINTS,
  SEED_DRAWING_EXERCISES,
  SEED_DRILL_QUESTIONS,
  SEED_JURISDICTIONS,
  SEED_TOPICS,
} from "@/lib/domain/seed-catalog";
import type {
  AiErrorType,
  AttemptRecord,
  BlueprintWeight,
  DrawingExerciseSummary,
  DrawingSubmissionSummary,
  ErrorReportRecord,
  Jurisdiction,
  MockSessionRecord,
  PlanTier,
  PracticeMode,
  PracticeSessionAnswer,
  PracticeSessionRecord,
  Profile,
  ServableQuestion,
  SrsStateRecord,
  Topic,
} from "@/lib/domain/types";
import {
  SEED_OUTLINE_NODES,
  outlineNodeSchema,
  type NavAttemptRecord,
  type OutlineNodeRecord,
} from "@/lib/nav";
import { getOfflineDb } from "@/lib/offline/db";
import {
  OUTBOX_UPDATED_EVENT,
  clearCachedSession,
  getPendingOutboxCount,
  loadCachedSession,
  loadQuestionPack,
  replayPendingOutbox,
  rollbackAttemptAndOutbox,
  saveCachedSession,
  saveQuestionPack,
  writeAttemptAndEnqueueOutbox,
  type ReplayOutboxResult,
} from "@/lib/offline/outbox";
import { inferAttemptErrorType } from "@/lib/progress/analytics";
import {
  checkFreeTierAllowance,
  computeSm2Update,
  filterServableQuestionsForJurisdiction,
  selectAdaptiveQuestions,
} from "@/lib/srs";
import {
  createBrowserSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

export type AuthMode = "logged_out" | "authenticated";

export interface RecordAttemptOutcome {
  ok: boolean;
  capReached: boolean;
  attemptId?: string;
  message?: string;
  srsState?: SrsStateRecord;
}

interface AppStateContextValue {
  isHydrated: boolean;
  isSupabaseReady: boolean;
  isOnline: boolean;
  pendingOutboxCount: number;
  lastSyncedAt: string | null;
  questionPackSyncedAt: string | null;
  entitlement: ServerEntitlement;
  authMode: AuthMode;
  userEmail: string | null;
  planTier: PlanTier;
  profile: Profile;
  jurisdictions: Jurisdiction[];
  activeJurisdiction: Jurisdiction;
  topics: Topic[];
  blueprints: BlueprintWeight[];
  questions: ServableQuestion[];
  servableQuestionsForJurisdiction: ServableQuestion[];
  drawingExercises: DrawingExerciseSummary[];
  drawingSubmissions: DrawingSubmissionSummary[];
  outlineNodes: OutlineNodeRecord[];
  navAttempts: NavAttemptRecord[];
  attempts: AttemptRecord[];
  srsStates: SrsStateRecord[];
  mockSessions: MockSessionRecord[];
  practiceSessions: PracticeSessionRecord[];
  reduceMotion: boolean;
  freeTierRemaining: number;
  freeTierUsedToday: number;
  flushOutbox: () => Promise<ReplayOutboxResult | null>;
  syncQuestionPack: (jurisdiction?: Jurisdiction) => Promise<void>;
  refreshEntitlement: () => Promise<ServerEntitlement | null>;
  exportAccountData: () => Promise<Record<string, unknown>>;
  deleteAccount: (
    confirmation: "DELETE"
  ) => Promise<{ ok: boolean; message?: string }>;
  toggleReduceMotion: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ ok: boolean; message: string }>;
  signInWithOAuth: (provider: "google" | "apple") => Promise<{ ok: boolean; message: string }>;
  enterLocalPreview: (email?: string, skipOnboarding?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  submitStateWaitlist: (input: {
    email: string;
    state: string;
  }) => Promise<{ ok: boolean; message: string }>;
  completeOnboarding: (input: {
    jurisdictionId: string;
    examDate?: string;
  }) => Promise<void>;
  selectJurisdiction: (jurisdictionId: string) => Promise<void>;
  updateExamDate: (examDate: string | null) => Promise<void>;
  recordNavAttempt: (
    attempt: NavAttemptRecord
  ) => Promise<{ ok: boolean; message?: string }>;
  saveCustomOutlineNode: (node: OutlineNodeRecord) => Promise<void>;
  recordAttempt: (input: {
    questionId: string;
    topicId: string;
    selectedIndex?: number;
    isCorrect: boolean;
    timeMs?: number;
    mode?: AttemptRecord["mode"];
    errorType?: AiErrorType | null;
  }) => Promise<RecordAttemptOutcome>;
  updateAttemptErrorType: (
    attemptId: string,
    errorType: AiErrorType
  ) => Promise<void>;
  recordDrawingSubmission: (submission: DrawingSubmissionSummary) => Promise<void>;
  startOrResumePracticeSession: (input: {
    mode: PracticeMode;
    topicId?: string | null;
    errorType?: AiErrorType | null;
    forceRestart?: boolean;
  }) => Promise<{ session: PracticeSessionRecord | null; resumed: boolean }>;
  savePracticeSessionProgress: (
    sessionId: string,
    patch: {
      current_index?: number;
      answers?: PracticeSessionAnswer[];
      flagged_question_ids?: string[];
      elapsed_ms?: number;
      status?: PracticeSessionRecord["status"];
    }
  ) => Promise<void>;
  submitErrorReport: (input: {
    questionId: string;
    category: ErrorReportRecord["category"];
    description: string;
  }) => Promise<{ ok: boolean; message: string }>;
  completeSrsReview: (questionId: string) => Promise<void>;
  recordMockCompletion: (input: {
    session: MockSessionRecord;
    gradedAttempts: AttemptRecord[];
  }) => Promise<void>;
  resetLocalSessionData: () => Promise<void>;
}

const DEFAULT_PROFILE_ID = "local-journeyman-profile";
const STORAGE_AUTH_KEY = "bendline_auth_preview_v1";

function createInitialProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: DEFAULT_PROFILE_ID,
    role: "user",
    display_name: "Journeyman Candidate",
    target_jurisdiction_id: SEED_JURISDICTIONS[0].id,
    exam_date: null,
    onboarding_completed_at: null,
    reduce_motion: false,
    ...overrides,
  };
}

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [questionPackSyncedAt, setQuestionPackSyncedAt] = useState<string | null>(
    null
  );
  const [entitlement, setEntitlement] = useState<ServerEntitlement>(() =>
    resolveEntitlement(null)
  );
  const [authMode, setAuthMode] = useState<AuthMode>("logged_out");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [planTier, setPlanTier] = useState<PlanTier>("free");
  const [profile, setProfile] = useState<Profile>(() => createInitialProfile());
  const lastPackJurRef = useRef<string | null>(null);
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>(
    SEED_JURISDICTIONS
  );
  const [topics, setTopics] = useState<Topic[]>(SEED_TOPICS);
  const [blueprints] = useState<BlueprintWeight[]>(SEED_BLUEPRINTS);
  const [questions, setQuestions] = useState<ServableQuestion[]>(
    SEED_DRILL_QUESTIONS
  );
  const [drawingExercises, setDrawingExercises] = useState<
    DrawingExerciseSummary[]
  >(SEED_DRAWING_EXERCISES);
  const [drawingSubmissions, setDrawingSubmissions] = useState<
    DrawingSubmissionSummary[]
  >([]);
  const [outlineNodes, setOutlineNodes] =
    useState<OutlineNodeRecord[]>(SEED_OUTLINE_NODES);
  const [navAttempts, setNavAttempts] = useState<NavAttemptRecord[]>([]);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [srsStates, setSrsStates] = useState<SrsStateRecord[]>([]);
  const [mockSessions, setMockSessions] = useState<MockSessionRecord[]>([]);
  const [practiceSessions, setPracticeSessions] = useState<
    PracticeSessionRecord[]
  >([]);

  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(
      profile.reduce_motion
    );
  }, [profile.reduce_motion]);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const db = getOfflineDb();
      const supabase = createBrowserSupabaseClient();
      let hydratedJurisdictionId = SEED_JURISDICTIONS[0].id;

      if (typeof window !== "undefined") {
        setIsOnline(navigator.onLine);
      }

      if (db) {
        try {
          const [
            cachedSession,
            cachedProfiles,
            cachedAttempts,
            cachedSrs,
            cachedMocks,
            cachedPractice,
            cachedOutlineNodes,
            cachedNavAttempts,
            cachedDrawingSubs,
            outboxPendingCount,
          ] = await Promise.all([
            loadCachedSession(db),
            db.profiles.toArray(),
            db.attempts.toArray(),
            db.srsState.toArray(),
            db.mockSessions.toArray(),
            db.practiceSessions.toArray(),
            db.outlineNodes.toArray(),
            db.navAttempts.toArray(),
            db.drawingSubmissions.toArray(),
            getPendingOutboxCount(db),
          ]);

          if (active) {
            if (cachedSession && cachedSession.authMode === "authenticated") {
              setAuthMode("authenticated");
              setUserEmail(cachedSession.userEmail);
              setProfile(cachedSession.profile);
              setPlanTier(cachedSession.planTier);
              if (cachedSession.entitlement) {
                setEntitlement(cachedSession.entitlement);
              }
              hydratedJurisdictionId =
                cachedSession.profile.target_jurisdiction_id ??
                hydratedJurisdictionId;
            } else if (cachedProfiles[0]) {
              setProfile(cachedProfiles[0]);
              hydratedJurisdictionId =
                cachedProfiles[0].target_jurisdiction_id ??
                hydratedJurisdictionId;
            }
            setPendingOutboxCount(outboxPendingCount);
            if (cachedAttempts.length > 0) setAttempts(cachedAttempts);
            if (cachedSrs.length > 0) setSrsStates(cachedSrs);
            if (cachedMocks.length > 0) setMockSessions(cachedMocks);
            if (cachedPractice.length > 0) setPracticeSessions(cachedPractice);
            if (cachedDrawingSubs.length > 0) {
              setDrawingSubmissions(
                [...cachedDrawingSubs].sort((a, b) =>
                  b.created_at.localeCompare(a.created_at)
                )
              );
            }
            if (cachedOutlineNodes.length > 0) {
              setOutlineNodes((prev) => {
                const map = new Map(prev.map((n) => [n.id, n]));
                for (const node of cachedOutlineNodes) {
                  map.set(node.id, node);
                }
                return [...map.values()];
              });
            }
            if (cachedNavAttempts.length > 0) {
              setNavAttempts(
                [...cachedNavAttempts].sort((a, b) =>
                  b.completed_at.localeCompare(a.completed_at)
                )
              );
            }

            const cachedPack = await loadQuestionPack(db, hydratedJurisdictionId);
            if (active && cachedPack && cachedPack.questions.length > 0) {
              setQuestionPackSyncedAt(cachedPack.synced_at);
              setQuestions((prev) => {
                const map = new Map(prev.map((q) => [q.id, q]));
                for (const q of cachedPack.questions) {
                  map.set(q.id, q);
                }
                return [...map.values()];
              });
            }
          }
        } catch {
          // IndexedDB may be disabled in strict private contexts
        }
      }

      if (typeof window !== "undefined") {
        const storedAuth = window.localStorage.getItem(STORAGE_AUTH_KEY);
        if (storedAuth) {
          try {
            const parsed = JSON.parse(storedAuth) as {
              authMode?: AuthMode;
              userEmail?: string | null;
            };
            if (active && parsed.authMode === "authenticated") {
              setAuthMode("authenticated");
              setUserEmail(parsed.userEmail ?? "candidate@bendline.local");
            }
          } catch {
            // Ignore malformed local storage
          }
        }
      }

      if (supabase) {
        try {
          const [
            { data: jurRows },
            { data: topicRows },
            { data: outlineRows },
            { data: authData },
          ] = await Promise.all([
            supabase
              .from("jurisdictions")
              .select("*")
              .order("state", { ascending: true }),
            supabase
              .from("topics")
              .select("*")
              .order("display_order", { ascending: true }),
            supabase
              .from("outline_nodes")
              .select("*")
              .order("display_order", { ascending: true }),
            supabase.auth.getUser(),
          ]);

          if (active && jurRows && jurRows.length > 0) {
            setJurisdictions(jurRows as Jurisdiction[]);
          }
          if (active && topicRows && topicRows.length > 0) {
            setTopics(topicRows as Topic[]);
          }
          if (active && outlineRows && outlineRows.length > 0) {
            const parsedNodes: OutlineNodeRecord[] = [];
            for (const row of outlineRows) {
              const check = outlineNodeSchema.safeParse(row);
              if (check.success) parsedNodes.push(check.data);
            }
            if (parsedNodes.length > 0) {
              setOutlineNodes((prev) => {
                const map = new Map(prev.map((n) => [n.id, n]));
                for (const n of parsedNodes) {
                  map.set(n.id, n);
                }
                return [...map.values()];
              });
              if (db) {
                await db.outlineNodes.bulkPut(parsedNodes);
              }
            }
          }

          const user = authData?.user;
          if (active && user) {
            setAuthMode("authenticated");
            setUserEmail(user.email ?? null);

            const [
              { data: remoteProfile },
              { data: remoteSub },
              { data: remoteAttempts },
              { data: remoteSrs },
              { data: remoteMocks },
              { data: remoteQuestions },
              { data: remoteExercises },
              { data: remotePractice },
              { data: remoteNavAttempts },
              { data: remoteDrawingSubs },
            ] = await Promise.all([
              supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .maybeSingle(),
              supabase
                .from("subscriptions")
                .select("plan_tier, status")
                .eq("user_id", user.id)
                .maybeSingle(),
              supabase
                .from("attempts")
                .select(
                  "id, question_id, is_correct, time_ms, mode, error_type, attempted_at, questions(topic_id)"
                )
                .eq("user_id", user.id)
                .order("attempted_at", { ascending: false }),
              supabase
                .from("srs_state")
                .select(
                  "id, question_id, due_at, interval_days, repetitions, ease_factor, lapses, last_reviewed_at"
                )
                .eq("user_id", user.id),
              supabase
                .from("mock_sessions")
                .select("id, jurisdiction_id, status, started_at, score_pct, passed")
                .eq("user_id", user.id)
                .order("started_at", { ascending: false }),
              supabase
                .from("servable_questions")
                .select(
                  "id, stem, type, options, correct_index, topic_id, jurisdiction_id, difficulty, code_family, edition, code_ref, explanation_seed, status, review_verdict, approval_reviewed_at, reviewed_at, reviewer_license_no, version"
                ),
              supabase
                .from("drawing_exercises")
                .select(
                  "id, jurisdiction_id, title, prompt_md, pipe_system, code_family, edition"
                ),
              supabase
                .from("practice_sessions")
                .select("*")
                .eq("user_id", user.id)
                .eq("status", "in_progress")
                .order("updated_at", { ascending: false }),
              supabase
                .from("navigation_attempts")
                .select(
                  "id, jurisdiction_id, outline_node_id, chapter_node_id, drill_type, elapsed_ms, target_time_ms, met_target_time, first_try_correct, attempt_count, completed_at"
                )
                .eq("user_id", user.id)
                .order("completed_at", { ascending: false }),
              supabase
                .from("drawing_submissions")
                .select("id, exercise_id, score, mode, time_ms, created_at")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false }),
            ]);

            if (active && remoteProfile) {
              const mappedProfile: Profile = {
                id: remoteProfile.id,
                role: remoteProfile.role,
                display_name: remoteProfile.display_name,
                target_jurisdiction_id: remoteProfile.target_jurisdiction_id,
                exam_date: remoteProfile.exam_date ?? null,
                onboarding_completed_at:
                  remoteProfile.onboarding_completed_at ?? null,
                reduce_motion: Boolean(remoteProfile.reduce_motion),
              };
              setProfile(mappedProfile);
              if (db) await db.profiles.put(mappedProfile);
            }

            if (active && remoteSub) {
              const isPaidActive = ["active", "trialing"].includes(
                remoteSub.status
              );
              setPlanTier(
                isPaidActive ? (remoteSub.plan_tier as PlanTier) : "free"
              );
            }

            if (active && remoteAttempts && remoteAttempts.length > 0) {
              const normalized: AttemptRecord[] = remoteAttempts.map((row) => {
                const qRel = row.questions as
                  | { topic_id?: string }
                  | { topic_id?: string }[]
                  | null;
                const topicId = Array.isArray(qRel)
                  ? (qRel[0]?.topic_id ?? SEED_TOPICS[0].id)
                  : (qRel?.topic_id ?? SEED_TOPICS[0].id);
                return {
                  id: row.id,
                  question_id: row.question_id,
                  topic_id: topicId,
                  is_correct: row.is_correct,
                  time_ms: row.time_ms,
                  mode: row.mode,
                  error_type: (row.error_type as AiErrorType | null | undefined) ?? null,
                  attempted_at: row.attempted_at,
                };
              });
              setAttempts(normalized);
            }

            if (active && remoteSrs) {
              setSrsStates(remoteSrs as SrsStateRecord[]);
            }
            if (active && remoteMocks) {
              setMockSessions(remoteMocks as MockSessionRecord[]);
            }
            if (active && remoteQuestions && remoteQuestions.length > 0) {
              const normalizedQuestions = (
                remoteQuestions as Array<
                  ServableQuestion & { approval_reviewed_at?: string | null }
                >
              ).map((row) => ({
                ...row,
                reviewed_at: row.approval_reviewed_at ?? row.reviewed_at ?? null,
              }));
              setQuestions(normalizedQuestions);
            }
            if (active && remoteExercises && remoteExercises.length > 0) {
              setDrawingExercises(remoteExercises as DrawingExerciseSummary[]);
            }
            if (active && remotePractice && remotePractice.length > 0) {
              setPracticeSessions(remotePractice as PracticeSessionRecord[]);
            }
            if (active && remoteNavAttempts && remoteNavAttempts.length > 0) {
              setNavAttempts(remoteNavAttempts as NavAttemptRecord[]);
            }
            if (active && remoteDrawingSubs && remoteDrawingSubs.length > 0) {
              setDrawingSubmissions(
                (remoteDrawingSubs as DrawingSubmissionSummary[]).map((s) => ({
                  ...s,
                  score: Number(s.score),
                }))
              );
            }
          }
        } catch {
          // Keep offline/seed state if network fails
        }
      }

      if (active) setIsHydrated(true);
    }

    hydrate();
    return () => {
      active = false;
    };
  }, []);

  const persistProfile = useCallback(async (next: Profile) => {
    setProfile(next);
    const db = getOfflineDb();
    if (db) {
      await db.profiles.put(next);
    }
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase
          .from("profiles")
          .update({
            target_jurisdiction_id: next.target_jurisdiction_id,
            exam_date: next.exam_date,
            onboarding_completed_at: next.onboarding_completed_at,
            reduce_motion: next.reduce_motion,
          })
          .eq("id", data.user.id);
      }
    }
  }, []);

  const toggleReduceMotion = useCallback(async () => {
    await persistProfile({
      ...profile,
      reduce_motion: !profile.reduce_motion,
    });
  }, [persistProfile, profile]);

  const signInWithMagicLink = useCallback(async (email: string) => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      return {
        ok: false,
        message:
          "Supabase environment variables are not configured. Use Local Preview below or add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      };
    }

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=/onboarding`
        : undefined;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return {
      ok: true,
      message: `Magic link sent to ${email}. Open the email on this device to continue.`,
    };
  }, []);

  const signInWithOAuth = useCallback(async (provider: "google" | "apple") => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      return {
        ok: false,
        message:
          "Supabase environment variables are not configured for OAuth redirect. Use Local Preview below or configure Supabase Auth.",
      };
    }

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=/onboarding`
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true, message: `Redirecting to ${provider}...` };
  }, []);

  const enterLocalPreview = useCallback(
    async (email = "journeyman@bendline.local", skipOnboarding = false) => {
      setAuthMode("authenticated");
      setUserEmail(email);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          STORAGE_AUTH_KEY,
          JSON.stringify({ authMode: "authenticated", userEmail: email })
        );
      }

      if (skipOnboarding && !profile.onboarding_completed_at) {
        await persistProfile({
          ...profile,
          target_jurisdiction_id:
            profile.target_jurisdiction_id ?? jurisdictions[0]?.id ?? null,
          onboarding_completed_at: new Date().toISOString(),
        });
      }
    },
    [jurisdictions, persistProfile, profile]
  );

  const signOut = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_AUTH_KEY);
    }
    const db = getOfflineDb();
    if (db) {
      await clearCachedSession(db).catch(() => undefined);
    }
    setAuthMode("logged_out");
    setUserEmail(null);
    setPlanTier("free");
    setEntitlement(resolveEntitlement(null));
  }, []);

  const submitStateWaitlist = useCallback(
    async ({ email, state }: { email: string; state: string }) => {
      const normalizedState = state.trim().toUpperCase();
      const entry = {
        id: crypto.randomUUID(),
        email: email.trim().toLowerCase(),
        state: normalizedState,
        license_level: "journeyman" as const,
        created_at: new Date().toISOString(),
      };

      const db = getOfflineDb();
      if (db) {
        await db.stateWaitlist.put(entry);
      }

      const supabase = createBrowserSupabaseClient();
      if (supabase) {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from("state_waitlist").insert({
          email: entry.email,
          state: entry.state,
          license_level: "journeyman",
          user_id: userData.user?.id ?? null,
        });
        if (error && error.code !== "23505") {
          return { ok: false, message: error.message };
        }
      }

      return {
        ok: true,
        message: `Added ${entry.email} to the ${normalizedState} Journeyman release list.`,
      };
    },
    []
  );

  const activeJurisdiction = useMemo(() => {
    return (
      jurisdictions.find((j) => j.id === profile.target_jurisdiction_id) ??
      jurisdictions[0]
    );
  }, [jurisdictions, profile.target_jurisdiction_id]);

  const servableQuestionsForJurisdiction = useMemo(
    () => filterServableQuestionsForJurisdiction(questions, activeJurisdiction),
    [questions, activeJurisdiction]
  );

  const completeOnboarding = useCallback(
    async ({
      jurisdictionId,
      examDate,
    }: {
      jurisdictionId: string;
      examDate?: string;
    }) => {
      const switchingJurisdiction =
        jurisdictionId !== profile.target_jurisdiction_id;
      await persistProfile({
        ...profile,
        target_jurisdiction_id: jurisdictionId,
        exam_date: examDate && examDate.length > 0 ? examDate : null,
        onboarding_completed_at: new Date().toISOString(),
      });

      if (switchingJurisdiction) {
        setPracticeSessions((prev) =>
          prev.map((s) =>
            s.status === "in_progress" && s.jurisdiction_id !== jurisdictionId
              ? { ...s, status: "abandoned" }
              : s
          )
        );
      }
    },
    [persistProfile, profile]
  );

  const selectJurisdiction = useCallback(
    async (jurisdictionId: string) => {
      const target = jurisdictions.find((j) => j.id === jurisdictionId);
      if (!target) return;
      await persistProfile({
        ...profile,
        target_jurisdiction_id: target.id,
        onboarding_completed_at:
          profile.onboarding_completed_at ?? new Date().toISOString(),
      });
    },
    [jurisdictions, persistProfile, profile]
  );

  const updateExamDate = useCallback(
    async (examDate: string | null) => {
      await persistProfile({
        ...profile,
        exam_date: examDate && examDate.length > 0 ? examDate : null,
      });
    },
    [persistProfile, profile]
  );

  const recordNavAttempt = useCallback(
    async (
      attempt: NavAttemptRecord
    ): Promise<{ ok: boolean; message?: string }> => {
      const targetJur = jurisdictions.find(
        (j) => j.id === attempt.jurisdiction_id
      );
      if (!targetJur || targetJur.open_book !== true) {
        return {
          ok: false,
          message:
            "Navigation trainer is enabled only when jurisdiction open_book is true.",
        };
      }

      setNavAttempts((prev) => [
        attempt,
        ...prev.filter((a) => a.id !== attempt.id),
      ]);

      const db = getOfflineDb();
      if (db) {
        await db.navAttempts.put(attempt);
      }

      const supabase = createBrowserSupabaseClient();
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          await supabase.from("navigation_attempts").insert({
            id: attempt.id,
            user_id: data.user.id,
            jurisdiction_id: attempt.jurisdiction_id,
            outline_node_id: attempt.outline_node_id,
            chapter_node_id: attempt.chapter_node_id,
            drill_type: attempt.drill_type,
            elapsed_ms: attempt.elapsed_ms,
            target_time_ms: attempt.target_time_ms,
            met_target_time: attempt.met_target_time,
            first_try_correct: attempt.first_try_correct,
            attempt_count: attempt.attempt_count,
            completed_at: attempt.completed_at,
          });
        }
      }

      return { ok: true };
    },
    [jurisdictions]
  );

  const saveCustomOutlineNode = useCallback(
    async (node: OutlineNodeRecord) => {
      const parsed = outlineNodeSchema.parse(node);
      setOutlineNodes((prev) => [
        ...prev.filter((n) => n.id !== parsed.id),
        parsed,
      ]);
      const db = getOfflineDb();
      if (db) {
        await db.outlineNodes.put(parsed);
      }
    },
    []
  );

  const refreshEntitlement = useCallback(async (): Promise<ServerEntitlement | null> => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return null;
    }
    try {
      const res = await fetch("/api/billing/entitlement", { cache: "no-store" });
      if (!res.ok) return null;
      const body = (await res.json()) as { entitlement?: ServerEntitlement };
      if (!body.entitlement) return null;
      setEntitlement(body.entitlement);
      setPlanTier(body.entitlement.effectivePlan);
      return body.entitlement;
    } catch {
      return null;
    }
  }, []);

  const syncQuestionPack = useCallback(
    async (targetJurisdiction?: Jurisdiction) => {
      const jur = targetJurisdiction ?? activeJurisdiction;
      const db = getOfflineDb();
      if (!db || !jur) return;

      let packQuestions = filterServableQuestionsForJurisdiction(questions, jur);
      let syncedAt = new Date().toISOString();

      if (typeof navigator === "undefined" || navigator.onLine) {
        try {
          const res = await fetch(
            `/api/offline/question-pack?jurisdictionId=${encodeURIComponent(jur.id)}`,
            { cache: "no-store" }
          );
          if (res.ok) {
            const payload = (await res.json()) as {
              questions?: ServableQuestion[];
              syncedAt?: string;
            };
            if (payload.questions && payload.questions.length > 0) {
              packQuestions = payload.questions;
              syncedAt = payload.syncedAt ?? syncedAt;
              setQuestions((prev) => {
                const map = new Map(prev.map((q) => [q.id, q]));
                for (const q of packQuestions) {
                  map.set(q.id, q);
                }
                return [...map.values()];
              });
            }
          }
        } catch {
          // Offline fallback persists seeded/in-memory pack for jurisdiction
        }
      }

      await saveQuestionPack(db, {
        jurisdiction_id: jur.id,
        code_family: jur.code_family,
        edition: jur.edition,
        questions: packQuestions,
        synced_at: syncedAt,
      });
      setQuestionPackSyncedAt(syncedAt);
    },
    [activeJurisdiction, questions]
  );

  const flushOutbox = useCallback(async (): Promise<ReplayOutboxResult | null> => {
    const db = getOfflineDb();
    if (!db) return null;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const count = await getPendingOutboxCount(db);
      setPendingOutboxCount(count);
      return null;
    }

    const result = await replayPendingOutbox(db);
    setPendingOutboxCount(result.remainingPending);
    if (result.synced > 0) {
      setLastSyncedAt(new Date().toISOString());
    }
    return result;
  }, []);

  // Track online/offline state, outbox events, and trigger reconnect replay
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOnline(true);
      void flushOutbox();
      void refreshEntitlement();
      void syncQuestionPack();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleOutboxUpdate = () => {
      const db = getOfflineDb();
      if (db) {
        void getPendingOutboxCount(db)
          .then(setPendingOutboxCount)
          .catch(() => undefined);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(OUTBOX_UPDATED_EVENT, handleOutboxUpdate);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(OUTBOX_UPDATED_EVENT, handleOutboxUpdate);
    };
  }, [flushOutbox, refreshEntitlement, syncQuestionPack]);

  // Persist session snapshot into Dexie so offline cold starts skip auth wall cleanly
  useEffect(() => {
    if (!isHydrated) return;
    const db = getOfflineDb();
    if (!db) return;

    if (authMode === "authenticated") {
      void saveCachedSession(db, {
        authMode,
        userEmail,
        profile,
        planTier,
        entitlement,
      }).catch(() => undefined);
    } else {
      void clearCachedSession(db).catch(() => undefined);
    }
  }, [authMode, entitlement, isHydrated, planTier, profile, userEmail]);

  // Sync jurisdiction question pack + replay pending outbox when authenticated and online
  useEffect(() => {
    if (!isHydrated || authMode !== "authenticated") return;
    if (lastPackJurRef.current !== activeJurisdiction.id) {
      lastPackJurRef.current = activeJurisdiction.id;
      void syncQuestionPack(activeJurisdiction);
    }
    if (isOnline) {
      void flushOutbox();
      void refreshEntitlement();
    }
  }, [
    activeJurisdiction,
    authMode,
    flushOutbox,
    isHydrated,
    isOnline,
    refreshEntitlement,
    syncQuestionPack,
  ]);

  const recordAttempt = useCallback(
    async ({
      questionId,
      topicId,
      selectedIndex = 0,
      isCorrect,
      timeMs = 4500,
      mode = "practice",
      errorType,
    }: {
      questionId: string;
      topicId: string;
      selectedIndex?: number;
      isCorrect: boolean;
      timeMs?: number;
      mode?: AttemptRecord["mode"];
      errorType?: AiErrorType | null;
    }): Promise<RecordAttemptOutcome> => {
      const nowIso = new Date().toISOString();
      const timeZone = getBrowserTimeZone();

      const localAllowance = checkFreeTierAllowance({
        planTier,
        attempts,
        nowIso,
        timeZone,
      });

      if (!localAllowance.allowed) {
        return {
          ok: false,
          capReached: true,
          message: `Daily free-tier cap reached (${localAllowance.limit} questions/day).`,
        };
      }

      const clientAttemptId = crypto.randomUUID();
      const matchedQ = questions.find((q) => q.id === questionId);
      const resolvedErrorType: AiErrorType | null = isCorrect
        ? null
        : errorType ??
          inferAttemptErrorType(matchedQ ?? { type: "mcq" }, timeMs);

      const attempt: AttemptRecord = {
        id: clientAttemptId,
        question_id: questionId,
        topic_id: topicId,
        is_correct: isCorrect,
        time_ms: timeMs,
        mode,
        error_type: resolvedErrorType,
        attempted_at: nowIso,
      };

      const existingSrs =
        srsStates.find((s) => s.question_id === questionId) ?? null;
      const sm2 = computeSm2Update(existingSrs, {
        isCorrect,
        timeMs,
        reviewedAt: nowIso,
        timeZone,
      });

      const nextSrs: SrsStateRecord = {
        id: existingSrs?.id ?? crypto.randomUUID(),
        question_id: questionId,
        due_at: sm2.due_at,
        interval_days: sm2.interval_days,
        repetitions: sm2.repetitions,
        ease_factor: sm2.ease_factor,
        lapses: sm2.lapses,
        last_reviewed_at: sm2.last_reviewed_at,
      };

      const requestPayload = {
        questionId,
        selectedIndex,
        isCorrect,
        timeMs,
        mode,
        errorType: resolvedErrorType,
        clientAttemptId,
        timeZone,
      };

      // Optimistically update local memory
      setAttempts((prev) => [attempt, ...prev]);
      setSrsStates((prev) => [
        nextSrs,
        ...prev.filter((s) => s.question_id !== questionId),
      ]);

      // Write attempt + SRS state + outbox item atomically inside one Dexie transaction
      const db = getOfflineDb();
      let enqueuedOutboxId: string | null = null;
      if (db) {
        const outboxItem = await writeAttemptAndEnqueueOutbox(db, {
          attempt,
          srsState: nextSrs,
          requestPayload,
          idempotencyKey: clientAttemptId,
        });
        enqueuedOutboxId = outboxItem.id;
        setPendingOutboxCount(await getPendingOutboxCount(db));
      }

      // Attempt immediate sync when online; rollback cleanly if server rejects 429
      if (typeof navigator === "undefined" || navigator.onLine) {
        try {
          const res = await fetch("/api/practice/attempt", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": clientAttemptId,
            },
            body: JSON.stringify(requestPayload),
          });
          if (res.status === 429) {
            setAttempts((prev) => prev.filter((a) => a.id !== clientAttemptId));
            setSrsStates((prev) =>
              existingSrs
                ? [existingSrs, ...prev.filter((s) => s.question_id !== questionId)]
                : prev.filter((s) => s.question_id !== questionId)
            );
            if (db && enqueuedOutboxId) {
              await rollbackAttemptAndOutbox(db, {
                attemptId: clientAttemptId,
                outboxId: enqueuedOutboxId,
                previousSrsState: existingSrs,
                newSrsId: nextSrs.id,
              });
              setPendingOutboxCount(await getPendingOutboxCount(db));
            }
            return {
              ok: false,
              capReached: true,
              message: "Daily free-tier cap reached (12 questions/day).",
            };
          }
          if ((res.ok || res.status === 409) && db && enqueuedOutboxId) {
            await db.outbox.update(enqueuedOutboxId, {
              status: "synced",
              synced_at: new Date().toISOString(),
              last_error: null,
            });
            setPendingOutboxCount(await getPendingOutboxCount(db));
            setLastSyncedAt(new Date().toISOString());
          }
        } catch {
          // Offline fallback: pending outbox entry stays queued in Dexie for reconnect replay
        }
      }

      return {
        ok: true,
        capReached: false,
        attemptId: clientAttemptId,
        srsState: nextSrs,
      };
    },
    [attempts, planTier, questions, srsStates]
  );

  const updateAttemptErrorType = useCallback(
    async (attemptId: string, errorType: AiErrorType) => {
      setAttempts((prev) =>
        prev.map((a) =>
          a.id === attemptId ? { ...a, error_type: errorType } : a
        )
      );
      const db = getOfflineDb();
      if (db) {
        const existing = await db.attempts.get(attemptId);
        if (existing) {
          await db.attempts.put({ ...existing, error_type: errorType });
        }
      }
      try {
        await fetch("/api/practice/attempt", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId, errorType }),
        });
      } catch {
        // Ignore offline; local Dexie record is updated
      }
    },
    []
  );

  const recordDrawingSubmission = useCallback(
    async (submission: DrawingSubmissionSummary) => {
      setDrawingSubmissions((prev) => [
        submission,
        ...prev.filter((s) => s.id !== submission.id),
      ]);
    },
    []
  );

  const startOrResumePracticeSession = useCallback(
    async ({
      mode,
      topicId = null,
      errorType = null,
      forceRestart = false,
    }: {
      mode: PracticeMode;
      topicId?: string | null;
      errorType?: AiErrorType | null;
      forceRestart?: boolean;
    }): Promise<{ session: PracticeSessionRecord | null; resumed: boolean }> => {
      const db = getOfflineDb();
      const supabase = createBrowserSupabaseClient();
      const timeZone = getBrowserTimeZone();
      const nowIso = new Date().toISOString();

      const eligibleIds = new Set(
        servableQuestionsForJurisdiction.map((q) => q.id)
      );

      if (!forceRestart && !errorType) {
        const resumable = practiceSessions.find(
          (s) =>
            s.status === "in_progress" &&
            s.jurisdiction_id === activeJurisdiction.id &&
            s.mode === mode &&
            (mode !== "topic_drill" || s.topic_id === (topicId ?? null)) &&
            s.question_ids.length > 0 &&
            s.current_index < s.question_ids.length &&
            s.question_ids.every((id) => eligibleIds.has(id))
        );

        if (resumable) {
          return { session: resumable, resumed: true };
        }
      }

      // Mark older in-progress sessions for same mode/jurisdiction as abandoned
      if (forceRestart || errorType) {
        setPracticeSessions((prev) =>
          prev.map((s) =>
            s.status === "in_progress" &&
            s.jurisdiction_id === activeJurisdiction.id &&
            s.mode === mode
              ? { ...s, status: "abandoned", updated_at: nowIso }
              : s
          )
        );
      }

      const scheduled = selectAdaptiveQuestions({
        mode,
        jurisdiction: activeJurisdiction,
        topics,
        questions,
        attempts,
        srsStates,
        blueprints,
        topicId,
        errorTypeFilter: errorType,
        count: mode === "daily_12" ? 12 : 10,
        nowIso,
        timeZone,
      });

      if (scheduled.length === 0) {
        return { session: null, resumed: false };
      }

      const newSession: PracticeSessionRecord = {
        id: crypto.randomUUID(),
        jurisdiction_id: activeJurisdiction.id,
        mode,
        topic_id: topicId ?? null,
        question_ids: scheduled.map((s) => s.question.id),
        current_index: 0,
        answers: [],
        flagged_question_ids: [],
        elapsed_ms: 0,
        status: "in_progress",
        started_at: nowIso,
        updated_at: nowIso,
      };

      setPracticeSessions((prev) => [newSession, ...prev]);

      if (db) {
        await db.practiceSessions.put(newSession);
      }

      if (supabase) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          await supabase.from("practice_sessions").insert({
            id: newSession.id,
            user_id: userData.user.id,
            jurisdiction_id: newSession.jurisdiction_id,
            mode: newSession.mode,
            topic_id: newSession.topic_id,
            question_ids: newSession.question_ids,
            current_index: 0,
            answers: [],
            flagged_question_ids: [],
            elapsed_ms: 0,
            status: "in_progress",
          });
        }
      }

      return { session: newSession, resumed: false };
    },
    [
      activeJurisdiction,
      attempts,
      blueprints,
      practiceSessions,
      questions,
      servableQuestionsForJurisdiction,
      srsStates,
      topics,
    ]
  );

  const savePracticeSessionProgress = useCallback(
    async (
      sessionId: string,
      patch: {
        current_index?: number;
        answers?: PracticeSessionAnswer[];
        flagged_question_ids?: string[];
        elapsed_ms?: number;
        status?: PracticeSessionRecord["status"];
      }
    ) => {
      const nowIso = new Date().toISOString();
      let updatedRecord: PracticeSessionRecord | null = null;

      setPracticeSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          updatedRecord = {
            ...s,
            ...patch,
            updated_at: nowIso,
          };
          return updatedRecord;
        })
      );

      const db = getOfflineDb();
      if (db) {
        const existing = await db.practiceSessions.get(sessionId);
        if (existing) {
          await db.practiceSessions.put({
            ...existing,
            ...patch,
            updated_at: nowIso,
          });
        }
      }

      const supabase = createBrowserSupabaseClient();
      if (supabase) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          await supabase
            .from("practice_sessions")
            .update({
              ...patch,
              completed_at: patch.status === "completed" ? nowIso : null,
            })
            .eq("id", sessionId)
            .eq("user_id", userData.user.id);
        }
      }
    },
    []
  );

  const submitErrorReport = useCallback(
    async ({
      questionId,
      category,
      description,
    }: {
      questionId: string;
      category: ErrorReportRecord["category"];
      description: string;
    }) => {
      const report: ErrorReportRecord = {
        id: crypto.randomUUID(),
        question_id: questionId,
        category,
        description: description.trim(),
        created_at: new Date().toISOString(),
      };

      const db = getOfflineDb();
      if (db) {
        await db.errorReports.put(report);
      }

      const supabase = createBrowserSupabaseClient();
      if (supabase) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const { error } = await supabase.from("error_reports").insert({
            user_id: userData.user.id,
            question_id: questionId,
            jurisdiction_id: activeJurisdiction.id,
            category,
            description: report.description,
          });
          if (error) {
            return { ok: false, message: error.message };
          }
        }
      }

      return {
        ok: true,
        message: "Error report submitted for licensed reviewer inspection.",
      };
    },
    [activeJurisdiction.id]
  );

  const completeSrsReview = useCallback(
    async (questionId: string) => {
      const nowIso = new Date().toISOString();
      const timeZone = getBrowserTimeZone();
      const existing =
        srsStates.find((item) => item.question_id === questionId) ?? null;
      const sm2 = computeSm2Update(existing, {
        isCorrect: true,
        quality: 4,
        reviewedAt: nowIso,
        timeZone,
      });

      setSrsStates((prev) =>
        prev.map((item) =>
          item.question_id === questionId
            ? {
                ...item,
                due_at: sm2.due_at,
                interval_days: sm2.interval_days,
                repetitions: sm2.repetitions,
                ease_factor: sm2.ease_factor,
                lapses: sm2.lapses,
                last_reviewed_at: sm2.last_reviewed_at,
              }
            : item
        )
      );

      const db = getOfflineDb();
      if (db) {
        const row = await db.srsState
          .where("question_id")
          .equals(questionId)
          .first();
        if (row) {
          await db.srsState.put({
            ...row,
            ...sm2,
          });
        }
      }
    },
    [srsStates]
  );

  const recordMockCompletion = useCallback(
    async ({
      session,
      gradedAttempts,
    }: {
      session: MockSessionRecord;
      gradedAttempts: AttemptRecord[];
    }) => {
      setMockSessions((prev) => [
        session,
        ...prev.filter((s) => s.id !== session.id),
      ]);
      if (gradedAttempts.length > 0) {
        setAttempts((prev) => [...gradedAttempts, ...prev]);
      }

      const db = getOfflineDb();
      if (db) {
        await db.mockSessions.put(session);
        if (gradedAttempts.length > 0) {
          await db.attempts.bulkPut(gradedAttempts);
        }
      }
    },
    []
  );

  const resetLocalSessionData = useCallback(async () => {
    setAttempts([]);
    setSrsStates([]);
    setMockSessions([]);
    setPracticeSessions([]);
    setNavAttempts([]);
    setDrawingSubmissions([]);
    setPendingOutboxCount(0);
    const db = getOfflineDb();
    if (db) {
      await Promise.all([
        db.attempts.clear(),
        db.srsState.clear(),
        db.mockSessions.clear(),
        db.practiceSessions.clear(),
        db.mockDrafts.clear(),
        db.drawingDrafts.clear(),
        db.outbox.clear(),
        db.navAttempts.clear(),
        db.drawingSubmissions.clear(),
      ]);
    }
    try {
      await fetch("/api/practice/attempt", { method: "DELETE" });
    } catch {
      // Ignore offline
    }
  }, []);

  const exportAccountData = useCallback(async (): Promise<
    Record<string, unknown>
  > => {
    const db = getOfflineDb();
    let localBundle: Record<string, unknown> = {
      profile,
      planTier,
      entitlement,
      attempts,
      srsStates,
      mockSessions,
      practiceSessions,
      drawingSubmissions,
      navAttempts,
    };

    if (db) {
      const [drawingDrafts, outboxItems, questionPacks] = await Promise.all([
        db.drawingDrafts.toArray(),
        db.outbox.toArray(),
        db.questionPacks.toArray(),
      ]);
      localBundle = {
        ...localBundle,
        drawingDrafts,
        outboxItems,
        questionPacks: questionPacks.map((p) => ({
          jurisdiction_id: p.jurisdiction_id,
          code_family: p.code_family,
          edition: p.edition,
          question_count: p.questions.length,
          synced_at: p.synced_at,
        })),
      };
    }

    let serverBundle: Record<string, unknown> | null = null;
    try {
      const res = await fetch("/api/account/export", { cache: "no-store" });
      if (res.ok) {
        serverBundle = (await res.json()) as Record<string, unknown>;
      }
    } catch {
      // Offline export still delivers complete Dexie archive
    }

    return {
      schemaVersion: "bendline.export.v1",
      exportedAt: new Date().toISOString(),
      disclaimer:
        "Not affiliated with any code body, exam vendor, or state board.",
      userEmail,
      local: localBundle,
      server: serverBundle,
    };
  }, [
    attempts,
    drawingSubmissions,
    entitlement,
    mockSessions,
    navAttempts,
    planTier,
    practiceSessions,
    profile,
    srsStates,
    userEmail,
  ]);

  const deleteAccount = useCallback(
    async (
      confirmation: "DELETE"
    ): Promise<{ ok: boolean; message?: string }> => {
      if (confirmation !== "DELETE") {
        return {
          ok: false,
          message: 'Type "DELETE" to confirm account deletion.',
        };
      }

      try {
        const res = await fetch("/api/account", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation }),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          return {
            ok: false,
            message: errBody.message ?? "Server account deletion failed.",
          };
        }
      } catch {
        return {
          ok: false,
          message:
            "Account deletion requires an internet connection to remove server records.",
        };
      }

      const db = getOfflineDb();
      if (db) {
        await Promise.all([
          db.profiles.clear(),
          db.attempts.clear(),
          db.srsState.clear(),
          db.mockSessions.clear(),
          db.stateWaitlist.clear(),
          db.practiceSessions.clear(),
          db.errorReports.clear(),
          db.mockDrafts.clear(),
          db.drawingDrafts.clear(),
          db.drawingSubmissions.clear(),
          db.navAttempts.clear(),
          db.questionPacks.clear(),
          db.outbox.clear(),
          db.cachedSession.clear(),
        ]);
      }

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_AUTH_KEY);
      }

      setAttempts([]);
      setSrsStates([]);
      setMockSessions([]);
      setPracticeSessions([]);
      setNavAttempts([]);
      setDrawingSubmissions([]);
      setPendingOutboxCount(0);
      setPlanTier("free");
      setEntitlement(resolveEntitlement(null));
      setProfile(createInitialProfile());
      setAuthMode("logged_out");
      setUserEmail(null);

      return { ok: true };
    },
    []
  );

  const allowance = useMemo(
    () =>
      checkFreeTierAllowance({
        planTier,
        attempts,
        nowIso: new Date().toISOString(),
        timeZone: getBrowserTimeZone(),
      }),
    [attempts, planTier]
  );

  const value = useMemo<AppStateContextValue>(
    () => ({
      isHydrated,
      isSupabaseReady: supabaseReady,
      isOnline,
      pendingOutboxCount,
      lastSyncedAt,
      questionPackSyncedAt,
      entitlement,
      authMode,
      userEmail,
      planTier,
      profile,
      jurisdictions,
      activeJurisdiction,
      topics,
      blueprints,
      questions,
      servableQuestionsForJurisdiction,
      drawingExercises,
      drawingSubmissions,
      outlineNodes,
      navAttempts,
      attempts,
      srsStates,
      mockSessions,
      practiceSessions,
      reduceMotion: profile.reduce_motion,
      freeTierRemaining: allowance.remaining,
      freeTierUsedToday: allowance.usedToday,
      flushOutbox,
      syncQuestionPack,
      refreshEntitlement,
      exportAccountData,
      deleteAccount,
      toggleReduceMotion,
      signInWithMagicLink,
      signInWithOAuth,
      enterLocalPreview,
      signOut,
      submitStateWaitlist,
      completeOnboarding,
      selectJurisdiction,
      updateExamDate,
      recordNavAttempt,
      saveCustomOutlineNode,
      recordAttempt,
      updateAttemptErrorType,
      recordDrawingSubmission,
      startOrResumePracticeSession,
      savePracticeSessionProgress,
      submitErrorReport,
      completeSrsReview,
      recordMockCompletion,
      resetLocalSessionData,
    }),
    [
      isHydrated,
      supabaseReady,
      isOnline,
      pendingOutboxCount,
      lastSyncedAt,
      questionPackSyncedAt,
      entitlement,
      authMode,
      userEmail,
      planTier,
      profile,
      jurisdictions,
      activeJurisdiction,
      topics,
      blueprints,
      questions,
      servableQuestionsForJurisdiction,
      drawingExercises,
      drawingSubmissions,
      outlineNodes,
      navAttempts,
      attempts,
      srsStates,
      mockSessions,
      practiceSessions,
      allowance.remaining,
      allowance.usedToday,
      flushOutbox,
      syncQuestionPack,
      refreshEntitlement,
      exportAccountData,
      deleteAccount,
      toggleReduceMotion,
      signInWithMagicLink,
      signInWithOAuth,
      enterLocalPreview,
      signOut,
      submitStateWaitlist,
      completeOnboarding,
      selectJurisdiction,
      updateExamDate,
      recordNavAttempt,
      saveCustomOutlineNode,
      recordAttempt,
      updateAttemptErrorType,
      recordDrawingSubmission,
      startOrResumePracticeSession,
      savePracticeSessionProgress,
      submitErrorReport,
      completeSrsReview,
      recordMockCompletion,
      resetLocalSessionData,
    ]
  );

  return (
    <AppStateContext.Provider value={value}>
      <MotionConfig reducedMotion={profile.reduce_motion ? "always" : "user"}>
        {children}
      </MotionConfig>
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used inside AppStateProvider");
  }
  return ctx;
}
