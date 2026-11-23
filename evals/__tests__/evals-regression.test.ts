import { describe, expect, it } from "vitest";
import { EVAL_THRESHOLDS, runExplainEvals } from "../runner";

describe("Bendline AI explain 100-case regression evals", () => {
  it("passes all 100 eval cases with zero verbatim, invented-citation, or unbacked-calc violations", async () => {
    const report = await runExplainEvals();

    expect(report.failures).toEqual([]);
    expect(report.totalCases).toBe(EVAL_THRESHOLDS.expectedCaseCount);
    expect(report.schemaAndNoticePassRate).toBe(
      EVAL_THRESHOLDS.minSchemaAndNoticePassRate
    );
    expect(report.sectionPointerValidityRate).toBe(
      EVAL_THRESHOLDS.minSectionPointerValidityRate
    );
    expect(report.verbatimViolationCount).toBe(
      EVAL_THRESHOLDS.maxVerbatimViolations
    );
    expect(report.inventedCitationCount).toBe(
      EVAL_THRESHOLDS.maxInventedCitations
    );
    expect(report.unbackedCalcNumberCount).toBe(
      EVAL_THRESHOLDS.maxUnbackedCalcNumbers
    );
    expect(report.insufficientContextViolationCount).toBe(
      EVAL_THRESHOLDS.maxInsufficientContextViolations
    );
    expect(report.errorTypeAccuracy).toBeGreaterThanOrEqual(
      EVAL_THRESHOLDS.minErrorTypeAccuracy
    );
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
  });
});
