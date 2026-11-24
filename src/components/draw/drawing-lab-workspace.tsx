"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Lightbulb,
  List,
  Plus,
  Redo2,
  RotateCcw,
  Settings2,
  Trash2,
  Undo2,
  XCircle,
} from "lucide-react";
import { FixtureGlyphIcon } from "@/components/icons/plumbing-icons";
import { useAppState } from "@/components/providers/app-state-provider";
import { generateUuid } from "@/lib/utils";
import {
  type DrawEdge,
  type DrawGraph,
  type DrawPipeSystem,
  type DrawingExerciseConfig,
  type DrawingRuleRow,
  type FittingType,
  type FixtureType,
  type GradeDrawingOutput,
  ISO_AXES,
  type IsoAxis,
  SAMPLE_DRAWING_EXERCISES,
  type Vec3,
  addRun,
  gradeDrawing,
  placeNode,
  removeEdge,
  removeNode,
  updateEdgeLabel,
  updateEdgeSlope,
  validateGraph,
} from "@/lib/draw";
import { MOTION_VARIANTS } from "@/lib/motion";
import { getOfflineDb } from "@/lib/offline/db";
import {
  replayPendingOutbox,
  writeDrawingDraftAndEnqueueOutbox,
} from "@/lib/offline/outbox";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { type ActiveDrawTool, IsoCanvas } from "./iso-canvas";

type DrawMode = "learn" | "practice" | "exam";
type ViewMode = "canvas" | "list";

const MAX_UNDO_HISTORY = 60;

const FIXTURE_OPTIONS: { type: FixtureType; label: string }[] = [
  { type: "wc", label: "WC" },
  { type: "lav", label: "Lav" },
  { type: "sink", label: "Sink" },
  { type: "shower", label: "Shower" },
  { type: "floor_drain", label: "Floor Drain" },
  { type: "water_heater", label: "Water Heater" },
];

const FITTING_OPTIONS: { type: FittingType; label: string }[] = [
  { type: "elbow_90", label: "90° Elbow" },
  { type: "elbow_45", label: "45° Elbow" },
  { type: "tee", label: "Tee" },
  { type: "wye", label: "Wye" },
  { type: "reducer", label: "Reducer" },
  { type: "cleanout", label: "Cleanout" },
  { type: "valve", label: "Valve" },
  { type: "p_trap", label: "P-Trap" },
];

function createSeedGraphFromExercise(ex: DrawingExerciseConfig): DrawGraph {
  return {
    nodes: ex.fixtures.map((f) => ({ ...f, pos: [...f.pos] as Vec3 })),
    edges: [],
  };
}

