import type { CodeFamily } from "@/lib/domain/types";
import {
  type DfuCalcInput,
  type DrainCalcInput,
  type GasCalcInput,
  type VentCalcInput,
  type WsfuCalcInput,
  calculateDfuTotal,
  calculateDrainSize,
  calculateGasPipeSize,
  calculateVentSize,
  calculateWsfuSupplySize,
} from "./calculators";
import type { CalcOutput, CodeTableStore } from "./types";

export type CalcType = "dfu" | "drain" | "vent" | "wsfu" | "gas";

export type CalcQuestionInput =
  | { calcType: "dfu"; input: DfuCalcInput }
  | { calcType: "drain"; input: DrainCalcInput }
  | { calcType: "vent"; input: VentCalcInput }
  | { calcType: "wsfu"; input: WsfuCalcInput }
  | { calcType: "gas"; input: GasCalcInput };

export interface GeneratedCalcQuestion {
  id: string;
  calcType: CalcType;
  code_family: CodeFamily;
  edition: string;
  code_ref: string;
  stem: string;
  options: string[];
  optionValues: number[];
  correct_index: number;
  unitLabel: string;
  payload: CalcQuestionInput;
  authoritativeOutput: CalcOutput<unknown>;
}

export interface CalcGradeResult {
  isCorrect: boolean;
  correctIndex: number;
  correctValue: number;
  selectedValue: number | null;
  authoritativeOutput: CalcOutput<unknown>;
}

export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickRandom<T>(items: T[], rng: () => number): T {
  const idx = Math.floor(rng() * items.length);
  return items[Math.min(items.length - 1, Math.max(0, idx))];
}

function shuffleWithRng<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildNumericDistractors(
  correctVal: number,
  candidatePool: number[],
  rng: () => number
): number[] {
  const uniquePool = Array.from(
    new Set(
      candidatePool.filter(
        (v) => Number.isFinite(v) && v > 0 && Math.abs(v - correctVal) > 1e-6
      )
    )
  );
  const picked: number[] = [];

  for (const val of shuffleWithRng(uniquePool, rng)) {
    if (picked.length >= 3) break;
    picked.push(val);
  }

  let step = 1;
  while (picked.length < 3) {
    const offset = correctVal >= 10 ? step * 2 : step * 0.5;
    const candidate = Number((correctVal + offset).toFixed(2));
    if (
      Math.abs(candidate - correctVal) > 1e-6 &&
      !picked.some((p) => Math.abs(p - candidate) <= 1e-6)
    ) {
      picked.push(candidate);
    }
    step += 1;
  }

  return picked;
}

export function extractPrimaryNumericResult(
  calcType: CalcType,
  output: CalcOutput<unknown>
): number {
  const res = output.result as Record<string, unknown>;
  switch (calcType) {
    case "dfu":
      return Number(res.total_dfu);
    case "drain":
    case "wsfu":
    case "gas":
      return Number(res.min_pipe_size_in);
    case "vent":
      return Number(res.min_vent_size_in);
  }
}

export function evaluateCalcPayload(
  payload: CalcQuestionInput,
  store: CodeTableStore
): CalcOutput<unknown> {
  switch (payload.calcType) {
    case "dfu":
      return calculateDfuTotal(payload.input, store);
    case "drain":
      return calculateDrainSize(payload.input, store);
    case "vent":
      return calculateVentSize(payload.input, store);
    case "wsfu":
      return calculateWsfuSupplySize(payload.input, store);
    case "gas":
      return calculateGasPipeSize(payload.input, store);
  }
}

