import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  detectVerbatimOverlap,
  findInventedCitations,
  findUnbackedCalcNumbers,
  getMatchingChunks,
  hasSufficientContext,
} from "./guardrails";
import {
  type ExplainModelTier,
  type RateLimitConfig,
  checkPerUserRateLimit,
  selectExplainModel,
} from "./model-router";
import {
  type ExplainErrorType,
  type ExplainInput,
  type ExplainOutput,
  PROMPT_VERSION,
  VERIFICATION_NOTICE,
  explainInputSchema,
  explainOutputSchema,
} from "./schemas";

if (typeof window !== "undefined") {
  throw new Error("src/lib/ai/explain.ts is strictly server-only.");
}

export class ExplainGuardrailError extends Error {
  readonly violations: string[];

  constructor(message: string, violations: string[]) {
    super(message);
    this.name = "ExplainGuardrailError";
    this.violations = violations;
  }
}

export interface ExplainResponse {
  explanation: ExplainOutput;
  meta: {
    cached: boolean;
    cacheKey: string;
    modelTier: ExplainModelTier;
    modelUsed: string;
    promptVersion: string;
  };
}

export type ExplainLlmAdapter = (params: {
  input: ExplainInput;
  model: string;
  tier: ExplainModelTier;
}) => Promise<unknown>;

export interface ExplainOptions {
  llmAdapter?: ExplainLlmAdapter;
  strictLlmGuardrails?: boolean;
  rateLimitConfig?: RateLimitConfig;
  nowMs?: number;
  bypassCache?: boolean;
}

interface CachedExplainRecord {
  payload: ExplainOutput;
  modelUsed: string;
  tier: ExplainModelTier;
}

const globalForExplainCache = globalThis as unknown as {
  __bendlineExplainCache?: Map<string, CachedExplainRecord>;
};

function getExplainCache(): Map<string, CachedExplainRecord> {
  if (!globalForExplainCache.__bendlineExplainCache) {
    globalForExplainCache.__bendlineExplainCache = new Map();
  }
  return globalForExplainCache.__bendlineExplainCache;
}

export function clearExplainCacheForTests(): void {
  getExplainCache().clear();
}

export function buildExplainCacheKey(params: {
  question_id: string;
  answer: string;
  code_family: "IPC" | "UPC";
  edition: string;
  prompt_version: string;
}): string {
  const normAnswer = params.answer.trim().toLowerCase();
  return `${params.question_id}::${normAnswer}::${params.code_family}::${params.edition.trim()}::${params.prompt_version}`;
}

function parseFirstNumericWithUnit(text: string): {
  value: number;
  unit: string;
} | null {
  const m = text
    .trim()
    .match(/(-?\d+(?:\.\d+)?)\s*(inches|inch|in\.?|feet|foot|ft\.?|psi|gpm|cfh|btuh|btu\/h|dfu|wsfu|%|in\/ft)?/i);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const rawUnit = (m[2] ?? "").toLowerCase().replace(/\.$/, "");
  const unitAlias: Record<string, string> = {
    inch: "in",
    inches: "in",
    in: "in",
    foot: "ft",
    feet: "ft",
    ft: "ft",
    "btu/h": "btuh",
    btuh: "btuh",
  };
  return {
    value,
    unit: unitAlias[rawUnit] ?? rawUnit,
  };
}

