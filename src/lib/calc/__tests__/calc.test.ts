import { describe, expect, it } from "vitest";
import dfuFixtures from "../fixtures/dfu.fixtures.json";
import drainFixtures from "../fixtures/drain.fixtures.json";
import gasFixtures from "../fixtures/gas.fixtures.json";
import syntheticTables from "../fixtures/synthetic-test-tables.json";
import ventFixtures from "../fixtures/vent.fixtures.json";
import wsfuFixtures from "../fixtures/wsfu.fixtures.json";
import {
  CALC_ENGINE_VERSION,
  CalcError,
  type CalcType,
  type CodeTableRecord,
  type DfuCalcInput,
  type DrainCalcInput,
  EmptyFixturesError,
  type GasCalcInput,
  MissingCodeTableError,
  type VentCalcInput,
  type WsfuCalcInput,
  calculateDfuTotal,
  calculateDrainSize,
  calculateGasPipeSize,
  calculateVentSize,
  calculateWsfuSupplySize,
  createCodeTableStore,
  generateCalcPracticeQuestion,
  gradeCalcPracticeAnswer,
} from "../index";

function assertNonEmptyFixtures<T>(
  fixtureName: string,
  cases: T[],
  minRequired = 20
): T[] {
  if (!Array.isArray(cases) || cases.length < minRequired) {
    throw new EmptyFixturesError(
      fixtureName,
      Array.isArray(cases) ? cases.length : 0,
      minRequired
    );
  }
  return cases;
}

const store = createCodeTableStore(syntheticTables as CodeTableRecord[]);
const emptyStore = createCodeTableStore([]);

