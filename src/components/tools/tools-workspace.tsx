"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  CheckCircle2,
  Database,
  Play,
  RefreshCw,
  Upload,
  WifiOff,
  XCircle,
} from "lucide-react";
import { RadioCard } from "@/components/practice/radio-card";
import { QuestionReviewBar } from "@/components/questions/question-review-bar";
import { useAppState } from "@/components/providers/app-state-provider";
import {
  CODE_TABLE_KEYS,
  type CalcOutput,
  type CalcType,
  type CodeTableKey,
  type CodeTableRecord,
  type GeneratedCalcQuestion,
  MissingCodeTableError,
  OutOfRangeInputError,
  TABLE_SCHEMA_BY_KEY,
  calculateDfuTotal,
  calculateDrainSize,
  calculateGasPipeSize,
  calculateVentSize,
  calculateWsfuSupplySize,
  createCodeTableStore,
  generateCalcPracticeQuestion,
  gradeCalcPracticeAnswer,
} from "@/lib/calc";
import { MOTION_DURATION } from "@/lib/motion";
import { getOfflineDb } from "@/lib/offline/db";

const CALC_TABS: { id: CalcType; tableKey: CodeTableKey; label: string }[] = [
  { id: "dfu", tableKey: "dfu_fixtures", label: "DFU Totals" },
  { id: "drain", tableKey: "drain_sizing", label: "Drain Sizing" },
  { id: "vent", tableKey: "vent_sizing", label: "Vent Sizing" },
  { id: "wsfu", tableKey: "wsfu_supply", label: "WSFU Supply" },
  { id: "gas", tableKey: "gas_pipe_sizing", label: "Gas Pipe" },
];