export function classifyErrorType(input: ExplainInput): ExplainErrorType {
  const stemLower = input.question.stem.toLowerCase();
  const userLower = input.user_answer.toLowerCase();
  const correctLower = input.correct_answer.toLowerCase();
  const seedLower = input.explanation_seed.toLowerCase();

  // 1. Edition / Code-Family Confusion
  const mismatchedChunks = input.retrieved_chunks.filter(
    (c) =>
      c.code_family !== input.code_family ||
      c.edition.trim() !== input.edition.trim()
  );
  const mentionsOtherFamily =
    (input.code_family === "IPC" && /\bupc\b/.test(userLower)) ||
    (input.code_family === "UPC" && /\bipc\b/.test(userLower)) ||
    mismatchedChunks.some((c) => {
      const chunkWords = c.paraphrased_text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length >= 4);
      const userWords = userLower.split(/\W+/).filter((w) => w.length >= 4);
      return (
        userWords.length > 0 &&
        userWords.some((uw) => chunkWords.includes(uw)) &&
        !correctLower.includes(userWords[0])
      );
    }) ||
    /\b(?:upc|ipc|edition|2018|2021|2024)\b/.test(userLower) ||
    (seedLower.includes("unlike") &&
      (seedLower.includes("upc") || seedLower.includes("ipc")));

  if (mentionsOtherFamily) {
    return "edition_confusion";
  }

  // 2. Unit Mismatch
  const userNum = parseFirstNumericWithUnit(input.user_answer);
  const correctNum = parseFirstNumericWithUnit(input.correct_answer);
  if (userNum && correctNum) {
    if (
      userNum.unit.length > 0 &&
      correctNum.unit.length > 0 &&
      userNum.unit !== correctNum.unit
    ) {
      return "unit";
    }
    // Check common unit conversion factors (inches<->feet 12x, head<->psi 2.31x / 0.433x, BTU<->CFH 1000x)
    const ratio =
      correctNum.value !== 0 ? userNum.value / correctNum.value : 0;
    const isUnitScale =
      Math.abs(ratio - 12) < 0.15 ||
      Math.abs(ratio - 1 / 12) < 0.01 ||
      Math.abs(ratio - 1000) < 10 ||
      Math.abs(ratio - 0.001) < 0.0002;
    if (isUnitScale) {
      return "unit";
    }
  }
  if (
    /\b(feet|foot|inches|inch|psi|gpm|cfh|btu|wsfu|dfu)\b/.test(userLower) &&
    /\b(feet|foot|inches|inch|psi|gpm|cfh|btu|wsfu|dfu)\b/.test(correctLower) &&
    userNum?.unit !== correctNum?.unit
  ) {
    return "unit";
  }

  // 3. Misread Stem Constraint / Negation
  const hasNegationOrConstraint =
    /\b(not|never|except|incorrect|prohibited|upstream|downstream|secondary|excluding|least|false)\b/.test(
      stemLower
    );
  if (
    hasNegationOrConstraint &&
    !input.calc_context &&
    input.question.type !== "calc"
  ) {
    return "misread";
  }

  // 4. Arithmetic Error (deterministic calc items)
  if (input.question.type === "calc" || Boolean(input.calc_context)) {
    return "arithmetic";
  }

  // 5. Table / Code Lookup Error
  const looksLikeLookup =
    input.question.type === "lookup" ||
    /\b(table|schedule|chart|maximum|minimum|spacing|allowance)\b/i.test(
      `${input.question.code_ref} ${input.explanation_seed}`
    );
  if (looksLikeLookup) {
    return "lookup";
  }

  // 6. Concept Error
  return "concept";
}

function summarizeWithoutLongVerbatim(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) return "";
  // Break long phrases into concise paraphrased clauses so raw spans aren't echoed verbatim
  const clauses = cleaned
    .split(/[.;]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (clauses.length === 0) return cleaned;
  return clauses.slice(0, 2).join(" — ");
}

function buildWhereToLook(input: ExplainInput): string {
  const matchingChunks = getMatchingChunks(input);
  const refs = Array.from(
    new Set(
      [
        input.question.code_ref.trim(),
        ...matchingChunks.map((c) => c.code_ref.trim()),
      ].filter(Boolean)
    )
  );

  if (refs.length === 0) {
    return `Check the ${input.code_family} ${input.edition} code book index for ${input.question.topic_title ?? "this topic"}.`;
  }
  return `Look up ${refs.join(" and ")} in your adopted ${input.code_family} ${input.edition} code book.`;
}

function buildTip(errorType: ExplainErrorType, input: ExplainInput): string {
  const baseTips: Record<ExplainErrorType, string> = {
    concept:
      "Trace the hydraulic or venting mechanism before choosing a rule.",
    lookup:
      "Confirm the exact row, slope, or fixture column in the table before selecting a value.",
    arithmetic:
      "Write down each calculation step with its factor before rounding.",
    misread:
      "Re-read constraint words like NOT, upstream, or secondary before picking an option.",
    edition_confusion: `Confirm you are applying ${input.code_family} ${input.edition} rules rather than another code family or year.`,
    unit:
      "Align all dimensions to matching units (in vs ft, BTU/h vs CFH) before comparing choices.",
  };

  return `${baseTips[errorType]} ${VERIFICATION_NOTICE}`;
}

