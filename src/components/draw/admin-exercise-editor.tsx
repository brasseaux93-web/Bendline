"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Save } from "lucide-react";
import { useAppState } from "@/components/providers/app-state-provider";
import type { CodeFamily } from "@/lib/domain/types";
import {
  DRAWING_RULE_KEYS,
  type DrawPipeSystem,
  type DrawingExerciseConfig,
  type DrawingRuleRow,
  SAMPLE_DRAWING_EXERCISES,
} from "@/lib/draw";
import { getOfflineDb } from "@/lib/offline/db";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function AdminExerciseEditor() {
  const { jurisdictions, profile } = useAppState();

  const [jurisdictionId, setJurisdictionId] = useState<string>(
    jurisdictions[0]?.id ?? ""
  );
  const [title, setTitle] = useState<string>(SAMPLE_DRAWING_EXERCISES[0].title);
  const [promptMd, setPromptMd] = useState<string>(
    SAMPLE_DRAWING_EXERCISES[0].prompt_md
  );
  const [pipeSystem, setPipeSystem] = useState<DrawPipeSystem>("dwv");
  const [codeFamily, setCodeFamily] = useState<CodeFamily>("IPC");
  const [edition, setEdition] = useState<string>("2021");
  const [fixturesJson, setFixturesJson] = useState<string>(() =>
    JSON.stringify(SAMPLE_DRAWING_EXERCISES[0].fixtures, null, 2)
  );
  const [rubricJson, setRubricJson] = useState<string>(() =>
    JSON.stringify(SAMPLE_DRAWING_EXERCISES[0].scoring_rubric, null, 2)
  );

  // Review & publish metadata
  const [status, setStatus] = useState<
    "draft" | "reviewed" | "published" | "flagged"
  >("draft");
  const [reviewerLicenseNo, setReviewerLicenseNo] = useState<string>("");
  const [reviewComments, setReviewComments] = useState<string>("");
  const [exerciseMsg, setExerciseMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Verified drawing_rules editor
  const [ruleKey, setRuleKey] = useState<string>(DRAWING_RULE_KEYS[0]);
  const [ruleCodeRef, setRuleCodeRef] = useState<string>("");
  const [ruleDescription, setRuleDescription] = useState<string>("");
  const [ruleParamsJson, setRuleParamsJson] = useState<string>(
    '{"min_slope_in_per_ft": 0.25}'
  );
  const [ruleMsg, setRuleMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  useEffect(() => {
    const selectedJur = jurisdictions.find((j) => j.id === jurisdictionId);
    if (selectedJur) {
      setCodeFamily(selectedJur.code_family);
      setEdition(selectedJur.edition);
    }
  }, [jurisdictionId, jurisdictions]);

  async function handleSaveExercise(e: React.FormEvent) {
    e.preventDefault();
    setExerciseMsg(null);

    let parsedFixtures: DrawingExerciseConfig["fixtures"];
    let parsedRubric: Record<string, number>;
    try {
      parsedFixtures = JSON.parse(fixturesJson);
      parsedRubric = JSON.parse(rubricJson);
      if (!Array.isArray(parsedFixtures)) {
        throw new Error("fixtures must be a JSON array.");
      }
    } catch (err) {
      setExerciseMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Invalid JSON input.",
      });
      return;
    }

    if (status === "published" && reviewerLicenseNo.trim().length === 0) {
      setExerciseMsg({
        ok: false,
        text: "Publishing requires a verified reviewer license number and review sign-off.",
      });
      return;
    }

    const record: DrawingExerciseConfig = {
      id: crypto.randomUUID(),
      jurisdiction_id: jurisdictionId,
      title: title.trim(),
      prompt_md: promptMd.trim(),
      fixtures: parsedFixtures,
      pipe_system: pipeSystem,
      constraints: {},
      scoring_rubric: parsedRubric,
      status,
      reviewer_id: status === "published" ? profile.id : null,
      reviewed_at: status === "published" ? new Date().toISOString() : null,
      code_family: codeFamily,
      edition: edition.trim(),
    };

    const db = getOfflineDb();
    if (db) {
      await db.drawingExercises.put(record);
    }

    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { error } = await supabase.from("drawing_exercises").insert({
          id: record.id,
          jurisdiction_id: record.jurisdiction_id,
          title: record.title,
          prompt_md: record.prompt_md,
          fixtures: record.fixtures,
          pipe_system: record.pipe_system,
          constraints: { review_comments: reviewComments },
          scoring_rubric: record.scoring_rubric,
          status: record.status,
          reviewer_id: status === "published" ? userData.user.id : null,
          reviewed_at: status === "published" ? new Date().toISOString() : null,
          code_family: record.code_family,
          edition: record.edition,
        });
        if (error) {
          setExerciseMsg({ ok: false, text: error.message });
          return;
        }
      }
    }

    setExerciseMsg({
      ok: true,
      text: `Saved drawing exercise "${record.title}" (${record.status}).`,
    });
  }

  async function handleSaveRule(e: React.FormEvent) {
    e.preventDefault();
    setRuleMsg(null);

    let parsedParams: Record<string, unknown>;
    try {
      parsedParams = JSON.parse(ruleParamsJson);
      if (
        typeof parsedParams !== "object" ||
        parsedParams === null ||
        Array.isArray(parsedParams)
      ) {
        throw new Error("params must be a JSON object.");
      }
    } catch (err) {
      setRuleMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Invalid rule params JSON.",
      });
      return;
    }

    const row: DrawingRuleRow = {
      id: `${codeFamily}::${edition}::${ruleKey}`,
      code_family: codeFamily,
      edition: edition.trim(),
      rule_key: ruleKey,
      description_paraphrased:
        ruleDescription.trim() || `Verified ${ruleKey} rule for ${codeFamily} ${edition}`,
      params: parsedParams,
      code_ref: ruleCodeRef.trim() || `${codeFamily} ${edition}`,
    };

    const db = getOfflineDb();
    if (db) {
      await db.drawingRules.put({
        ...row,
        id: `${row.code_family}::${row.edition}::${row.rule_key}`,
      });
    }

    const supabase = createBrowserSupabaseClient();
    if (supabase) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { error } = await supabase.from("drawing_rules").upsert(
          {
            code_family: row.code_family,
            edition: row.edition,
            rule_key: row.rule_key,
            description_paraphrased: row.description_paraphrased,
            params: row.params,
            code_ref: row.code_ref,
          },
          { onConflict: "code_family,edition,rule_key" }
        );
        if (error) {
          setRuleMsg({ ok: false, text: error.message });
          return;
        }
      }
    }

    setRuleMsg({
      ok: true,
      text: `Saved drawing rule "${row.rule_key}" for ${row.code_family} ${row.edition}.`,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/draw"
            className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Back to Drawing Lab
          </Link>
          <h1 className="text-h1 text-ink">
            Drawing Exercises &amp; Rules Admin
          </h1>
        </div>
        <Link
          href="/admin/review"
          className="btn-secondary min-h-12 px-3.5 text-sm"
        >
          Open Review Studio (/admin/review)
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Exercise & Review Form */}
        <form
          onSubmit={handleSaveExercise}
          className="bento-card space-y-4 lg:col-span-7"
        >
          <h2 className="text-h2 text-ink">
            Author &amp; Review Drawing Exercise
          </h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="admin-jur" className="block text-sm font-medium text-ink">
                Jurisdiction
              </label>
              <select
                id="admin-jur"
                value={jurisdictionId}
                onChange={(e) => setJurisdictionId(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
              >
                {jurisdictions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.state} — {j.name} ({j.code_family} {j.edition})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="admin-sys" className="block text-sm font-medium text-ink">
                Pipe System
              </label>
              <select
                id="admin-sys"
                value={pipeSystem}
                onChange={(e) => setPipeSystem(e.target.value as DrawPipeSystem)}
                className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
              >
                <option value="dwv">DWV</option>
                <option value="vent">Vent</option>
                <option value="supply">Supply</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="admin-title" className="block text-sm font-medium text-ink">
              Exercise title
            </label>
            <input
              id="admin-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-base text-ink"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="admin-prompt" className="block text-sm font-medium text-ink">
              Prompt instructions
            </label>
            <textarea
              id="admin-prompt"
              rows={2}
              required
              value={promptMd}
              onChange={(e) => setPromptMd(e.target.value)}
              className="w-full rounded-xl border border-border bg-elevated p-3 text-sm text-ink"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="admin-fixtures" className="block text-caption text-muted">
                Fixtures JSON array
              </label>
              <textarea
                id="admin-fixtures"
                rows={5}
                value={fixturesJson}
                onChange={(e) => setFixturesJson(e.target.value)}
                className="w-full rounded-xl border border-border bg-elevated p-2.5 font-mono text-xs text-ink"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="admin-rubric" className="block text-caption text-muted">
                State scoring_rubric JSON (points per rule_key)
              </label>
              <textarea
                id="admin-rubric"
                rows={5}
                value={rubricJson}
                onChange={(e) => setRubricJson(e.target.value)}
                className="w-full rounded-xl border border-border bg-elevated p-2.5 font-mono text-xs text-ink"
              />
            </div>
          </div>

          {/* Review Form Section */}
          <div className="space-y-3 rounded-xl border border-border/70 bg-bg/60 p-3.5">
            <h3 className="text-h3 text-ink">Licensed Plumber Review Sign-Off</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="admin-status" className="block text-caption text-muted">
                  Lifecycle status
                </label>
                <select
                  id="admin-status"
                  value={status}
                  onChange={(e) =>
                    setStatus(
                      e.target.value as
                        | "draft"
                        | "reviewed"
                        | "published"
                        | "flagged"
                    )
                  }
                  className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
                >
                  <option value="draft">draft</option>
                  <option value="reviewed">reviewed</option>
                  <option value="published">published</option>
                  <option value="flagged">flagged</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="admin-license" className="block text-caption text-muted">
                  Reviewer license #
                </label>
                <input
                  id="admin-license"
                  type="text"
                  value={reviewerLicenseNo}
                  onChange={(e) => setReviewerLicenseNo(e.target.value)}
                  placeholder="e.g. TX-MP-40921"
                  className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-sm text-ink"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="admin-comments" className="block text-caption text-muted">
                Review notes
              </label>
              <input
                id="admin-comments"
                type="text"
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder="Confirm alignment with state amendments..."
                className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
              />
            </div>
          </div>

          {exerciseMsg && (
            <p
              role="status"
              className={`flex items-center gap-2 text-sm ${
                exerciseMsg.ok ? "text-success" : "text-error"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {exerciseMsg.text}
            </p>
          )}

          <button type="submit" className="btn-primary w-full">
            <Save className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Save Exercise &amp; Review
          </button>
        </form>

        {/* Drawing Rules Editor */}
        <form
          onSubmit={handleSaveRule}
          className="bento-card space-y-4 lg:col-span-5"
        >
          <h2 className="text-h2 text-ink">Verified drawing_rules</h2>
          <p className="text-sm text-muted">
            Numeric limits in <code className="font-mono">params</code> power <code className="font-mono">/lib/draw/grade.ts</code>. Unconfigured keys remain excluded from grading.
          </p>

          <div className="space-y-1">
            <label htmlFor="rule-key-select" className="block text-sm font-medium text-ink">
              rule_key
            </label>
            <select
              id="rule-key-select"
              value={ruleKey}
              onChange={(e) => setRuleKey(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 font-mono text-sm text-ink"
            >
              {DRAWING_RULE_KEYS.map((rk) => (
                <option key={rk} value={rk}>
                  {rk}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="rule-code-ref" className="block text-sm font-medium text-ink">
              code_ref ({codeFamily} {edition})
            </label>
            <input
              id="rule-code-ref"
              type="text"
              value={ruleCodeRef}
              onChange={(e) => setRuleCodeRef(e.target.value)}
              placeholder="e.g. IPC Table 704.1"
              className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="rule-desc" className="block text-sm font-medium text-ink">
              Paraphrased description
            </label>
            <input
              id="rule-desc"
              type="text"
              value={ruleDescription}
              onChange={(e) => setRuleDescription(e.target.value)}
              placeholder="Original paraphrased rule requirement..."
              className="min-h-12 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-ink"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="rule-params" className="block text-caption text-muted">
              params JSON (verified numeric limits)
            </label>
            <textarea
              id="rule-params"
              rows={5}
              value={ruleParamsJson}
              onChange={(e) => setRuleParamsJson(e.target.value)}
              className="w-full rounded-xl border border-border bg-elevated p-3 font-mono text-xs text-ink"
            />
          </div>

          {ruleMsg && (
            <p
              role="status"
              className={`text-sm ${ruleMsg.ok ? "text-success" : "text-error"}`}
            >
              {ruleMsg.text}
            </p>
          )}

          <button type="submit" className="btn-secondary w-full">
            Save Verified Drawing Rule
          </button>
        </form>
      </div>
    </div>
  );
}