describe("Bendline /lib/calc deterministic calculators & fixtures", () => {
  it("fails loudly when fixture arrays are empty or below 20 cases", () => {
    expect(() => assertNonEmptyFixtures("empty", [], 20)).toThrowError(
      EmptyFixturesError
    );
    expect(() =>
      assertNonEmptyFixtures("too-small", [1, 2, 3], 20)
    ).toThrowError(EmptyFixturesError);

    expect(assertNonEmptyFixtures("dfu", dfuFixtures, 20).length).toBeGreaterThanOrEqual(20);
    expect(assertNonEmptyFixtures("drain", drainFixtures, 20).length).toBeGreaterThanOrEqual(20);
    expect(assertNonEmptyFixtures("vent", ventFixtures, 20).length).toBeGreaterThanOrEqual(20);
    expect(assertNonEmptyFixtures("wsfu", wsfuFixtures, 20).length).toBeGreaterThanOrEqual(20);
    expect(assertNonEmptyFixtures("gas", gasFixtures, 20).length).toBeGreaterThanOrEqual(20);
  });

  it("never uses hardcoded tables and throws MissingCodeTableError when DB tables are absent", () => {
    expect(() =>
      calculateDfuTotal(
        { code_family: "IPC", edition: "SYNTHETIC-TEST-1", items: [{ fixture_key: "lav", count: 1 }] },
        emptyStore
      )
    ).toThrowError(MissingCodeTableError);

    expect(() =>
      calculateDrainSize(
        { code_family: "IPC", edition: "SYNTHETIC-TEST-1", total_dfu: 4, slope_in_per_ft: 0.25, system_kind: "horizontal_branch" },
        emptyStore
      )
    ).toThrowError(MissingCodeTableError);

    expect(() =>
      calculateVentSize(
        { code_family: "IPC", edition: "SYNTHETIC-TEST-1", soil_stack_size_in: 3, total_dfu: 12, developed_length_ft: 30 },
        emptyStore
      )
    ).toThrowError(MissingCodeTableError);

    expect(() =>
      calculateWsfuSupplySize(
        { code_family: "IPC", edition: "SYNTHETIC-TEST-1", supply_type: "flush_tank", material: "copper_l", items: [{ fixture_key: "lav_tank", count: 1 }] },
        emptyStore
      )
    ).toThrowError(MissingCodeTableError);

    expect(() =>
      calculateGasPipeSize(
        { code_family: "IPC", edition: "SYNTHETIC-TEST-1", total_btuh: 40000, developed_length_ft: 10 },
        emptyStore
      )
    ).toThrowError(MissingCodeTableError);
  });

  it("passes all >=20 DFU total fixture cases with steps, assumptions, and edition", () => {
    const cases = assertNonEmptyFixtures("dfu", dfuFixtures, 20);
    for (const c of cases) {
      if ("expectedError" in c && c.expectedError) {
        try {
          calculateDfuTotal(c.input as DfuCalcInput, store);
          throw new Error(`Expected ${c.expectedError} for ${c.name}`);
        } catch (err) {
          expect(err).toBeInstanceOf(CalcError);
          expect((err as CalcError).code).toBe(c.expectedError);
        }
      } else {
        const out = calculateDfuTotal(c.input as DfuCalcInput, store);
        expect(out.result.total_dfu, c.name).toBe(c.expected!.total_dfu);
        expect(out.result.min_trap_size_in, c.name).toBe(c.expected!.min_trap_size_in);
        expect(out.steps.length).toBeGreaterThan(0);
        expect(out.assumptions.length).toBeGreaterThan(0);
        expect(out.edition.calc_version).toBe(CALC_ENGINE_VERSION);
        expect(out.edition.edition).toBe("SYNTHETIC-TEST-1");
      }
    }
  });

  it("passes all >=20 drain sizing fixture cases", () => {
    const cases = assertNonEmptyFixtures("drain", drainFixtures, 20);
    for (const c of cases) {
      if ("expectedError" in c && c.expectedError) {
        try {
          calculateDrainSize(c.input as DrainCalcInput, store);
          throw new Error(`Expected ${c.expectedError} for ${c.name}`);
        } catch (err) {
          expect(err).toBeInstanceOf(CalcError);
          expect((err as CalcError).code).toBe(c.expectedError);
        }
      } else {
        const out = calculateDrainSize(c.input as DrainCalcInput, store);
        expect(out.result.min_pipe_size_in, c.name).toBe(c.expected!.min_pipe_size_in);
        expect(out.result.max_dfu_at_size, c.name).toBe(c.expected!.max_dfu_at_size);
        expect(out.steps.length).toBe(3);
        expect(out.assumptions.length).toBeGreaterThan(0);
      }
    }
  });

  it("passes all >=20 vent sizing with developed length fixture cases", () => {
    const cases = assertNonEmptyFixtures("vent", ventFixtures, 20);
    for (const c of cases) {
      if ("expectedError" in c && c.expectedError) {
        try {
          calculateVentSize(c.input as VentCalcInput, store);
          throw new Error(`Expected ${c.expectedError} for ${c.name}`);
        } catch (err) {
          expect(err).toBeInstanceOf(CalcError);
          expect((err as CalcError).code).toBe(c.expectedError);
        }
      } else {
        const out = calculateVentSize(c.input as VentCalcInput, store);
        expect(out.result.min_vent_size_in, c.name).toBe(c.expected!.min_vent_size_in);
        expect(out.steps.length).toBe(3);
        expect(out.assumptions.length).toBeGreaterThan(0);
      }
    }
  });

  it("passes all >=20 WSFU water-supply sizing fixture cases", () => {
    const cases = assertNonEmptyFixtures("wsfu", wsfuFixtures, 20);
    for (const c of cases) {
      if ("expectedError" in c && c.expectedError) {
        try {
          calculateWsfuSupplySize(c.input as WsfuCalcInput, store);
          throw new Error(`Expected ${c.expectedError} for ${c.name}`);
        } catch (err) {
          expect(err).toBeInstanceOf(CalcError);
          expect((err as CalcError).code).toBe(c.expectedError);
        }
      } else {
        const out = calculateWsfuSupplySize(c.input as WsfuCalcInput, store);
        expect(out.result.total_wsfu, c.name).toBe(c.expected!.total_wsfu);
        expect(out.result.demand_gpm, c.name).toBe(c.expected!.demand_gpm);
        expect(out.result.min_pipe_size_in, c.name).toBe(c.expected!.min_pipe_size_in);
        expect(out.steps.length).toBe(3);
      }
    }
  });

  it("passes all >=20 gas pipe sizing fixture cases", () => {
    const cases = assertNonEmptyFixtures("gas", gasFixtures, 20);
    for (const c of cases) {
      if ("expectedError" in c && c.expectedError) {
        try {
          calculateGasPipeSize(c.input as GasCalcInput, store);
          throw new Error(`Expected ${c.expectedError} for ${c.name}`);
        } catch (err) {
          expect(err).toBeInstanceOf(CalcError);
          expect((err as CalcError).code).toBe(c.expectedError);
        }
      } else {
        const out = calculateGasPipeSize(c.input as GasCalcInput, store);
        expect(out.result.required_cfh, c.name).toBe(c.expected!.required_cfh);
        expect(out.result.lookup_length_ft, c.name).toBe(c.expected!.lookup_length_ft);
        expect(out.result.min_pipe_size_in, c.name).toBe(c.expected!.min_pipe_size_in);
        expect(out.steps.length).toBe(3);
      }
    }
  });

  it("generates randomized calc practice questions graded by the exact same calculator functions", () => {
    const types: CalcType[] = ["dfu", "drain", "vent", "wsfu", "gas"];
    for (const [idx, calcType] of types.entries()) {
      const q = generateCalcPracticeQuestion({
        calcType,
        code_family: "IPC",
        edition: "SYNTHETIC-TEST-1",
        store,
        seed: 4200 + idx,
      });

      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.correct_index).toBeGreaterThanOrEqual(0);
      expect(q.correct_index).toBeLessThan(4);

      const passGrade = gradeCalcPracticeAnswer({
        question: q,
        selectedIndex: q.correct_index,
        store,
      });
      expect(passGrade.isCorrect).toBe(true);
      expect(passGrade.authoritativeOutput.steps.length).toBeGreaterThan(0);

      const wrongIndex = (q.correct_index + 1) % 4;
      const failGrade = gradeCalcPracticeAnswer({
        question: q,
        selectedIndex: wrongIndex,
        store,
      });
      expect(failGrade.isCorrect).toBe(false);
    }

    expect(() =>
      generateCalcPracticeQuestion({
        calcType: "dfu",
        code_family: "IPC",
        edition: "SYNTHETIC-TEST-1",
        store: emptyStore,
        seed: 1,
      })
    ).toThrowError(MissingCodeTableError);
  });
});