export function synthesizeGroundedExplanation(
  input: ExplainInput
): ExplainOutput {
  const errorType = classifyErrorType(input);
  const followupTopic =
    input.question.topic_slug ??
    input.question.topic_title ??
    "code-fundamentals";
  const matchingChunks = getMatchingChunks(input);

  // Insufficient context branch: admit insufficiency cleanly and point to code book
  if (!hasSufficientContext(input)) {
    const codePointer = input.question.code_ref.trim()
      ? `${input.question.code_ref.trim()} in the ${input.code_family} ${input.edition} code book`
      : `your adopted ${input.code_family} ${input.edition} code book`;

    return {
      why_wrong: `Insufficient retrieved notes to diagnose why "${input.user_answer}" differs from "${input.correct_answer}" under ${input.code_family} ${input.edition}.`,
      why_right: `Insufficient explanation context is currently stored for this item; review the governing rule for "${input.correct_answer}" directly in ${codePointer}.`,
      where_to_look: `Consult ${codePointer}.`,
      tip: `Insufficient context available here — check the official table or section directly. ${VERIFICATION_NOTICE}`,
      followup_topic: followupTopic,
      error_type: errorType,
    };
  }

  // Calc context branch: rely strictly on deterministic result + steps
  if (input.calc_context && input.calc_context.steps.length > 0) {
    const stepLines = input.calc_context.steps
      .map((s) => `Step ${s.step} (${s.label}): ${s.formula} yields ${s.value}`)
      .join("; ");
    const resultSummary = Object.entries(input.calc_context.result)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(", ");

    return {
      why_wrong: `"${input.user_answer}" does not match the deterministic ${input.code_family} ${input.edition} calculation output (${input.correct_answer}), likely due to a ${errorType.replace("_", " ")} slip.`,
      why_right: `Following the verified table steps gives ${input.correct_answer} (${resultSummary}): ${stepLines}.`,
      where_to_look: buildWhereToLook(input),
      tip: buildTip(errorType, input),
      followup_topic: followupTopic,
      error_type: errorType,
    };
  }

  // Standard grounded synthesis from explanation_seed + matching paraphrased chunks
  const seedSummary = summarizeWithoutLongVerbatim(input.explanation_seed);
  const chunkSummary = matchingChunks
    .map((c) => summarizeWithoutLongVerbatim(c.paraphrased_text))
    .filter(Boolean)
    .slice(0, 2)
    .join("; ");

  const groundedCore = [seedSummary, chunkSummary].filter(Boolean).join(" | ");

  const whyWrongByType: Record<ExplainErrorType, string> = {
    concept: `"${input.user_answer}" conflicts with the core plumbing principle for ${input.code_family} ${input.edition}.`,
    lookup: `"${input.user_answer}" corresponds to a different table condition or sizing threshold than this scenario specifies.`,
    arithmetic: `"${input.user_answer}" reflects a calculation mismatch relative to the expected ${input.correct_answer}.`,
    misread: `"${input.user_answer}" overlooks a key qualifying requirement or directional constraint in the question prompt.`,
    edition_confusion: `"${input.user_answer}" reflects a rule from another code edition or family rather than ${input.code_family} ${input.edition}.`,
    unit: `"${input.user_answer}" mixes measurement units or conversion scales compared with ${input.correct_answer}.`,
  };

  return {
    why_wrong: whyWrongByType[errorType],
    why_right: `"${input.correct_answer}" aligns with the grounded ${input.code_family} ${input.edition} rationale: ${groundedCore}.`,
    where_to_look: buildWhereToLook(input),
    tip: buildTip(errorType, input),
    followup_topic: followupTopic,
    error_type: errorType,
  };
}