export function generateCalcPracticeQuestion(params: {
  calcType: CalcType;
  code_family: CodeFamily;
  edition: string;
  store: CodeTableStore;
  seed?: number;
}): GeneratedCalcQuestion {
  const { calcType, code_family, edition, store, seed = Date.now() } = params;
  const rng = createSeededRng(seed);

  let payload: CalcQuestionInput;
  let stem: string;
  let unitLabel: string;
  let candidatePool: number[] = [];

  if (calcType === "dfu") {
    const table = store.getTable(code_family, edition, "dfu_fixtures");
    const fixtures = shuffleWithRng(table.data.fixtures, rng).slice(
      0,
      Math.min(3, Math.max(1, table.data.fixtures.length))
    );
    const items = fixtures.map((f) => ({
      fixture_key: f.fixture_key,
      count: 1 + Math.floor(rng() * 3),
    }));
    payload = {
      calcType: "dfu",
      input: { code_family, edition, items },
    };
    const summary = items
      .map((item) => {
        const f = fixtures.find((fx) => fx.fixture_key === item.fixture_key)!;
        return `${item.count} ${f.label}`;
      })
      .join(", ");
    stem = `Using the ${code_family} ${edition} fixture table, what is the combined drainage load for: ${summary}?`;
    unitLabel = "DFU";
  } else if (calcType === "drain") {
    const table = store.getTable(code_family, edition, "drain_sizing");
    const sampleRow = pickRandom(table.data.entries, rng);
    const matchingRows = table.data.entries
      .filter(
        (e) =>
          e.system_kind === sampleRow.system_kind &&
          Math.abs(e.slope_in_per_ft - sampleRow.slope_in_per_ft) <= 1e-6
      )
      .sort((a, b) => a.pipe_size_in - b.pipe_size_in);
    const maxDfu = matchingRows[matchingRows.length - 1].max_dfu;
    const totalDfu = Math.max(
      1,
      Math.round(Math.min(sampleRow.max_dfu, maxDfu) * (0.55 + rng() * 0.4))
    );
    payload = {
      calcType: "drain",
      input: {
        code_family,
        edition,
        total_dfu: totalDfu,
        slope_in_per_ft: sampleRow.slope_in_per_ft,
        system_kind: sampleRow.system_kind,
      },
    };
    stem = `Size a ${sampleRow.system_kind.replace("_", " ")} carrying ${totalDfu} DFU at ${sampleRow.slope_in_per_ft} in/ft slope under ${code_family} ${edition}.`;
    unitLabel = "in";
    candidatePool = matchingRows.map((r) => r.pipe_size_in);
  } else if (calcType === "vent") {
    const table = store.getTable(code_family, edition, "vent_sizing");
    const sampleRow = pickRandom(table.data.entries, rng);
    const totalDfu = Math.max(
      1,
      Math.round(sampleRow.max_dfu * (0.4 + rng() * 0.5))
    );
    const devLength = Math.max(
      5,
      Math.round(sampleRow.max_developed_length_ft * (0.45 + rng() * 0.45))
    );
    payload = {
      calcType: "vent",
      input: {
        code_family,
        edition,
        soil_stack_size_in: sampleRow.soil_stack_size_in,
        total_dfu: totalDfu,
        developed_length_ft: devLength,
      },
    };
    stem = `Determine the minimum vent diameter for a ${sampleRow.soil_stack_size_in}-in stack carrying ${totalDfu} DFU with a developed length of ${devLength} ft (${code_family} ${edition}).`;
    unitLabel = "in";
    candidatePool = table.data.entries.map((e) => e.vent_size_in);
  } else if (calcType === "wsfu") {
    const table = store.getTable(code_family, edition, "wsfu_supply");
    const sampleFix = pickRandom(table.data.fixtures, rng);
    const matchingFix = shuffleWithRng(
      table.data.fixtures.filter((f) => f.supply_type === sampleFix.supply_type),
      rng
    ).slice(0, 2);
    const samplePipe = pickRandom(table.data.pipe_sizing, rng);
    const items = matchingFix.map((f) => ({
      fixture_key: f.fixture_key,
      count: 1 + Math.floor(rng() * 2),
    }));
    payload = {
      calcType: "wsfu",
      input: {
        code_family,
        edition,
        supply_type: sampleFix.supply_type,
        material: samplePipe.material,
        items,
      },
    };
    const summary = items
      .map((item) => {
        const f = matchingFix.find((fx) => fx.fixture_key === item.fixture_key)!;
        return `${item.count} ${f.label}`;
      })
      .join(" and ");
    stem = `Size a ${samplePipe.material} water supply branch (${sampleFix.supply_type.replace("_", " ")}) serving ${summary} under ${code_family} ${edition}.`;
    unitLabel = "in";
    candidatePool = table.data.pipe_sizing.map((p) => p.pipe_size_in);
  } else {
    const table = store.getTable(code_family, edition, "gas_pipe_sizing");
    const sampleEntry = pickRandom(table.data.entries, rng);
    const targetCfh = Math.max(
      10,
      Math.round(sampleEntry.max_cfh * (0.45 + rng() * 0.45))
    );
    const totalBtuh = targetCfh * table.data.heating_value_btu_per_cf;
    const devLen = Math.max(
      10,
      Math.round(sampleEntry.length_ft * (0.65 + rng() * 0.3))
    );
    payload = {
      calcType: "gas",
      input: {
        code_family,
        edition,
        total_btuh: totalBtuh,
        developed_length_ft: devLen,
      },
    };
    stem = `Size a ${table.data.material} gas branch (${table.data.gas_type}) supplying ${totalBtuh.toLocaleString("en-US")} BTU/h over ${devLen} ft developed length (${code_family} ${edition}).`;
    unitLabel = "in";
    candidatePool = table.data.entries.map((e) => e.pipe_size_in);
  }

  const authoritativeOutput = evaluateCalcPayload(payload, store);
  const correctValue = extractPrimaryNumericResult(calcType, authoritativeOutput);

  if (calcType === "dfu") {
    candidatePool = [
      Math.max(1, correctValue - 3),
      Math.max(1, correctValue - 1),
      correctValue + 2,
      correctValue + 4,
      correctValue + 6,
    ];
  }

  const distractors = buildNumericDistractors(correctValue, candidatePool, rng);
  const optionValues = shuffleWithRng([correctValue, ...distractors], rng);
  const correctIndex = optionValues.findIndex(
    (v) => Math.abs(v - correctValue) <= 1e-6
  );

  return {
    id: `calc-gen-${calcType}-${seed}`,
    calcType,
    code_family,
    edition,
    code_ref: authoritativeOutput.edition.code_ref,
    stem,
    options: optionValues.map((v) => `${v} ${unitLabel}`),
    optionValues,
    correct_index: correctIndex,
    unitLabel,
    payload,
    authoritativeOutput,
  };
}

export function gradeCalcPracticeAnswer(params: {
  question: GeneratedCalcQuestion;
  selectedIndex: number;
  store: CodeTableStore;
}): CalcGradeResult {
  const { question, selectedIndex, store } = params;
  const authoritativeOutput = evaluateCalcPayload(question.payload, store);
  const correctValue = extractPrimaryNumericResult(
    question.calcType,
    authoritativeOutput
  );
  const correctIndex = question.optionValues.findIndex(
    (v) => Math.abs(v - correctValue) <= 1e-6
  );
  const selectedValue =
    selectedIndex >= 0 && selectedIndex < question.optionValues.length
      ? question.optionValues[selectedIndex]
      : null;

  return {
    isCorrect:
      selectedValue !== null && Math.abs(selectedValue - correctValue) <= 1e-6,
    correctIndex,
    correctValue,
    selectedValue,
    authoritativeOutput,
  };
}
