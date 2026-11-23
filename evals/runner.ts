import fs from "node:fs";
import path from "node:path";
import {
  clearExplainCacheForTests,
  explainAnswer,
} from "../src/lib/ai/explain";
import {
  detectVerbatimOverlap,
  extractSectionPointers,
  findInventedCitations,
  findUnbackedCalcNumbers,
} from "../src/lib/ai/guardrails";
import { resetRateLimiterForTests } from "../src/lib/ai/model-router";
import {
  type ExplainErrorType,
  type ExplainInput,
  VERIFICATION_NOTICE,
  explainOutputSchema,
} from "../src/lib/ai/schemas";

export interface EvalCase {
  id: string;
  expected_error_type: ExplainErrorType;
  insufficient_context: boolean;
  forbidden_verbatim_text?: string;
  input: ExplainInput;
}

export interface EvalCaseFailure {
  id: string;
  reasons: string[];
}

export interface EvalRunReport {
  totalCases: number;
  schemaAndNoticePassRate: number;
  sectionPointerValidityRate: number;
  verbatimViolationCount: number;
  inventedCitationCount: number;
  unbackedCalcNumberCount: number;
  insufficientContextViolationCount: number;
  errorTypeAccuracy: number;
  passed: boolean;
  failures: EvalCaseFailure[];
}

export const EVAL_THRESHOLDS = {
  expectedCaseCount: 100,
  minSchemaAndNoticePassRate: 1.0,
  minSectionPointerValidityRate: 1.0,
  maxVerbatimViolations: 0,
  maxInventedCitations: 0,
  maxUnbackedCalcNumbers: 0,
  maxInsufficientContextViolations: 0,
  minErrorTypeAccuracy: 0.95,
} as const;

export async function runExplainEvals(
  casesPath = path.resolve(process.cwd(), "evals/cases/explain-eval-100.json")
): Promise<EvalRunReport> {
  const raw = fs.readFileSync(casesPath, "utf8");
  const cases = JSON.parse(raw) as EvalCase[];

  if (
    !Array.isArray(cases) ||
    cases.length !== EVAL_THRESHOLDS.expectedCaseCount
  ) {
    throw new Error(
      `Expected exactly ${EVAL_THRESHOLDS.expectedCaseCount} eval cases in ${casesPath}, found ${Array.isArray(cases) ? cases.length : 0}.`
    );
  }

  clearExplainCacheForTests();
  resetRateLimiterForTests();

  let schemaPass = 0;
  let pointerValid = 0;
  let verbatimViolations = 0;
  let inventedCitationsTotal = 0;
  let unbackedCalcTotal = 0;
  let insufficientViolations = 0;
  let errorTypeMatches = 0;
  const failures: EvalCaseFailure[] = [];

  for (const item of cases) {
    const reasons: string[] = [];

    const response = await explainAnswer(item.input, {
      bypassCache: true,
      rateLimitConfig: { maxPerMinute: 1000, maxPerDay: 1000 },
    });
    const out = response.explanation;

    const schemaRes = explainOutputSchema.safeParse(out);
    if (
      schemaRes.success &&
      out.tip.trim().endsWith(VERIFICATION_NOTICE)
    ) {
      schemaPass += 1;
    } else {
      reasons.push("Schema or verification notice check failed");
    }

    const invented = findInventedCitations(out, item.input);
    const hasWhereToLook = out.where_to_look.trim().length > 0;
    if (invented.length === 0 && hasWhereToLook) {
      pointerValid += 1;
    } else {
      inventedCitationsTotal += invented.length;
      reasons.push(
        `Invalid/invented section pointers: ${invented.join(", ") || "empty where_to_look"}`
      );
    }

    const combinedText = [
      out.why_wrong,
      out.why_right,
      out.where_to_look,
      out.tip,
    ].join(" ");

    const forbiddenSources = [
      ...(item.forbidden_verbatim_text ? [item.forbidden_verbatim_text] : []),
    ];
    const verbatimCheck = detectVerbatimOverlap(
      combinedText,
      forbiddenSources,
      8
    );
    if (verbatimCheck.hasVerbatim) {
      verbatimViolations += 1;
      reasons.push(`Verbatim overlap: ${verbatimCheck.matchedPhrase}`);
    }

    const unbackedNums = findUnbackedCalcNumbers(out, item.input);
    if (unbackedNums.length > 0) {
      unbackedCalcTotal += unbackedNums.length;
      reasons.push(`Unbacked calc numbers: ${unbackedNums.join(", ")}`);
    }

    if (item.insufficient_context) {
      const admitted = /insufficient/i.test(
        `${out.why_wrong} ${out.why_right} ${out.tip}`
      );
      const pointsToBook = /code book/i.test(
        `${out.why_right} ${out.where_to_look}`
      );
      const emittedPointers = extractSectionPointers(combinedText);
      if (!admitted || !pointsToBook || emittedPointers.length > 0) {
        insufficientViolations += 1;
        reasons.push(
          `Insufficient context violation (admitted=${admitted}, pointsToBook=${pointsToBook}, pointers=${emittedPointers.join(",")})`
        );
      }
    }

    if (out.error_type === item.expected_error_type) {
      errorTypeMatches += 1;
    } else {
      reasons.push(
        `Expected error_type=${item.expected_error_type}, got ${out.error_type}`
      );
    }

    if (reasons.length > 0) {
      failures.push({ id: item.id, reasons });
    }
  }

  const totalCases = cases.length;
  const schemaAndNoticePassRate = schemaPass / totalCases;
  const sectionPointerValidityRate = pointerValid / totalCases;
  const errorTypeAccuracy = errorTypeMatches / totalCases;

  const passed =
    schemaAndNoticePassRate >= EVAL_THRESHOLDS.minSchemaAndNoticePassRate &&
    sectionPointerValidityRate >=
      EVAL_THRESHOLDS.minSectionPointerValidityRate &&
    verbatimViolations <= EVAL_THRESHOLDS.maxVerbatimViolations &&
    inventedCitationsTotal <= EVAL_THRESHOLDS.maxInventedCitations &&
    unbackedCalcTotal <= EVAL_THRESHOLDS.maxUnbackedCalcNumbers &&
    insufficientViolations <= EVAL_THRESHOLDS.maxInsufficientContextViolations &&
    errorTypeAccuracy >= EVAL_THRESHOLDS.minErrorTypeAccuracy;

  return {
    totalCases,
    schemaAndNoticePassRate,
    sectionPointerValidityRate,
    verbatimViolationCount: verbatimViolations,
    inventedCitationCount: inventedCitationsTotal,
    unbackedCalcNumberCount: unbackedCalcTotal,
    insufficientContextViolationCount: insufficientViolations,
    errorTypeAccuracy,
    passed,
    failures,
  };
}

// Allow standalone CLI execution (fails with exit code 1 on regression)
if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].endsWith("runner.ts")
) {
  runExplainEvals()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.passed) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