export async function explainAnswer(
  rawInput: ExplainInput,
  options: ExplainOptions = {}
): Promise<ExplainResponse> {
  const input = explainInputSchema.parse(rawInput);
  const promptVersion = input.promptVersion || PROMPT_VERSION;
  const routing = selectExplainModel(input);
  const cacheKey = buildExplainCacheKey({
    question_id: input.question.id,
    answer: input.user_answer,
    code_family: input.code_family,
    edition: input.edition,
    prompt_version: promptVersion,
  });

  // 1. Check in-memory and Supabase cache
  if (!options.bypassCache) {
    const memHit = getExplainCache().get(cacheKey);
    if (memHit) {
      return {
        explanation: memHit.payload,
        meta: {
          cached: true,
          cacheKey,
          modelTier: memHit.tier,
          modelUsed: memHit.modelUsed,
          promptVersion,
        },
      };
    }

    const supabase = await createServerSupabaseClient();
    if (supabase) {
      try {
        const { data: cachedRow } = await supabase
          .from("ai_explanation_cache")
          .select("payload, model_used")
          .eq("question_id", input.question.id)
          .eq("answer_key", input.user_answer.trim().toLowerCase())
          .eq("code_family", input.code_family)
          .eq("edition", input.edition)
          .eq("prompt_version", promptVersion)
          .maybeSingle();

        if (cachedRow?.payload) {
          const parsedCached = explainOutputSchema.safeParse(cachedRow.payload);
          if (parsedCached.success) {
            getExplainCache().set(cacheKey, {
              payload: parsedCached.data,
              modelUsed: cachedRow.model_used,
              tier: routing.tier,
            });
            return {
              explanation: parsedCached.data,
              meta: {
                cached: true,
                cacheKey,
                modelTier: routing.tier,
                modelUsed: cachedRow.model_used,
                promptVersion,
              },
            };
          }
        }
      } catch {
        // Proceed if cache lookup is unavailable
      }
    }
  }

  // 2. Enforce per-user rate limit on cache misses (prevents LLM quota abuse)
  await checkPerUserRateLimit(
    input.userId,
    options.rateLimitConfig,
    options.nowMs
  );

  // 3. Produce explanation via optional LLM adapter or deterministic grounded synthesizer
  let candidate: ExplainOutput;
  if (options.llmAdapter) {
    const rawLlm = await options.llmAdapter({
      input,
      model: routing.model,
      tier: routing.tier,
    });
    const validated = explainOutputSchema.safeParse(rawLlm);
    const violations: string[] = [];

    if (!validated.success) {
      violations.push("INVALID_ZOD_OUTPUT");
    } else {
      const invented = findInventedCitations(validated.data, input);
      if (invented.length > 0) {
        violations.push(`INVENTED_CITATIONS:${invented.join(",")}`);
      }
      const unbackedNums = findUnbackedCalcNumbers(validated.data, input);
      if (unbackedNums.length > 0) {
        violations.push(`UNBACKED_NUMBERS:${unbackedNums.join(",")}`);
      }
      const verbatim = detectVerbatimOverlap(
        [
          validated.data.why_wrong,
          validated.data.why_right,
          validated.data.where_to_look,
          validated.data.tip,
        ].join(" "),
        input.retrieved_chunks.map((c) => c.paraphrased_text),
        10
      );
      if (verbatim.hasVerbatim) {
        violations.push(`VERBATIM_CHUNK:${verbatim.matchedPhrase}`);
      }
    }

    if (violations.length > 0) {
      if (options.strictLlmGuardrails) {
        throw new ExplainGuardrailError(
          `LLM output violated grounding rules: ${violations.join("; ")}`,
          violations
        );
      }
      candidate = synthesizeGroundedExplanation(input);
    } else {
      candidate = validated.data!;
    }
  } else {
    candidate = synthesizeGroundedExplanation(input);
  }

  const finalOutput = explainOutputSchema.parse(candidate);

  // 4. Write to cache and persist error_type on attempt when configured
  getExplainCache().set(cacheKey, {
    payload: finalOutput,
    modelUsed: routing.model,
    tier: routing.tier,
  });

  const supabase = await createServerSupabaseClient();
  if (supabase) {
    try {
      await supabase.from("ai_explanation_cache").upsert(
        {
          question_id: input.question.id,
          answer_key: input.user_answer.trim().toLowerCase(),
          code_family: input.code_family,
          edition: input.edition,
          prompt_version: promptVersion,
          model_used: routing.model,
          payload: finalOutput,
        },
        {
          onConflict:
            "question_id,answer_key,code_family,edition,prompt_version",
        }
      );

      if (input.attemptId) {
        await supabase
          .from("attempts")
          .update({ error_type: finalOutput.error_type })
          .eq("id", input.attemptId)
          .eq("user_id", input.userId);
      }
    } catch {
      // Never log user narratives/answers or leak DB errors into response
    }
  }

  return {
    explanation: finalOutput,
    meta: {
      cached: false,
      cacheKey,
      modelTier: routing.tier,
      modelUsed: routing.model,
      promptVersion,
    },
  };
}
