import { z } from "zod";

export const PROMPT_VERSION = "explain-v1.0.0" as const;

export const VERIFICATION_NOTICE =
  "Verify against your adopted code. Not legal advice." as const;

export const ERROR_TYPES = [
  "concept",
  "lookup",
  "arithmetic",
  "misread",
  "edition_confusion",
  "unit",
] as const;

export type ExplainErrorType = (typeof ERROR_TYPES)[number];

export const retrievedChunkSchema = z.object({
  id: z.string().min(1),
  code_ref: z.string().min(1),
  paraphrased_text: z.string(),
  code_family: z.enum(["IPC", "UPC"]),
  edition: z.string().min(1),
});

export type RetrievedChunk = z.infer<typeof retrievedChunkSchema>;

export const explainCalcContextSchema = z.object({
  result: z.record(z.string(), z.unknown()),
  steps: z.array(
    z.object({
      step: z.number().int().positive(),
      label: z.string().min(1),
      formula: z.string().min(1),
      value: z.string().min(1),
    })
  ),
  assumptions: z.array(z.string()).default([]),
});

export type ExplainCalcContext = z.infer<typeof explainCalcContextSchema>;

export const explainInputSchema = z.object({
  userId: z.string().min(1),
  attemptId: z.string().uuid().optional(),
  promptVersion: z.string().min(1).default(PROMPT_VERSION),
  code_family: z.enum(["IPC", "UPC"]),
  edition: z.string().min(1),
  question: z.object({
    id: z.string().min(1),
    stem: z.string().min(1),
    type: z.enum(["mcq", "calc", "lookup", "scenario"]),
    options: z.array(z.string().min(1)).min(2),
    code_ref: z.string().default(""),
    topic_slug: z.string().optional(),
    topic_title: z.string().optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
  }),
  user_answer: z.string().min(1),
  correct_answer: z.string().min(1),
  explanation_seed: z.string().default(""),
  retrieved_chunks: z.array(retrievedChunkSchema).default([]),
  calc_context: explainCalcContextSchema.nullish(),
});

export type ExplainInput = z.infer<typeof explainInputSchema>;

export const explainOutputSchema = z.object({
  why_wrong: z.string().min(1),
  why_right: z.string().min(1),
  where_to_look: z.string().min(1),
  tip: z
    .string()
    .min(1)
    .refine(
      (val) => val.trim().endsWith(VERIFICATION_NOTICE),
      `tip must end with "${VERIFICATION_NOTICE}"`
    ),
  followup_topic: z.string().min(1),
  error_type: z.enum(ERROR_TYPES),
});

export type ExplainOutput = z.infer<typeof explainOutputSchema>;
