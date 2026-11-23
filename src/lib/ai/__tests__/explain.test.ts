import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ExplainGuardrailError,
  clearExplainCacheForTests,
  explainAnswer,
} from "../explain";
import {
  AiRateLimitError,
  resetRateLimiterForTests,
  selectExplainModel,
} from "../model-router";
import {
  type ExplainInput,
  VERIFICATION_NOTICE,
  explainOutputSchema,
} from "../schemas";

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

const baseRoutineInput: ExplainInput = {
  userId: "user-1",
  promptVersion: "explain-v1.0.0",
  code_family: "IPC",
  edition: "2021",
  question: {
    id: "q-explain-1",
    stem: "Why must horizontal sanitary branches pitch downward toward the building drain?",
    type: "lookup",
    options: [
      "To maintain self-scouring velocity",
      "To hold static water inside the pipe",
      "To increase static supply pressure",
      "To eliminate fixture traps",
    ],
    code_ref: "IPC 704.1",
    topic_slug: "sanitary-drainage-dwv",
    difficulty: 2,
  },
  user_answer: "To hold static water inside the pipe",
  correct_answer: "To maintain self-scouring velocity",
  explanation_seed:
    "Positive continuous slope keeps solids suspended in flowing wastewater.",
  retrieved_chunks: [
    {
      id: "c1",
      code_ref: "IPC 704.1",
      paraphrased_text:
        "Horizontal sanitary piping requires steady downward grade so waste liquids transport solids.",
      code_family: "IPC",
      edition: "2021",
    },
  ],
};

describe("Server-only /lib/ai/explain engine, caching, routing, rate limits, and guardrails", () => {
  beforeEach(() => {
    clearExplainCacheForTests();
    resetRateLimiterForTests();
  });

  it("never gets imported inside client components", () => {
    const srcFiles = collectSourceFiles(path.resolve(process.cwd(), "src"))
      .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, "utf8");
      if (/^\s*["']use client["']\s*;?/m.test(content)) {
        expect(content).not.toContain("@/lib/ai/explain");
      }
    }
  });

  it("caches by (question_id, answer, edition, prompt_version) and misses when any key part changes", async () => {
    const first = await explainAnswer(baseRoutineInput);
    expect(first.meta.cached).toBe(false);
    expect(
      explainOutputSchema.safeParse(first.explanation).success
    ).toBe(true);
    expect(first.explanation.tip.endsWith(VERIFICATION_NOTICE)).toBe(true);

    const second = await explainAnswer({
      ...baseRoutineInput,
      userId: "user-2",
    });
    expect(second.meta.cached).toBe(true);
    expect(second.meta.cacheKey).toBe(first.meta.cacheKey);

    // Changed edition -> cache miss
    const diffEdition = await explainAnswer({
      ...baseRoutineInput,
      edition: "2024",
    });
    expect(diffEdition.meta.cached).toBe(false);

    // Changed promptVersion -> cache miss
    const diffPrompt = await explainAnswer({
      ...baseRoutineInput,
      promptVersion: "explain-v2.0.0",
    });
    expect(diffPrompt.meta.cached).toBe(false);

    // Changed user answer -> cache miss
    const diffAnswer = await explainAnswer({
      ...baseRoutineInput,
      user_answer: "To eliminate fixture traps",
    });
    expect(diffAnswer.meta.cached).toBe(false);
  });

  it("routes routine items to a cheaper model and complex/calc items to the reasoning model", () => {
    const routineRoute = selectExplainModel(baseRoutineInput);
    expect(routineRoute.tier).toBe("routine");
    expect(routineRoute.model).toContain("lite");

    const complexRoute = selectExplainModel({
      ...baseRoutineInput,
      question: {
        ...baseRoutineInput.question,
        type: "calc",
        difficulty: 4,
      },
    });
    expect(complexRoute.tier).toBe("complex");
    expect(complexRoute.model).not.toBe(routineRoute.model);
  });

  it("enforces per-user rate limits independently across users", async () => {
    const cfg = { maxPerMinute: 2, maxPerDay: 5 };

    await explainAnswer(baseRoutineInput, {
      bypassCache: true,
      rateLimitConfig: cfg,
    });
    await explainAnswer(baseRoutineInput, {
      bypassCache: true,
      rateLimitConfig: cfg,
    });

    await expect(
      explainAnswer(baseRoutineInput, {
        bypassCache: true,
        rateLimitConfig: cfg,
      })
    ).rejects.toThrowError(AiRateLimitError);

    // Another user has an independent quota
    const otherUser = await explainAnswer(
      { ...baseRoutineInput, userId: "user-other" },
      { bypassCache: true, rateLimitConfig: cfg }
    );
    expect(otherUser.explanation.tip.endsWith(VERIFICATION_NOTICE)).toBe(true);
  });

  it("admits insufficiency and points to code book without inventing citations when seed and chunks are absent", async () => {
    const res = await explainAnswer({
      ...baseRoutineInput,
      question: {
        ...baseRoutineInput.question,
        id: "q-insufficient",
        code_ref: "",
      },
      explanation_seed: "",
      retrieved_chunks: [],
    });

    expect(res.explanation.why_wrong.toLowerCase()).toContain("insufficient");
    expect(res.explanation.where_to_look.toLowerCase()).toContain("code book");
    expect(res.explanation.tip.endsWith(VERIFICATION_NOTICE)).toBe(true);
  });

  it("rejects invented citations and verbatim chunk copying from misbehaving LLM output", async () => {
    await expect(
      explainAnswer(baseRoutineInput, {
        bypassCache: true,
        strictLlmGuardrails: true,
        llmAdapter: async () => ({
          why_wrong: "Wrong under IPC 999.88.",
          why_right: "Right per IPC 704.1.",
          where_to_look: "Look at IPC 999.88.",
          tip: `Check table carefully. ${VERIFICATION_NOTICE}`,
          followup_topic: "sanitary-drainage-dwv",
          error_type: "concept",
        }),
      })
    ).rejects.toThrowError(ExplainGuardrailError);

    await expect(
      explainAnswer(baseRoutineInput, {
        bypassCache: true,
        strictLlmGuardrails: true,
        llmAdapter: async () => ({
          why_wrong: "Wrong selection.",
          why_right:
            "Horizontal sanitary piping requires steady downward grade so waste liquids transport solids.",
          where_to_look: "IPC 704.1",
          tip: `Check carefully. ${VERIFICATION_NOTICE}`,
          followup_topic: "sanitary-drainage-dwv",
          error_type: "concept",
        }),
      })
    ).rejects.toThrowError(ExplainGuardrailError);
  });
});