export function ToolsWorkspace() {
  const { activeJurisdiction } = useAppState();
  const [activeCalc, setActiveCalc] = useState<CalcType>("dfu");
  const [subMode, setSubMode] = useState<"calculator" | "practice">("calculator");

  const [tables, setTables] = useState<CodeTableRecord[]>([]);
  const [syncSource, setSyncSource] = useState<"cache" | "db" | "offline">("cache");

  // Import verified table JSON drawer
  const [showImport, setShowImport] = useState<boolean>(false);
  const [importKey, setImportKey] = useState<CodeTableKey>("dfu_fixtures");
  const [importTitle, setImportTitle] = useState<string>("");
  const [importCodeRef, setImportCodeRef] = useState<string>("");
  const [importJson, setImportJson] = useState<string>("");
  const [importMessage, setImportMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Calculator inputs
  const [dfuCounts, setDfuCounts] = useState<Record<string, number>>({});
  const [drainDfu, setDrainDfu] = useState<string>("12");
  const [drainSlope, setDrainSlope] = useState<string>("0.25");
  const [drainKind, setDrainKind] = useState<
    "horizontal_branch" | "building_drain" | "vertical_stack"
  >("horizontal_branch");
  const [ventStackSize, setVentStackSize] = useState<string>("3");
  const [ventDfu, setVentDfu] = useState<string>("20");
  const [ventDevLength, setVentDevLength] = useState<string>("45");
  const [wsfuSupplyType, setWsfuSupplyType] = useState<
    "flush_tank" | "flushometer"
  >("flush_tank");
  const [wsfuMaterial, setWsfuMaterial] = useState<string>("");
  const [wsfuCounts, setWsfuCounts] = useState<Record<string, number>>({});
  const [gasBtuh, setGasBtuh] = useState<string>("120000");
  const [gasLengthFt, setGasLengthFt] = useState<string>("40");

  // Output & step-by-step reveal state
  const [calcOutput, setCalcOutput] = useState<CalcOutput<unknown> | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [revealedSteps, setRevealedSteps] = useState<number>(0);

  // Randomized calc practice state
  const [practiceQ, setPracticeQ] = useState<GeneratedCalcQuestion | null>(null);
  const [practiceSelected, setPracticeSelected] = useState<number | null>(null);
  const [practiceGrade, setPracticeGrade] = useState<ReturnType<
    typeof gradeCalcPracticeAnswer
  > | null>(null);

  // Load code tables from Dexie offline cache first, then refresh from DB API
  useEffect(() => {
    let active = true;

    async function hydrateTables() {
      const db = getOfflineDb();
      if (db) {
        try {
          const cached = await db.codeTables
            .where("code_family")
            .equals(activeJurisdiction.code_family)
            .filter((t) => t.edition === activeJurisdiction.edition)
            .toArray();
          if (active && cached.length > 0) {
            setTables(cached);
            setSyncSource("cache");
          }
        } catch {
          // Ignore Dexie read failures
        }
      }

      try {
        const res = await fetch(
          `/api/calc/tables?codeFamily=${encodeURIComponent(activeJurisdiction.code_family)}&edition=${encodeURIComponent(activeJurisdiction.edition)}`
        );
        if (res.ok) {
          const data = (await res.json()) as {
            tables?: CodeTableRecord[];
            source?: string;
          };
          if (active && data.tables && data.tables.length > 0) {
            setTables(data.tables);
            setSyncSource("db");
            if (db) {
              await db.codeTables.bulkPut(
                data.tables.map((t) => ({
                  ...t,
                  id: `${t.code_family}::${t.edition}::${t.table_key}`,
                }))
              );
            }
          }
        }
      } catch {
        if (active) setSyncSource("offline");
      }
    }

    void hydrateTables();
    return () => {
      active = false;
    };
  }, [activeJurisdiction.code_family, activeJurisdiction.edition]);

  const store = useMemo(() => createCodeTableStore(tables), [tables]);

  const activeTableKey =
    CALC_TABS.find((t) => t.id === activeCalc)?.tableKey ?? "dfu_fixtures";

  const activeTableAvailable = store.hasTable(
    activeJurisdiction.code_family,
    activeJurisdiction.edition,
    activeTableKey
  );

  // Inspect loaded table metadata for rendering dynamic fixture pickers (zero hardcoding)
  const activeDfuFixtures = useMemo(() => {
    try {
      return store.getTable(
        activeJurisdiction.code_family,
        activeJurisdiction.edition,
        "dfu_fixtures"
      ).data.fixtures;
    } catch {
      return [];
    }
  }, [activeJurisdiction.code_family, activeJurisdiction.edition, store]);

  const activeWsfuTable = useMemo(() => {
    try {
      return store.getTable(
        activeJurisdiction.code_family,
        activeJurisdiction.edition,
        "wsfu_supply"
      ).data;
    } catch {
      return null;
    }
  }, [activeJurisdiction.code_family, activeJurisdiction.edition, store]);

  const availableWsfuMaterials = useMemo(() => {
    if (!activeWsfuTable) return [];
    return Array.from(
      new Set(activeWsfuTable.pipe_sizing.map((p) => p.material))
    );
  }, [activeWsfuTable]);

  useEffect(() => {
    if (availableWsfuMaterials.length > 0 && !wsfuMaterial) {
      setWsfuMaterial(availableWsfuMaterials[0]);
    }
  }, [availableWsfuMaterials, wsfuMaterial]);

  const runCalculation = useCallback(() => {
    setCalcError(null);
    setCalcOutput(null);
    setRevealedSteps(0);

    try {
      let out: CalcOutput<unknown>;
      if (activeCalc === "dfu") {
        const items = Object.entries(dfuCounts)
          .filter(([, count]) => count > 0)
          .map(([fixture_key, count]) => ({ fixture_key, count }));
        out = calculateDfuTotal(
          {
            code_family: activeJurisdiction.code_family,
            edition: activeJurisdiction.edition,
            items,
          },
          store
        );
      } else if (activeCalc === "drain") {
        out = calculateDrainSize(
          {
            code_family: activeJurisdiction.code_family,
            edition: activeJurisdiction.edition,
            total_dfu: Number(drainDfu),
            slope_in_per_ft: Number(drainSlope),
            system_kind: drainKind,
          },
          store
        );
      } else if (activeCalc === "vent") {
        out = calculateVentSize(
          {
            code_family: activeJurisdiction.code_family,
            edition: activeJurisdiction.edition,
            soil_stack_size_in: Number(ventStackSize),
            total_dfu: Number(ventDfu),
            developed_length_ft: Number(ventDevLength),
          },
          store
        );
      } else if (activeCalc === "wsfu") {
        const items = Object.entries(wsfuCounts)
          .filter(([, count]) => count > 0)
          .map(([fixture_key, count]) => ({ fixture_key, count }));
        out = calculateWsfuSupplySize(
          {
            code_family: activeJurisdiction.code_family,
            edition: activeJurisdiction.edition,
            supply_type: wsfuSupplyType,
            material: wsfuMaterial || availableWsfuMaterials[0] || "",
            items,
          },
          store
        );
      } else {
        out = calculateGasPipeSize(
          {
            code_family: activeJurisdiction.code_family,
            edition: activeJurisdiction.edition,
            total_btuh: Number(gasBtuh),
            developed_length_ft: Number(gasLengthFt),
          },
          store
        );
      }

      setCalcOutput(out);
      setRevealedSteps(1);
    } catch (err) {
      if (
        err instanceof MissingCodeTableError ||
        err instanceof OutOfRangeInputError
      ) {
        setCalcError(err.message);
      } else {
        setCalcError(
          err instanceof Error ? err.message : "Calculation failed."
        );
      }
    }
  }, [
    activeCalc,
    activeJurisdiction.code_family,
    activeJurisdiction.edition,
    availableWsfuMaterials,
    dfuCounts,
    drainDfu,
    drainKind,
    drainSlope,
    gasBtuh,
    gasLengthFt,
    store,
    ventDevLength,
    ventDfu,
    ventStackSize,
    wsfuCounts,
    wsfuMaterial,
    wsfuSupplyType,
  ]);

  function handleGeneratePractice() {
    setCalcError(null);
    setPracticeSelected(null);
    setPracticeGrade(null);
    try {
      const q = generateCalcPracticeQuestion({
        calcType: activeCalc,
        code_family: activeJurisdiction.code_family,
        edition: activeJurisdiction.edition,
        store,
        seed: Date.now(),
      });
      setPracticeQ(q);
      setRevealedSteps(0);
    } catch (err) {
      setPracticeQ(null);
      setCalcError(
        err instanceof Error ? err.message : "Unable to generate practice item."
      );
    }
  }

  function handleCheckPractice() {
    if (!practiceQ || practiceSelected === null) return;
    const grade = gradeCalcPracticeAnswer({
      question: practiceQ,
      selectedIndex: practiceSelected,
      store,
    });
    setPracticeGrade(grade);
    setRevealedSteps(grade.authoritativeOutput.steps.length);
  }

  async function handleImportTable(e: React.FormEvent) {
    e.preventDefault();
    setImportMessage(null);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(importJson);
    } catch {
      setImportMessage({ ok: false, text: "Invalid JSON syntax." });
      return;
    }

    const schema = TABLE_SCHEMA_BY_KEY[importKey];
    const validated = schema.safeParse(parsedJson);
    if (!validated.success) {
      setImportMessage({
        ok: false,
        text: `Schema error: ${validated.error.issues[0]?.message ?? "Invalid structure"}`,
      });
      return;
    }

    const recordId = `${activeJurisdiction.code_family}::${activeJurisdiction.edition}::${importKey}`;
    const newRecord: CodeTableRecord = {
      id: recordId,
      code_family: activeJurisdiction.code_family,
      edition: activeJurisdiction.edition,
      table_key: importKey,
      schema_version: 1,
      title: importTitle.trim() || `${activeJurisdiction.code_family} ${activeJurisdiction.edition} ${importKey}`,
      code_ref: importCodeRef.trim() || `${activeJurisdiction.code_family} ${activeJurisdiction.edition}`,
      data: validated.data as CodeTableRecord["data"],
      verified_at: new Date().toISOString(),
    };

    const db = getOfflineDb();
    if (db) {
      await db.codeTables.put({ ...newRecord, id: recordId });
    }

    setTables((prev) => [
      newRecord,
      ...prev.filter(
        (t) =>
          !(
            t.code_family === newRecord.code_family &&
            t.edition === newRecord.edition &&
            t.table_key === newRecord.table_key
          )
      ),
    ]);
    setImportMessage({
      ok: true,
      text: `Cached verified "${importKey}" table offline for ${activeJurisdiction.code_family} ${activeJurisdiction.edition}.`,
    });
    setCalcError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-caption uppercase tracking-wider text-accent">
            Deterministic Sizing Tools · {activeJurisdiction.code_family}{" "}
            {activeJurisdiction.edition}
          </span>
          <h1 className="text-h1 text-ink">Plumbing Code Calculators</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeJurisdiction.open_book && (
            <Link
              href="/navigate"
              className="btn-secondary min-h-12 px-3 text-sm text-accent"
            >
              <BookOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Navigation Trainer
            </Link>
          )}
          <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-caption text-muted">
            {syncSource === "offline" ? (
              <WifiOff className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Database className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} aria-hidden="true" />
            )}
            {syncSource === "db"
              ? "Verified DB tables"
              : syncSource === "offline"
                ? "Offline Dexie cache"
                : "Local offline cache"}
          </span>

          <button
            type="button"
            onClick={() => {
              setImportKey(activeTableKey);
              setShowImport((prev) => !prev);
            }}
            className="btn-secondary min-h-10 px-3 text-sm"
          >
            <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Import Verified Table
          </button>
        </div>
      </div>

      {/* Mode Switch: Calculator vs Randomized Practice */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Calculator type"
          className="flex flex-wrap gap-2"
        >
          {CALC_TABS.map((tab) => {
            const active = tab.id === activeCalc;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveCalc(tab.id);
                  setCalcOutput(null);
                  setCalcError(null);
                  setPracticeQ(null);
                  setPracticeGrade(null);
                }}
                className={`min-h-12 rounded-xl border px-3.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-accent bg-elevated text-ink"
                    : "border-border/70 bg-card text-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex rounded-xl border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setSubMode("calculator")}
            className={`min-h-10 rounded-lg px-3 text-caption font-semibold ${
              subMode === "calculator"
                ? "bg-elevated text-ink"
                : "text-muted hover:text-ink"
            }`}
          >
            Calculator
          </button>
          <button
            type="button"
            onClick={() => {
              setSubMode("practice");
              handleGeneratePractice();
            }}
            className={`min-h-10 rounded-lg px-3 text-caption font-semibold ${
              subMode === "practice"
                ? "bg-elevated text-ink"
                : "text-muted hover:text-ink"
            }`}
          >
            Calc Practice
          </button>
        </div>
      </div>

      {/* Optional local verified table JSON import form */}
      {showImport && (
        <form
          onSubmit={handleImportTable}
          className="bento-card space-y-3 border-accent/40"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-h3 text-ink">
              Import Verified {activeJurisdiction.code_family}{" "}
              {activeJurisdiction.edition} Table into Offline Dexie Store
            </h2>
            <span className="text-caption text-muted">
              Stored locally; never hardcoded
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="import-table-key" className="block text-caption text-muted">
                Table key
              </label>
              <select
                id="import-table-key"
                value={importKey}
                onChange={(e) => setImportKey(e.target.value as CodeTableKey)}
                className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
              >
                {CODE_TABLE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="import-title" className="block text-caption text-muted">
                Table title
              </label>
              <input
                id="import-title"
                type="text"
                value={importTitle}
                onChange={(e) => setImportTitle(e.target.value)}
                placeholder="e.g. Drainage Fixture Units"
                className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink placeholder:text-muted"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="import-ref" className="block text-caption text-muted">
                Code reference
              </label>
              <input
                id="import-ref"
                type="text"
                value={importCodeRef}
                onChange={(e) => setImportCodeRef(e.target.value)}
                placeholder="e.g. IPC 2021 Table 709.1"
                className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink placeholder:text-muted"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="import-json" className="block text-caption text-muted">
              Verified table JSON payload
            </label>
            <textarea
              id="import-json"
              rows={4}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"fixtures":[{"fixture_key":"lav","label":"Lavatory","dfu":1,"min_trap_in":1.25}]}'
              className="w-full rounded-xl border border-border bg-elevated p-3 font-mono text-xs text-ink placeholder:text-muted"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {importMessage ? (
              <span
                role="status"
                className={`text-sm ${
                  importMessage.ok ? "text-success" : "text-error"
                }`}
              >
                {importMessage.text}
              </span>
            ) : (
              <span className="text-caption text-muted">
                Validated against strict Zod table schema on import.
              </span>
            )}
            <button type="submit" className="btn-secondary min-h-12 px-4 text-sm">
              Save Table to Offline Cache
            </button>
          </div>
        </form>
      )}

      {/* Loud missing DB table notice */}
      {!activeTableAvailable && (
        <div
          role="alert"
          className="bento-card flex items-start gap-3 border-primary/70 bg-primary/10"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-primary"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-ink">
              Missing verified DB table: <code className="font-mono">{activeTableKey}</code> ({activeJurisdiction.code_family}{" "}
              {activeJurisdiction.edition})
            </p>
            <p className="text-muted">
              Bendline never hardcodes or invents code-book constants. Populate{" "}
              <code className="font-mono">public.code_tables</code> in Supabase or import verified table JSON above for offline use.
            </p>
          </div>
        </div>
      )}

      {subMode === "calculator" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Input Panel */}
          <section className="bento-card space-y-4 lg:col-span-5">
            <h2 className="text-h3 text-ink">
              {CALC_TABS.find((t) => t.id === activeCalc)?.label} Inputs
            </h2>

            {activeCalc === "dfu" && (
              <div className="space-y-2">
                {activeDfuFixtures.length === 0 ? (
                  <p className="text-sm text-muted">
                    Load <code className="font-mono">dfu_fixtures</code> to pick fixtures.
                  </p>
                ) : (
                  activeDfuFixtures.map((fx) => (
                    <div
                      key={fx.fixture_key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/60 px-3 py-2"
                    >
                      <label
                        htmlFor={`dfu-${fx.fixture_key}`}
                        className="text-sm text-ink"
                      >
                        {fx.label}{" "}
                        <span className="font-mono text-caption text-muted">
                          ({fx.dfu} DFU)
                        </span>
                      </label>
                      <input
                        id={`dfu-${fx.fixture_key}`}
                        type="number"
                        min={0}
                        step={1}
                        value={dfuCounts[fx.fixture_key] ?? 0}
                        onChange={(e) =>
                          setDfuCounts((prev) => ({
                            ...prev,
                            [fx.fixture_key]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="min-h-10 w-20 rounded-lg border border-border bg-elevated px-2.5 text-right font-mono text-sm tabular-nums text-ink"
                      />
                    </div>
                  ))
                )}
              </div>
            )}

            {activeCalc === "drain" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="drain-kind" className="block text-sm font-medium text-ink">
                    Drainage system kind
                  </label>
                  <select
                    id="drain-kind"
                    value={drainKind}
                    onChange={(e) =>
                      setDrainKind(
                        e.target.value as
                          | "horizontal_branch"
                          | "building_drain"
                          | "vertical_stack"
                      )
                    }
                    className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-base text-ink"
                  >
                    <option value="horizontal_branch">Horizontal branch</option>
                    <option value="building_drain">Building drain / sewer</option>
                    <option value="vertical_stack">Vertical stack</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="drain-dfu" className="block text-sm font-medium text-ink">
                      Total DFU
                    </label>
                    <input
                      id="drain-dfu"
                      type="number"
                      min={0.1}
                      step="any"
                      value={drainDfu}
                      onChange={(e) => setDrainDfu(e.target.value)}
                      className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-base tabular-nums text-ink"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="drain-slope" className="block text-sm font-medium text-ink">
                      Slope (in/ft)
                    </label>
                    <input
                      id="drain-slope"
                      type="number"
                      min={0}
                      step="any"
                      value={drainSlope}
                      onChange={(e) => setDrainSlope(e.target.value)}
                      className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-base tabular-nums text-ink"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeCalc === "vent" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="vent-stack" className="block text-sm font-medium text-ink">
                    Soil/waste stack diameter (in)
                  </label>
                  <input
                    id="vent-stack"
                    type="number"
                    min={0.5}
                    step="any"
                    value={ventStackSize}
                    onChange={(e) => setVentStackSize(e.target.value)}
                    className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-base tabular-nums text-ink"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="vent-dfu" className="block text-sm font-medium text-ink">
                      Total DFU
                    </label>
                    <input
                      id="vent-dfu"
                      type="number"
                      min={1}
                      step="any"
                      value={ventDfu}
                      onChange={(e) => setVentDfu(e.target.value)}
                      className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-base tabular-nums text-ink"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="vent-length" className="block text-sm font-medium text-ink">
                      Developed length (ft)
                    </label>
                    <input
                      id="vent-length"
                      type="number"
                      min={1}
                      step="any"
                      value={ventDevLength}
                      onChange={(e) => setVentDevLength(e.target.value)}
                      className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-base tabular-nums text-ink"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeCalc === "wsfu" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="wsfu-type" className="block text-sm font-medium text-ink">
                      Supply type
                    </label>
                    <select
                      id="wsfu-type"
                      value={wsfuSupplyType}
                      onChange={(e) =>
                        setWsfuSupplyType(
                          e.target.value as "flush_tank" | "flushometer"
                        )
                      }
                      className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
                    >
                      <option value="flush_tank">Flush tank</option>
                      <option value="flushometer">Flushometer</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="wsfu-mat" className="block text-sm font-medium text-ink">
                      Material
                    </label>
                    <select
                      id="wsfu-mat"
                      value={wsfuMaterial}
                      onChange={(e) => setWsfuMaterial(e.target.value)}
                      className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
                    >
                      {availableWsfuMaterials.length === 0 ? (
                        <option value="">Load wsfu_supply table</option>
                      ) : (
                        availableWsfuMaterials.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  {(activeWsfuTable?.fixtures ?? [])
                    .filter((f) => f.supply_type === wsfuSupplyType)
                    .map((fx) => (
                      <div
                        key={fx.fixture_key}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/60 px-3 py-2"
                      >
                        <label
                          htmlFor={`wsfu-${fx.fixture_key}`}
                          className="text-sm text-ink"
                        >
                          {fx.label}{" "}
                          <span className="font-mono text-caption text-muted">
                            ({fx.wsfu} WSFU)
                          </span>
                        </label>
                        <input
                          id={`wsfu-${fx.fixture_key}`}
                          type="number"
                          min={0}
                          step={1}
                          value={wsfuCounts[fx.fixture_key] ?? 0}
                          onChange={(e) =>
                            setWsfuCounts((prev) => ({
                              ...prev,
                              [fx.fixture_key]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className="min-h-10 w-20 rounded-lg border border-border bg-elevated px-2.5 text-right font-mono text-sm tabular-nums text-ink"
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {activeCalc === "gas" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="gas-btuh" className="block text-sm font-medium text-ink">
                    Total load (BTU/h)
                  </label>
                  <input
                    id="gas-btuh"
                    type="number"
                    min={1}
                    step="any"
                    value={gasBtuh}
                    onChange={(e) => setGasBtuh(e.target.value)}
                    className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-base tabular-nums text-ink"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="gas-length" className="block text-sm font-medium text-ink">
                    Developed length (ft)
                  </label>
                  <input
                    id="gas-length"
                    type="number"
                    min={1}
                    step="any"
                    value={gasLengthFt}
                    onChange={(e) => setGasLengthFt(e.target.value)}
                    className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-base tabular-nums text-ink"
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={runCalculation}
              className="btn-primary w-full"
            >
              <Calculator className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Calculate
            </button>
          </section>

          {/* Step-by-Step Result Panel */}
          <section className="bento-card space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-h3 text-ink">Deterministic Output</h2>
              {calcOutput && (
                <span className="font-mono text-caption text-accent">
                  {calcOutput.edition.code_family} {calcOutput.edition.edition} ·{" "}
                  {calcOutput.edition.code_ref} · v{calcOutput.edition.calc_version}
                </span>
              )}
            </div>

            {calcError && (
              <div
                role="alert"
                className="rounded-xl border border-error/60 bg-error/10 p-4 text-sm text-ink"
              >
                {calcError}
              </div>
            )}

            {!calcOutput && !calcError && (
              <p className="rounded-xl border border-border/60 bg-bg/60 p-4 text-sm text-muted">
                Enter values on the left and run the calculation to reveal each step, table lookup, and assumption.
              </p>
            )}

            {calcOutput && (
              <div className="space-y-4">
                <div className="rounded-xl border border-success/50 bg-success/10 p-4">
                  <span className="text-caption uppercase tracking-wider text-success">
                    Result
                  </span>
                  <pre className="mt-1 overflow-x-auto font-mono text-sm tabular-nums text-ink">
                    {JSON.stringify(calcOutput.result, null, 2)}
                  </pre>
                </div>

                {/* Step-by-step reveal controls & animated steps */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-caption uppercase tracking-wider text-muted tabular-nums">
                      Steps ({Math.min(revealedSteps, calcOutput.steps.length)} of{" "}
                      {calcOutput.steps.length})
                    </span>
                    <div className="flex gap-2">
                      {revealedSteps < calcOutput.steps.length && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedSteps((prev) =>
                                Math.min(calcOutput.steps.length, prev + 1)
                              )
                            }
                            className="btn-secondary min-h-10 px-3 text-caption"
                          >
                            <Play className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                            Reveal Next Step
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedSteps(calcOutput.steps.length)
                            }
                            className="btn-secondary min-h-10 px-3 text-caption"
                          >
                            Reveal All
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {calcOutput.steps
                      .slice(0, revealedSteps)
                      .map((step) => (
                        <motion.div
                          key={step.step}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: MOTION_DURATION.normal }}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-bg/70 px-3.5 py-2.5 text-sm"
                        >
                          <div>
                            <p className="font-semibold text-ink">
                              Step {step.step}: {step.label}
                            </p>
                            <p className="font-mono text-caption text-muted">
                              {step.formula}
                            </p>
                          </div>
                          <span className="font-mono font-semibold tabular-nums text-accent">
                            {step.value}
                          </span>
                        </motion.div>
                      ))}
                  </AnimatePresence>
                </div>

                <div className="space-y-1 border-t border-border/60 pt-3 text-caption text-muted">
                  <p className="font-semibold text-ink">Assumptions</p>
                  <ul className="list-disc pl-5">
                    {calcOutput.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                  <p className="pt-1">
                    Verify against your adopted code. Not legal advice.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        /* Randomized Calc Practice Mode */
        <section className="bento-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-caption uppercase tracking-wider text-accent">
                Deterministic Practice Generator
              </span>
              <h2 className="text-h2 text-ink">
                Randomized {CALC_TABS.find((t) => t.id === activeCalc)?.label} Drill
              </h2>
            </div>
            <button
              type="button"
              onClick={handleGeneratePractice}
              className="btn-secondary min-h-12 px-3.5 text-sm"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              New Randomized Problem
            </button>
          </div>

          {calcError && (
            <div
              role="alert"
              className="rounded-xl border border-error/60 bg-error/10 p-4 text-sm text-ink"
            >
              {calcError}
            </div>
          )}

          {practiceQ && (
            <div className="space-y-4">
              <p className="text-h3 text-ink">{practiceQ.stem}</p>

              <div role="radiogroup" aria-label="Calculator options" className="space-y-2">
                {practiceQ.options.map((opt, idx) => (
                  <RadioCard
                    key={`${practiceQ.id}-${idx}`}
                    label={opt}
                    optionIndex={idx}
                    selected={practiceSelected === idx}
                    revealed={practiceGrade !== null}
                    isCorrectOption={idx === practiceQ.correct_index}
                    disabled={practiceGrade !== null}
                    onSelect={() => setPracticeSelected(idx)}
                  />
                ))}
              </div>

              {practiceGrade && (
                <div
                  role="status"
                  className={`space-y-2 rounded-xl border p-4 text-sm ${
                    practiceGrade.isCorrect
                      ? "border-success/50 bg-success/10"
                      : "border-error/50 bg-error/10"
                  }`}
                >
                  <p className="inline-flex items-center gap-2 font-semibold text-ink">
                    {practiceGrade.isCorrect ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-success" strokeWidth={1.75} aria-hidden="true" />
                        Correct ({practiceQ.options[practiceQ.correct_index]})
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-error" strokeWidth={1.75} aria-hidden="true" />
                        Incorrect — Authoritative answer:{" "}
                        {practiceQ.options[practiceQ.correct_index]}
                      </>
                    )}
                  </p>
                  {practiceGrade.authoritativeOutput.steps.map((s) => (
                    <p key={s.step} className="font-mono text-caption text-muted">
                      {s.step}. {s.label}: {s.formula} = {s.value}
                    </p>
                  ))}
                  <p className="text-caption text-muted">
                    Ref: {practiceQ.code_ref} · Verify against your adopted code. Not legal advice.
                  </p>
                </div>
              )}

              <QuestionReviewBar
                questionId={practiceQ.id}
                reviewedAt={
                  tables.find(
                    (t) =>
                      t.code_family === practiceQ.code_family &&
                      t.edition === practiceQ.edition
                  )?.verified_at ?? activeJurisdiction.last_verified_at
                }
                codeFamily={practiceQ.code_family}
                edition={practiceQ.edition}
                codeRef={practiceQ.code_ref}
                compact
              />

              <div className="flex justify-end">
                {practiceGrade === null ? (
                  <button
                    type="button"
                    disabled={practiceSelected === null}
                    onClick={handleCheckPractice}
                    className="btn-primary"
                  >
                    Grade with Calculator
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGeneratePractice}
                    className="btn-primary"
                  >
                    Next Randomized Problem
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