function formatTimer(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function DrawingLabWorkspace() {
  const { activeJurisdiction, recordDrawingSubmission } = useAppState();

  const [exercises, setExercises] = useState<DrawingExerciseConfig[]>(
    SAMPLE_DRAWING_EXERCISES
  );
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    () =>
      SAMPLE_DRAWING_EXERCISES.find(
        (e) => e.jurisdiction_id === activeJurisdiction.id
      )?.id ?? SAMPLE_DRAWING_EXERCISES[0].id
  );
  const [rules, setRules] = useState<DrawingRuleRow[]>([]);

  const [mode, setMode] = useState<DrawMode>("practice");
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [activeTool, setActiveTool] = useState<ActiveDrawTool>({ kind: "run" });

  // Run tool settings
  const [runAxis, setRunAxis] = useState<IsoAxis>("x");
  const [runLength, setRunLength] = useState<number>(2);
  const [runSize, setRunSize] = useState<number>(2);
  const [runSystem, setRunSystem] = useState<DrawPipeSystem>("dwv");
  const [runSlope, setRunSlope] = useState<number>(0.25);
  const [fittingOverride, setFittingOverride] = useState<FittingType | "auto">(
    "auto"
  );

  // Label & slope edit settings
  const [labelSizeInput, setLabelSizeInput] = useState<number>(3);
  const [slopeValueInput, setSlopeValueInput] = useState<number>(0.25);

  // Graph & Undo/Redo stacks (>= 50 depth)
  const [graph, setGraph] = useState<DrawGraph>(() =>
    createSeedGraphFromExercise(SAMPLE_DRAWING_EXERCISES[0])
  );
  const [undoStack, setUndoStack] = useState<DrawGraph[]>([]);
  const [redoStack, setRedoStack] = useState<DrawGraph[]>([]);

  const [cursorPos, setCursorPos] = useState<Vec3>(
    () => SAMPLE_DRAWING_EXERCISES[0].fixtures[0]?.pos ?? [0, 0, 0]
  );
  const loadedDraftKeyRef = useRef<string | null>(null);
  const hasUserEditedRef = useRef<boolean>(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [recentFlowEdgeIds, setRecentFlowEdgeIds] = useState<string[]>([]);

  const [draftRestoredBanner, setDraftRestoredBanner] = useState<boolean>(false);
  const [gradeOutput, setGradeOutput] = useState<GradeDrawingOutput | null>(
    null
  );
  const [examRemainingMs, setExamRemainingMs] = useState<number>(15 * 60_000);
  const [editorError, setEditorError] = useState<string | null>(null);

  // List-view accessible form states
  const [listFromNodeId, setListFromNodeId] = useState<string>("");
  const [listNodeX, setListNodeX] = useState<string>("0");
  const [listNodeY, setListNodeY] = useState<string>("0");
  const [listNodeZ, setListNodeZ] = useState<string>("0");
  const [listNodeKind, setListNodeKind] = useState<
    "fixture" | "fitting" | "terminal"
  >("fitting");
  const [listFittingType, setListFittingType] =
    useState<FittingType>("cleanout");
  const [listFixtureType, setListFixtureType] = useState<FixtureType>("lav");

  const activeExercise = useMemo(
    () =>
      exercises.find((e) => e.id === selectedExerciseId) ?? exercises[0],
    [exercises, selectedExerciseId]
  );

  // Hydrate exercises and verified drawing_rules from Dexie + Supabase
  useEffect(() => {
    let active = true;
    async function hydrateCatalog() {
      const db = getOfflineDb();
      if (db) {
        try {
          const [cachedRules, cachedExercises] = await Promise.all([
            db.drawingRules.toArray(),
            db.drawingExercises.toArray(),
          ]);
          if (active && cachedRules.length > 0) {
            setRules(cachedRules);
          }
          if (active && cachedExercises.length > 0) {
            setExercises((prev) => {
              const map = new Map(prev.map((e) => [e.id, e]));
              for (const ce of cachedExercises) {
                if (ce.status === "published") map.set(ce.id, ce);
              }
              return [...map.values()];
            });
          }
        } catch {
          // Ignore Dexie read failure
        }
      }

      const supabase = createBrowserSupabaseClient();
      if (supabase) {
        try {
          const [{ data: ruleRows }, { data: exRows }] = await Promise.all([
            supabase.from("drawing_rules").select("*"),
            supabase.from("drawing_exercises").select("*"),
          ]);
          if (active && ruleRows && ruleRows.length > 0) {
            const typed = ruleRows as DrawingRuleRow[];
            setRules(typed);
            if (db) {
              await db.drawingRules.bulkPut(
                typed.map((r) => ({
                  ...r,
                  id: `${r.code_family}::${r.edition}::${r.rule_key}`,
                }))
              );
            }
          }
          if (active && exRows && exRows.length > 0) {
            setExercises((prev) => {
              const map = new Map(prev.map((e) => [e.id, e]));
              for (const row of exRows as DrawingExerciseConfig[]) {
                map.set(row.id, row);
              }
              return [...map.values()];
            });
          }
        } catch {
          // Offline fallback uses Dexie cache cleanly
        }
      }
    }
    void hydrateCatalog();
    return () => {
      active = false;
    };
  }, []);

  // Load saved offline draft whenever activeExercise or mode changes
  useEffect(() => {
    let active = true;
    const draftId = `${activeExercise.id}::${mode}`;

    async function loadDraft() {
      hasUserEditedRef.current = false;
      setGradeOutput(null);
      setEditorError(null);
      setUndoStack([]);
      setRedoStack([]);
      setDraftRestoredBanner(false);
      setExamRemainingMs((activeExercise.time_limit_min ?? 15) * 60_000);
      setRunSystem(activeExercise.pipe_system);

      const db = getOfflineDb();
      if (db) {
        try {
          const saved = await db.drawingDrafts.get(draftId);
          if (active && saved && validateGraph(saved.graph).valid) {
            setGraph(saved.graph);
            setDraftRestoredBanner(saved.graph.edges.length > 0);
            if (saved.graph.nodes[0]) {
              setListFromNodeId(saved.graph.nodes[0].id);
              setCursorPos(saved.graph.nodes[0].pos);
            }
            loadedDraftKeyRef.current = draftId;
            return;
          }
        } catch {
          // Ignore Dexie failure
        }
      }

      if (active) {
        const initial = createSeedGraphFromExercise(activeExercise);
        setGraph(initial);
        if (initial.nodes[0]) {
          setListFromNodeId(initial.nodes[0].id);
          setCursorPos(initial.nodes[0].pos);
        }
        loadedDraftKeyRef.current = draftId;
      }
    }

    void loadDraft();
    return () => {
      active = false;
    };
  }, [activeExercise, mode]);

  // Auto-save draft atomically with transactional outbox after real edits
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const draftId = `${activeExercise.id}::${mode}`;
    if (loadedDraftKeyRef.current !== draftId) return;
    if (!hasUserEditedRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      const db = getOfflineDb();
      if (db) {
        try {
          const outboxItem = await writeDrawingDraftAndEnqueueOutbox(db, {
            id: draftId,
            exercise_id: activeExercise.id,
            mode,
            graph,
            elapsed_ms: 0,
            updated_at: new Date().toISOString(),
          });
          if (typeof navigator === "undefined" || navigator.onLine) {
            void replayPendingOutbox(db).catch(() => undefined);
          }
          void outboxItem;
        } catch {
          // Ignore storage restrictions
        }
      }
    }, 120);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [activeExercise.id, graph, mode]);

  // Exam timer countdown + auto-grade at 00:00
  const commitGrade = useCallback(
    async (targetGraph: DrawGraph) => {
      const output = gradeDrawing({
        graph: targetGraph,
        exercise: activeExercise,
        rules,
      });
      setGradeOutput(output);

      const submission = {
        id: generateUuid(),
        exercise_id: activeExercise.id,
        score: output.max > 0 ? Math.round((output.score / output.max) * 100) : 0,
        mode,
        time_ms: 0,
        created_at: new Date().toISOString(),
      };

      const db = getOfflineDb();
      if (db) {
        try {
          await db.drawingSubmissions.put({
            id: submission.id,
            exercise_id: submission.exercise_id,
            graph: targetGraph,
            score: submission.score,
            rubric_breakdown: output.breakdown,
            time_ms: submission.time_ms,
            mode: submission.mode,
            created_at: submission.created_at,
          });
        } catch {
          // Ignore storage error
        }
      }

      await recordDrawingSubmission(submission);
    },
    [activeExercise, mode, recordDrawingSubmission, rules]
  );

  useEffect(() => {
    if (mode !== "exam" || gradeOutput !== null) return;
    const id = window.setInterval(() => {
      setExamRemainingMs((prev) => {
        if (prev <= 1000) {
          void commitGrade(graph);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [commitGrade, gradeOutput, graph, mode]);

  const applyGraphMutation = useCallback(
    (nextGraph: DrawGraph, flowEdgeIds: string[] = []) => {
      hasUserEditedRef.current = true;
      setEditorError(null);
      setUndoStack((prev) => [...prev.slice(-(MAX_UNDO_HISTORY - 1)), graph]);
      setRedoStack([]);
      setGraph(nextGraph);
      if (flowEdgeIds.length > 0) {
        setRecentFlowEdgeIds(flowEdgeIds);
      }
    },
    [graph]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    hasUserEditedRef.current = true;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((r) => [...r.slice(-(MAX_UNDO_HISTORY - 1)), graph]);
    setGraph(prev);
  }, [graph, undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    hasUserEditedRef.current = true;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((s) => [...s.slice(-(MAX_UNDO_HISTORY - 1)), graph]);
    setGraph(next);
  }, [graph, redoStack]);

  function handleCanvasPlaceAt(pos: Vec3) {
    try {
      if (activeTool.kind === "run") {
        const res = addRun(graph, {
          fromPos: pos,
          axis: runAxis,
          length: runLength,
          size: runSize,
          system: runSystem,
          slope: runSystem === "dwv" ? runSlope : null,
          slopeToward: "to",
          overrideFitting:
            fittingOverride === "auto" ? undefined : fittingOverride,
        });
        applyGraphMutation(
          res.graph,
          res.edges.map((e) => e.id)
        );
        setCursorPos(res.endNode.pos);
        setSelectedNodeId(res.endNode.id);
      } else if (activeTool.kind === "fitting") {
        const res = placeNode(graph, {
          pos,
          kind: "fitting",
          fittingType: activeTool.fittingType,
        });
        applyGraphMutation(res.graph);
        setSelectedNodeId(res.node.id);
      } else if (activeTool.kind === "fixture") {
        const res = placeNode(graph, {
          pos,
          kind: "fixture",
          fixtureType: activeTool.fixtureType,
          hasTrap: true,
        });
        applyGraphMutation(res.graph);
        setSelectedNodeId(res.node.id);
      } else if (activeTool.kind === "terminal") {
        const res = placeNode(graph, {
          pos,
          kind: "terminal",
          terminalType: activeTool.terminalType,
        });
        applyGraphMutation(res.graph);
        setSelectedNodeId(res.node.id);
      } else if (activeTool.kind === "label" && selectedEdgeId) {
        applyGraphMutation(updateEdgeLabel(graph, selectedEdgeId, labelSizeInput));
      } else if (activeTool.kind === "slope" && selectedEdgeId) {
        applyGraphMutation(
          updateEdgeSlope(graph, selectedEdgeId, slopeValueInput)
        );
      }
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  function handleKeyboardExtendRun(axis: IsoAxis) {
    try {
      const res = addRun(graph, {
        fromPos: cursorPos,
        axis,
        length: runLength,
        size: runSize,
        system: runSystem,
        slope: runSystem === "dwv" ? runSlope : null,
        slopeToward: "to",
        overrideFitting:
          fittingOverride === "auto" ? undefined : fittingOverride,
      });
      applyGraphMutation(
        res.graph,
        res.edges.map((e) => e.id)
      );
      setCursorPos(res.endNode.pos);
      setSelectedNodeId(res.endNode.id);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Extend run failed.");
    }
  }

  function handleListAddNode(e: React.FormEvent) {
    e.preventDefault();
    const pos: Vec3 = [
      Number(listNodeX) || 0,
      Number(listNodeY) || 0,
      Number(listNodeZ) || 0,
    ];
    try {
      const res = placeNode(
        graph,
        listNodeKind === "fixture"
          ? { pos, kind: "fixture", fixtureType: listFixtureType, hasTrap: true }
          : listNodeKind === "terminal"
            ? { pos, kind: "terminal", terminalType: "vtr" }
            : { pos, kind: "fitting", fittingType: listFittingType }
      );
      applyGraphMutation(res.graph);
      setListFromNodeId(res.node.id);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Node add failed.");
    }
  }

  function handleListAddRun(e: React.FormEvent) {
    e.preventDefault();
    const startId = listFromNodeId || graph.nodes[0]?.id;
    if (!startId) {
      setEditorError("Add a starting node first before adding a pipe run.");
      return;
    }
    try {
      const res = addRun(graph, {
        fromNodeId: startId,
        axis: runAxis,
        length: runLength,
        size: runSize,
        system: runSystem,
        slope: runSystem === "dwv" ? runSlope : null,
        slopeToward: "to",
        overrideFitting:
          fittingOverride === "auto" ? undefined : fittingOverride,
      });
      applyGraphMutation(
        res.graph,
        res.edges.map((ed) => ed.id)
      );
      setListFromNodeId(res.endNode.id);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Run add failed.");
    }
  }

  function handleResetExercise() {
    applyGraphMutation(createSeedGraphFromExercise(activeExercise));
    setGradeOutput(null);
  }

  const offendingNodeMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!gradeOutput) return map;
    for (const item of gradeOutput.breakdown) {
      if (item.passed || !item.configured) continue;
      for (const nodeId of item.offending_node_ids) {
        const prev = map.get(nodeId) ?? [];
        prev.push(item.rule_key);
        map.set(nodeId, prev);
      }
    }
    return map;
  }, [gradeOutput]);

  const activeRulesCount = useMemo(
    () =>
      rules.filter(
        (r) =>
          r.code_family === activeExercise.code_family &&
          r.edition === activeExercise.edition
      ).length,
    [activeExercise.code_family, activeExercise.edition, rules]
  );

  return (
    <div className="space-y-4">
      {/* Header & Exercise Picker */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-caption uppercase tracking-wider text-accent">
            Isometric Pipe-Drawing Lab · {activeExercise.code_family}{" "}
            {activeExercise.edition}
          </span>
          <h1 className="text-h1 text-ink">{activeExercise.title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select drawing exercise"
            value={activeExercise.id}
            onChange={(e) => setSelectedExerciseId(e.target.value)}
            className="min-h-12 rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
          >
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.code_family} {ex.edition} · {ex.title}
              </option>
            ))}
          </select>

          <Link
            href="/draw/admin"
            className="btn-secondary min-h-12 px-3.5 text-sm"
          >
            <Settings2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Admin / Rules
          </Link>
        </div>
      </div>

      {/* Prompt & Mode Bar */}
      <div className="bento-card space-y-3">
        <p className="text-sm text-muted">{activeExercise.prompt_md}</p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Drawing lab mode" className="flex gap-1.5">
            {(
              [
                { id: "learn", label: "Learn" },
                { id: "practice", label: "Practice" },
                { id: "exam", label: "Exam" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`min-h-12 rounded-xl border px-4 text-sm font-semibold transition-colors ${
                  mode === m.id
                    ? "border-accent bg-elevated text-ink"
                    : "border-border/70 bg-bg/60 text-muted hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mode === "exam" && (
              <span
                aria-label="Exam timer"
                className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-primary/60 bg-primary/10 px-3 font-mono text-sm font-bold tabular-nums text-primary"
              >
                <Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {formatTimer(examRemainingMs)}
              </span>
            )}

            <button
              type="button"
              onClick={() =>
                setViewMode((v) => (v === "canvas" ? "list" : "canvas"))
              }
              className="btn-secondary min-h-12 px-3 text-sm"
            >
              {viewMode === "canvas" ? (
                <>
                  <List className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  List View
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Canvas View
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              aria-label="Undo"
              className="btn-secondary min-h-12 min-w-12 px-3"
            >
              <Undo2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              aria-label="Redo"
              className="btn-secondary min-h-12 min-w-12 px-3"
            >
              <Redo2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleResetExercise}
              aria-label="Reset drawing"
              className="btn-secondary min-h-12 px-3 text-sm"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Reset
            </button>
          </div>
        </div>

        {draftRestoredBanner && (
          <p role="status" className="text-caption text-accent">
            Restored saved draft from offline storage ({graph.edges.length} pipe runs).
          </p>
        )}

        {activeRulesCount === 0 && mode !== "learn" && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/60 bg-primary/10 px-3.5 py-2 text-caption text-ink"
          >
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden="true" />
              No verified <code className="font-mono">drawing_rules</code> loaded for {activeExercise.code_family} {activeExercise.edition}; grading will mark unconfigured rules cleanly without guessing.
            </span>
            <Link href="/draw/admin" className="font-semibold text-accent hover:underline">
              Configure rules
            </Link>
          </div>
        )}

        {mode === "learn" && activeExercise.hints && activeExercise.hints.length > 0 && (
          <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm text-ink">
            <p className="inline-flex items-center gap-1.5 font-semibold text-accent">
              <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Learn Mode Guide (ghost guide active, scoring hidden)
            </p>
            <ul className="mt-1 list-disc pl-5 text-muted">
              {activeExercise.hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Main Editor Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Tool Palette */}
        <aside className="bento-card space-y-4 lg:col-span-4">
          <h2 className="text-h3 text-ink">Tools &amp; Fitting Picker</h2>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveTool({ kind: "run" })}
              className={`min-h-12 rounded-xl border px-3 text-sm font-medium ${
                activeTool.kind === "run"
                  ? "border-accent bg-elevated text-ink"
                  : "border-border/70 bg-bg/60 text-muted"
              }`}
            >
              Pipe Run
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveTool({ kind: "terminal", terminalType: "vtr" })
              }
              className={`min-h-12 rounded-xl border px-3 text-sm font-medium ${
                activeTool.kind === "terminal"
                  ? "border-accent bg-elevated text-ink"
                  : "border-border/70 bg-bg/60 text-muted"
              }`}
            >
              Vent Terminal
            </button>
            <button
              type="button"
              onClick={() => setActiveTool({ kind: "label" })}
              className={`min-h-12 rounded-xl border px-3 text-sm font-medium ${
                activeTool.kind === "label"
                  ? "border-accent bg-elevated text-ink"
                  : "border-border/70 bg-bg/60 text-muted"
              }`}
            >
              Size Label
            </button>
            <button
              type="button"
              onClick={() => setActiveTool({ kind: "slope" })}
              className={`min-h-12 rounded-xl border px-3 text-sm font-medium ${
                activeTool.kind === "slope"
                  ? "border-accent bg-elevated text-ink"
                  : "border-border/70 bg-bg/60 text-muted"
              }`}
            >
              Slope Note
            </button>
          </div>

          {/* Pipe Run Controls */}
          <div className="space-y-2.5 rounded-xl border border-border/70 bg-bg/60 p-3">
            <span className="text-caption uppercase tracking-wider text-muted">
              Pipe Run Settings
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor="run-axis" className="block text-caption text-muted">
                  Axis
                </label>
                <select
                  id="run-axis"
                  value={runAxis}
                  onChange={(e) => setRunAxis(e.target.value as IsoAxis)}
                  className="min-h-10 w-full rounded-lg border border-border bg-elevated px-2.5 text-sm text-ink"
                >
                  {ISO_AXES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="run-length" className="block text-caption text-muted">
                  Length (grid)
                </label>
                <input
                  id="run-length"
                  type="number"
                  min={1}
                  max={12}
                  value={runLength}
                  onChange={(e) =>
                    setRunLength(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="min-h-10 w-full rounded-lg border border-border bg-elevated px-2.5 font-mono text-sm text-ink"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="run-system" className="block text-caption text-muted">
                  System
                </label>
                <select
                  id="run-system"
                  value={runSystem}
                  onChange={(e) =>
                    setRunSystem(e.target.value as DrawPipeSystem)
                  }
                  className="min-h-10 w-full rounded-lg border border-border bg-elevated px-2.5 text-sm text-ink"
                >
                  <option value="dwv">DWV</option>
                  <option value="vent">Vent</option>
                  <option value="supply">Supply</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="run-size" className="block text-caption text-muted">
                  Size (in)
                </label>
                <input
                  id="run-size"
                  type="number"
                  min={0.5}
                  step={0.25}
                  value={runSize}
                  onChange={(e) =>
                    setRunSize(Math.max(0.5, Number(e.target.value) || 1.5))
                  }
                  className="min-h-10 w-full rounded-lg border border-border bg-elevated px-2.5 font-mono text-sm text-ink"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label htmlFor="run-slope" className="block text-caption text-muted">
                  Slope (in/ft)
                </label>
                <input
                  id="run-slope"
                  type="number"
                  min={0}
                  step={0.125}
                  value={runSlope}
                  onChange={(e) =>
                    setRunSlope(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="min-h-10 w-full rounded-lg border border-border bg-elevated px-2.5 font-mono text-sm text-ink"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="fitting-override" className="block text-caption text-muted">
                  Auto-Fitting
                </label>
                <select
                  id="fitting-override"
                  value={fittingOverride}
                  onChange={(e) =>
                    setFittingOverride(
                      e.target.value as FittingType | "auto"
                    )
                  }
                  className="min-h-10 w-full rounded-lg border border-border bg-elevated px-2.5 text-sm text-ink"
                >
                  <option value="auto">Auto (Wye/Tee/90)</option>
                  {FITTING_OPTIONS.map((f) => (
                    <option key={f.type} value={f.type}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Fittings */}
          <div className="space-y-1.5">
            <span className="text-caption uppercase tracking-wider text-muted">
              Fittings
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {FITTING_OPTIONS.map((fit) => {
                const selected =
                  activeTool.kind === "fitting" &&
                  activeTool.fittingType === fit.type;
                return (
                  <button
                    key={fit.type}
                    type="button"
                    onClick={() =>
                      setActiveTool({ kind: "fitting", fittingType: fit.type })
                    }
                    className={`min-h-10 rounded-lg border px-2.5 text-caption ${
                      selected
                        ? "border-accent bg-elevated text-ink"
                        : "border-border/60 bg-bg/60 text-muted hover:text-ink"
                    }`}
                  >
                    {fit.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fixtures with custom plumbing-icon glyphs */}
          <div className="space-y-1.5">
            <span className="text-caption uppercase tracking-wider text-muted">
              Fixtures
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {FIXTURE_OPTIONS.map((fx) => {
                const selected =
                  activeTool.kind === "fixture" &&
                  activeTool.fixtureType === fx.type;
                return (
                  <button
                    key={fx.type}
                    type="button"
                    onClick={() =>
                      setActiveTool({ kind: "fixture", fixtureType: fx.type })
                    }
                    className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-2.5 text-caption ${
                      selected
                        ? "border-accent bg-elevated text-ink"
                        : "border-border/60 bg-bg/60 text-muted hover:text-ink"
                    }`}
                  >
                    <FixtureGlyphIcon
                      fixtureType={fx.type}
                      className="h-4 w-4 text-accent"
                    />
                    {fx.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected edge quick edit */}
          {selectedEdgeId && (
            <div className="space-y-2 rounded-xl border border-accent/50 bg-bg/80 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-caption text-accent">
                  Selected Edge: {selectedEdgeId}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    applyGraphMutation(removeEdge(graph, selectedEdgeId));
                    setSelectedEdgeId(null);
                  }}
                  aria-label="Delete selected edge"
                  className="text-error hover:underline"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  aria-label="Selected edge size"
                  step={0.25}
                  value={labelSizeInput}
                  onChange={(e) => setLabelSizeInput(Number(e.target.value) || 2)}
                  className="min-h-10 w-20 rounded-lg border border-border bg-elevated px-2 font-mono text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={() =>
                    applyGraphMutation(
                      updateEdgeLabel(graph, selectedEdgeId, labelSizeInput)
                    )
                  }
                  className="btn-secondary min-h-10 px-2.5 text-xs"
                >
                  Set Size
                </button>
                <input
                  type="number"
                  aria-label="Selected edge slope"
                  step={0.125}
                  value={slopeValueInput}
                  onChange={(e) => setSlopeValueInput(Number(e.target.value) || 0)}
                  className="min-h-10 w-20 rounded-lg border border-border bg-elevated px-2 font-mono text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={() =>
                    applyGraphMutation(
                      updateEdgeSlope(graph, selectedEdgeId, slopeValueInput)
                    )
                  }
                  className="btn-secondary min-h-10 px-2.5 text-xs"
                >
                  Set Slope
                </button>
              </div>
            </div>
          )}

          {/* Sole Primary Action on screen */}
          {mode !== "learn" && (
            <button
              type="button"
              onClick={() => void commitGrade(graph)}
              className="btn-primary w-full"
            >
              {mode === "exam" ? "Submit Exam Drawing" : "Check Drawing"}
            </button>
          )}
        </aside>

        {/* Right Workspace: SVG Isometric Canvas OR Accessible Form-Based List View */}
        <section className="space-y-4 lg:col-span-8">
          {editorError && (
            <div
              role="alert"
              className="rounded-xl border border-error/60 bg-error/10 px-4 py-2.5 text-sm text-ink"
            >
              {editorError}
            </div>
          )}

          {viewMode === "canvas" ? (
            <IsoCanvas
              graph={graph}
              ghostEdges={mode === "learn" ? activeExercise.ghost_edges : []}
              activeTool={activeTool}
              cursorPos={cursorPos}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              offendingNodeMap={offendingNodeMap}
              recentFlowEdgeIds={recentFlowEdgeIds}
              onCursorChange={setCursorPos}
              onCanvasPlaceAt={handleCanvasPlaceAt}
              onKeyboardExtendRun={handleKeyboardExtendRun}
              onSelectNode={setSelectedNodeId}
              onSelectEdge={setSelectedEdgeId}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          ) : (
            /* Form-Based Accessible List View Alternative */
            <div className="bento-card space-y-5">
              <div>
                <h2 className="text-h2 text-ink">
                  Accessible Graph List &amp; Run Builder
                </h2>
                <p className="text-sm text-muted">
                  Build and edit nodes and pipe runs without pointer input.
                </p>
              </div>

              <form
                onSubmit={handleListAddNode}
                className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-bg/60 p-3 sm:grid-cols-6"
              >
                <div className="space-y-1 sm:col-span-2">
                  <label htmlFor="list-node-kind" className="block text-caption text-muted">
                    Node kind
                  </label>
                  <select
                    id="list-node-kind"
                    value={listNodeKind}
                    onChange={(e) =>
                      setListNodeKind(
                        e.target.value as "fixture" | "fitting" | "terminal"
                      )
                    }
                    className="min-h-10 w-full rounded-lg border border-border bg-elevated px-2 text-sm text-ink"
                  >
                    <option value="fitting">Fitting</option>
                    <option value="fixture">Fixture</option>
                    <option value="terminal">VTR Terminal</option>
                  </select>
                </div>

                {listNodeKind === "fitting" && (
                  <div className="space-y-1 sm:col-span-2">
                    <label htmlFor="list-fit-type" className="block text-caption text-muted">
                      Fitting
                    </label>
                    <select
                      id="list-fit-type"
                      value={listFittingType}
                      onChange={(e) =>
                        setListFittingType(e.target.value as FittingType)
                      }
                      className="min-h-10 w-full rounded-lg border border-border bg-elevated px-2 text-sm text-ink"
                    >
                      {FITTING_OPTIONS.map((f) => (
                        <option key={f.type} value={f.type}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {listNodeKind === "fixture" && (
                  <div className="space-y-1 sm:col-span-2">
                    <label htmlFor="list-fix-type" className="block text-caption text-muted">
                      Fixture
                    </label>
                    <select
                      id="list-fix-type"
                      value={listFixtureType}
                      onChange={(e) =>
                        setListFixtureType(e.target.value as FixtureType)
                      }
                      className="min-h-10 w-full rounded-lg border border-border bg-elevated px-2 text-sm text-ink"
                    >
                      {FIXTURE_OPTIONS.map((f) => (
                        <option key={f.type} value={f.type}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <label htmlFor="list-x" className="block text-caption text-muted">
                    X, Y, Z
                  </label>
                  <div className="flex gap-1">
                    <input
                      id="list-x"
                      type="number"
                      aria-label="Grid X"
                      value={listNodeX}
                      onChange={(e) => setListNodeX(e.target.value)}
                      className="min-h-10 w-12 rounded-lg border border-border bg-elevated px-1.5 font-mono text-xs text-ink"
                    />
                    <input
                      type="number"
                      aria-label="Grid Y"
                      value={listNodeY}
                      onChange={(e) => setListNodeY(e.target.value)}
                      className="min-h-10 w-12 rounded-lg border border-border bg-elevated px-1.5 font-mono text-xs text-ink"
                    />
                    <input
                      type="number"
                      aria-label="Grid Z"
                      value={listNodeZ}
                      onChange={(e) => setListNodeZ(e.target.value)}
                      className="min-h-10 w-12 rounded-lg border border-border bg-elevated px-1.5 font-mono text-xs text-ink"
                    />
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="btn-secondary min-h-10 w-full px-3 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    Add Node
                  </button>
                </div>
              </form>

              <form
                onSubmit={handleListAddRun}
                className="flex flex-wrap items-end gap-2 rounded-xl border border-border/70 bg-bg/60 p-3"
              >
                <div className="space-y-1">
                  <label htmlFor="list-from-node" className="block text-caption text-muted">
                    Start node
                  </label>
                  <select
                    id="list-from-node"
                    value={listFromNodeId}
                    onChange={(e) => setListFromNodeId(e.target.value)}
                    className="min-h-10 rounded-lg border border-border bg-elevated px-2.5 text-sm text-ink"
                  >
                    {graph.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id} ({n.kind}) [{n.pos.join(",")}]
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn-secondary min-h-10 px-3 text-sm">
                  Add {runLength}-unit {runAxis} {runSystem.toUpperCase()} Run ({runSize}&quot;)
                </button>
              </form>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-caption uppercase tracking-wider text-muted">
                    Nodes ({graph.nodes.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {graph.nodes.map((n) => (
                      <li
                        key={n.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-bg/60 px-3 py-2 text-xs"
                      >
                        <span className="font-mono text-ink">
                          {n.id} · {n.kind} ({n.fixtureType ?? n.fittingType ?? n.terminalType ?? "stack"}) [{n.pos.join(",")}]
                        </span>
                        <button
                          type="button"
                          onClick={() => applyGraphMutation(removeNode(graph, n.id))}
                          aria-label={`Remove node ${n.id}`}
                          className="text-error hover:underline"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <h3 className="text-caption uppercase tracking-wider text-muted">
                    Pipe Runs ({graph.edges.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {graph.edges.map((ed) => (
                      <li
                        key={ed.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-bg/60 px-3 py-2 text-xs"
                      >
                        <span className="font-mono text-ink">
                          {ed.from} → {ed.to} ({ed.system}, {ed.axis}, len {ed.length}, {ed.size ?? "?"}&quot;)
                        </span>
                        <button
                          type="button"
                          onClick={() => applyGraphMutation(removeEdge(graph, ed.id))}
                          aria-label={`Remove pipe edge ${ed.id}`}
                          className="text-error hover:underline"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Staggered Grading Results Breakdown */}
          {gradeOutput && mode !== "learn" && (
            <motion.section
              variants={MOTION_VARIANTS.staggerContainer}
              initial="hidden"
              animate="visible"
              aria-labelledby="grading-results-heading"
              className="bento-card space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-caption uppercase tracking-wider text-accent">
                    Deterministic Rule Evaluation
                  </span>
                  <h2 id="grading-results-heading" className="text-h2 tabular-nums text-ink">
                    Score: {gradeOutput.score} / {gradeOutput.max}
                  </h2>
                </div>
                <span className="text-caption text-muted">
                  Offending nodes ringed in red on canvas
                </span>
              </div>

              <div className="space-y-2">
                {gradeOutput.breakdown.map((item) => (
                  <motion.div
                    key={item.rule_key}
                    variants={MOTION_VARIANTS.bentoCard}
                    className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3 text-sm ${
                      !item.configured
                        ? "border-border bg-bg/50"
                        : item.passed
                          ? "border-success/50 bg-success/10"
                          : "border-error/50 bg-error/10"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-semibold text-ink">
                        {!item.configured ? (
                          <AlertTriangle
                            className="h-4 w-4 text-primary"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        ) : item.passed ? (
                          <CheckCircle2
                            className="h-4 w-4 text-success"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        ) : (
                          <XCircle
                            className="h-4 w-4 text-error"
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        )}
                        <span className="font-mono">{item.rule_key}</span>
                        {!item.configured && (
                          <span className="rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-caption text-primary">
                            Not configured
                          </span>
                        )}
                      </div>
                      <p className="text-muted">{item.message}</p>
                      {item.offending_node_ids.length > 0 && (
                        <p className="font-mono text-caption text-error">
                          Offending nodes: {item.offending_node_ids.join(", ")}
                        </p>
                      )}
                    </div>

                    <span className="font-mono font-semibold tabular-nums text-ink">
                      {item.configured
                        ? `${item.points}/${item.max_points}`
                        : "Excluded"}
                    </span>
                  </motion.div>
                ))}
              </div>

              <p className="text-caption text-muted">
                Verify against your adopted code. Not legal advice.
              </p>
            </motion.section>
          )}
        </section>
      </div>
    </div>
  );
}
