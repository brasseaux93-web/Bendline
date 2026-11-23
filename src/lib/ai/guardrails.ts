import type { ExplainInput, ExplainOutput, RetrievedChunk } from "./schemas";

const POINTER_REGEX =
  /\b(?:(?:[Ii][Pp][Cc]|[Uu][Pp][Cc])\s+(?:(?:[Tt]able|[Ss]ection|[Ss]ec\.?|[Cc]hapter|[Cc]h\.?)\s+\d+(?:\.\d+)*|[Aa]ppendix\s+[A-Z]\b|\d+(?:\.\d+)*)|(?:[Tt]able|[Ss]ection|[Ss]ec\.?|[Cc]hapter|[Cc]h\.?)\s+\d+(?:\.\d+)*|[Aa]ppendix\s+[A-Z]\b|\d{3,4}\.\d+(?:\.\d+)*)\b/g;

export function getMatchingChunks(input: ExplainInput): RetrievedChunk[] {
  return input.retrieved_chunks.filter(
    (c) =>
      c.code_family === input.code_family &&
      c.edition.trim() === input.edition.trim() &&
      c.paraphrased_text.trim().length > 0
  );
}

export function hasSufficientContext(input: ExplainInput): boolean {
  const seedOk = input.explanation_seed.trim().length >= 15;
  const matchingChunks = getMatchingChunks(input);
  const chunkOk = matchingChunks.some(
    (c) => c.paraphrased_text.trim().length >= 15
  );
  const calcOk = Boolean(
    input.calc_context && input.calc_context.steps.length > 0
  );
  return seedOk || chunkOk || calcOk;
}

const EDITION_YEAR_POINTER_REGEX = /^(?:ipc|upc)\s+(?:19|20)\d{2}$/i;

export function extractSectionPointers(text: string): string[] {
  const matches = text.match(POINTER_REGEX) ?? [];
  return Array.from(
    new Set(
      matches
        .map((m) => m.trim().replace(/[.,;:]+$/, ""))
        .filter((m) => m.length > 0 && !EDITION_YEAR_POINTER_REGEX.test(m))
    )
  );
}

function expandPointerAliases(pointer: string): string[] {
  const lower = pointer.toLowerCase().replace(/\s+/g, " ").trim();
  const aliases = new Set<string>([lower]);

  const strippedFamily = lower.replace(/^(?:ipc|upc)\s+/, "");
  aliases.add(strippedFamily);

  const strippedPrefix = strippedFamily.replace(
    /^(?:table|section|sec\.?|chapter|ch\.?|appendix)\s+/,
    ""
  );
  if (strippedPrefix.length > 0) {
    aliases.add(strippedPrefix);
    aliases.add(`section ${strippedPrefix}`);
    aliases.add(`sec. ${strippedPrefix}`);
    aliases.add(`sec ${strippedPrefix}`);
    aliases.add(`table ${strippedPrefix}`);
    aliases.add(`ch. ${strippedPrefix}`);
    aliases.add(`chapter ${strippedPrefix}`);
  }

  return [...aliases];
}

export function collectAllowedSectionPointers(input: ExplainInput): Set<string> {
  const allowed = new Set<string>();
  const sources = [
    input.question.code_ref,
    input.explanation_seed,
    ...getMatchingChunks(input).flatMap((c) => [c.code_ref, c.paraphrased_text]),
  ];

  for (const src of sources) {
    for (const ptr of extractSectionPointers(src)) {
      for (const alias of expandPointerAliases(ptr)) {
        allowed.add(alias);
      }
    }
  }
  return allowed;
}

export function findInventedCitations(
  output: ExplainOutput,
  input: ExplainInput
): string[] {
  const allowed = collectAllowedSectionPointers(input);
  const combined = [
    output.why_wrong,
    output.why_right,
    output.where_to_look,
    output.tip,
  ].join(" ");

  const emitted = extractSectionPointers(combined);
  const invented: string[] = [];

  for (const ptr of emitted) {
    const lower = ptr.toLowerCase().replace(/\s+/g, " ").trim();
    // Enforce code_family consistency when an explicit IPC/UPC prefix is used in output
    if (/^(ipc|upc)\b/i.test(lower)) {
      const prefix = lower.startsWith("ipc") ? "IPC" : "UPC";
      if (prefix !== input.code_family && !allowed.has(lower)) {
        invented.push(ptr);
        continue;
      }
    }

    const aliases = expandPointerAliases(ptr);
    const isAuthorized = aliases.some((alias) => allowed.has(alias));
    if (!isAuthorized) {
      invented.push(ptr);
    }
  }

  return invented;
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function detectVerbatimOverlap(
  outputText: string,
  forbiddenSources: string[],
  minWords = 8
): { hasVerbatim: boolean; matchedPhrase: string | null } {
  const outputWords = normalizeWords(outputText);
  if (outputWords.length < minWords) {
    return { hasVerbatim: false, matchedPhrase: null };
  }

  const outputNgrams = new Set<string>();
  for (let i = 0; i <= outputWords.length - minWords; i += 1) {
    outputNgrams.add(outputWords.slice(i, i + minWords).join(" "));
  }

  for (const source of forbiddenSources) {
    const srcWords = normalizeWords(source);
    for (let i = 0; i <= srcWords.length - minWords; i += 1) {
      const gram = srcWords.slice(i, i + minWords).join(" ");
      if (outputNgrams.has(gram)) {
        return { hasVerbatim: true, matchedPhrase: gram };
      }
    }
  }

  return { hasVerbatim: false, matchedPhrase: null };
}

function extractNumericTokens(text: string): string[] {
  const matches = text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  return matches.map((n) => String(Number(n)));
}

export function findUnbackedCalcNumbers(
  output: ExplainOutput,
  input: ExplainInput
): string[] {
  if (input.question.type !== "calc" && !input.calc_context) {
    return [];
  }

  const allowedTexts = [
    input.question.stem,
    ...input.question.options,
    input.user_answer,
    input.correct_answer,
    input.explanation_seed,
    input.question.code_ref,
    input.edition,
    ...getMatchingChunks(input).flatMap((c) => [c.code_ref, c.paraphrased_text]),
  ];

  if (input.calc_context) {
    allowedTexts.push(JSON.stringify(input.calc_context.result));
    for (const s of input.calc_context.steps) {
      allowedTexts.push(String(s.step), s.label, s.formula, s.value);
    }
    allowedTexts.push(...input.calc_context.assumptions);
  }

  const allowedNums = new Set<string>();
  for (const txt of allowedTexts) {
    for (const n of extractNumericTokens(txt)) {
      allowedNums.add(n);
    }
  }

  const outputTexts = [
    output.why_wrong,
    output.why_right,
    output.where_to_look,
    output.tip,
  ].join(" ");

  const unbacked: string[] = [];
  for (const num of extractNumericTokens(outputTexts)) {
    if (!allowedNums.has(num)) {
      unbacked.push(num);
    }
  }

  return Array.from(new Set(unbacked));
}
