import { z } from "zod";

export const AI_ERROR_TAG_VALUES = [
  "concept",
  "lookup",
  "arithmetic",
  "misread",
  "edition_confusion",
  "unit",
] as const;

export const aiErrorTagSchema = z.enum(AI_ERROR_TAG_VALUES);

const FORBIDDEN_OPTION_PATTERN =
  /\b(all of the above|none of the above|both [a-d] and [a-d])\b/i;

export const draftQuestionOutputSchema = z
  .object({
    stem: z.string().trim().min(15),
    options: z.tuple([
      z.string().trim().min(1),
      z.string().trim().min(1),
      z.string().trim().min(1),
      z.string().trim().min(1),
    ]),
    correct_index: z.number().int().min(0).max(3),
    explanation_seed: z.string().trim().min(15),
    code_ref: z.string().trim().min(3),
    difficulty: z.number().int().min(1).max(5),
    type: z.enum(["mcq", "calc", "lookup", "scenario"]),
    error_tags: z.array(aiErrorTagSchema).min(1),
    needs_review: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    for (const opt of val.options) {
      if (FORBIDDEN_OPTION_PATTERN.test(opt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Options must not use "all of the above" or "none of the above".',
          path: ["options"],
        });
      }
    }

    if (
      val.type === "calc" &&
      !val.needs_review &&
      !/\{\{[A-Z0-9_]+\}\}/.test(val.stem) &&
      !/\{\{[A-Z0-9_]+\}\}/.test(val.explanation_seed)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Calc draft items must use {{VALUE}} placeholders populated from verified tables or set needs_review: true.",
        path: ["stem"],
      });
    }
  });

export type DraftQuestionOutput = z.infer<typeof draftQuestionOutputSchema>;

const scoreScale = z.number().int().min(1).max(5);

export const skepticalReviewOutputSchema = z.object({
  id: z.string().min(1),
  scores: z.object({
    key_accuracy: scoreScale,
    distractors: scoreScale,
    edition_fit: scoreScale,
    clarity: scoreScale,
    source_support: scoreScale,
    blueprint_difficulty: scoreScale,
    explanation: scoreScale,
    language_fairness: scoreScale,
  }),
  verdict: z.enum(["pass", "revise", "reject"]),
  issues: z.array(z.string()),
  suggested_fix: z.string(),
});

export type SkepticalReviewOutput = z.infer<typeof skepticalReviewOutputSchema>;

export function createDraftDrawingExerciseSchema(
  allowedRuleKeys: readonly string[]
) {
  const allowedSet = new Set(allowedRuleKeys);

  return z
    .object({
      title: z.string().trim().min(5),
      prompt_md: z.string().trim().min(15),
      fixtures: z
        .array(
          z.object({
            type: z.enum([
              "wc",
              "lav",
              "sink",
              "shower",
              "floor_drain",
              "water_heater",
            ]),
            grid_pos: z.tuple([z.number(), z.number(), z.number()]),
          })
        )
        .min(1),
      pipe_system: z.enum(["dwv", "vent", "supply"]),
      constraints: z.array(z.string().trim().min(3)).min(1),
      scoring_rubric: z
        .array(
          z.object({
            criterion: z.string().trim().min(3),
            points: z.number().int().positive(),
            rule_key: z.string().trim().min(1),
          })
        )
        .min(1),
    })
    .superRefine((val, ctx) => {
      val.scoring_rubric.forEach((item, idx) => {
        if (!allowedSet.has(item.rule_key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `rule_key "${item.rule_key}" does not exist in drawing_rules.`,
            path: ["scoring_rubric", idx, "rule_key"],
          });
        }
      });
    });
}
