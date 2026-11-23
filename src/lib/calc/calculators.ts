import type { CodeFamily } from "@/lib/domain/types";
import { OutOfRangeInputError } from "./errors";
import {
  CALC_ENGINE_VERSION,
  type CalcOutput,
  type CalcStep,
  type CodeTableStore,
} from "./types";

// ---------------------------------------------------------------------------
// 1. DFU Totals Calculator
// ---------------------------------------------------------------------------

export interface DfuItemInput {
  fixture_key: string;
  count: number;
}

export interface DfuCalcInput {
  code_family: CodeFamily;
  edition: string;
  items: DfuItemInput[];
}

export interface DfuBreakdownRow {
  fixture_key: string;
  label: string;
  count: number;
  unit_dfu: number;
  subtotal_dfu: number;
  min_trap_in: number;
}

export interface DfuCalcResult {
  total_dfu: number;
  min_trap_size_in: number;
  item_breakdown: DfuBreakdownRow[];
}

export function calculateDfuTotal(
  input: DfuCalcInput,
  store: CodeTableStore
): CalcOutput<DfuCalcResult> {
  const table = store.getTable(
    input.code_family,
    input.edition,
    "dfu_fixtures"
  );

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new OutOfRangeInputError(
      "Provide at least one fixture item to calculate DFU totals."
    );
  }

  const fixtureByKey = new Map(
    table.data.fixtures.map((f) => [f.fixture_key, f])
  );

  const breakdown: DfuBreakdownRow[] = [];
  const steps: CalcStep[] = [];
  let totalDfu = 0;
  let maxMinTrap = 0;

  input.items.forEach((item, index) => {
    if (!Number.isInteger(item.count) || item.count < 1) {
      throw new OutOfRangeInputError(
        `Fixture count must be a positive integer (got ${item.count} for "${item.fixture_key}").`,
        { fixture_key: item.fixture_key, count: item.count }
      );
    }

    const row = fixtureByKey.get(item.fixture_key);
    if (!row) {
      throw new OutOfRangeInputError(
        `Unknown fixture_key "${item.fixture_key}" in ${input.code_family} ${input.edition} dfu_fixtures table.`,
        { fixture_key: item.fixture_key }
      );
    }

    const subtotal = Number((row.dfu * item.count).toFixed(2));
    totalDfu += subtotal;
    if (row.min_trap_in > maxMinTrap) {
      maxMinTrap = row.min_trap_in;
    }

    breakdown.push({
      fixture_key: row.fixture_key,
      label: row.label,
      count: item.count,
      unit_dfu: row.dfu,
      subtotal_dfu: subtotal,
      min_trap_in: row.min_trap_in,
    });

    steps.push({
      step: index + 1,
      label: row.label,
      formula: `${item.count} x ${row.dfu} DFU (min trap ${row.min_trap_in} in)`,
      value: `${subtotal} DFU`,
    });
  });

  const roundedTotal = Number(totalDfu.toFixed(2));
  steps.push({
    step: steps.length + 1,
    label: "Total Drainage Fixture Units",
    formula: "Sum of fixture subtotals",
    value: `${roundedTotal} DFU`,
  });

  return {
    result: {
      total_dfu: roundedTotal,
      min_trap_size_in: maxMinTrap,
      item_breakdown: breakdown,
    },
    steps,
    assumptions: [
      `Fixture DFU values read strictly from DB table "${table.title}" (${table.code_ref}).`,
      "Simultaneous discharge factors beyond tabulated unit weights are excluded.",
    ],
    edition: {
      code_family: table.code_family,
      edition: table.edition,
      table_key: table.table_key,
      code_ref: table.code_ref,
      calc_version: CALC_ENGINE_VERSION,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Drain Sizing Calculator
// ---------------------------------------------------------------------------

export type DrainSystemKind =
  | "horizontal_branch"
  | "building_drain"
  | "vertical_stack";

export interface DrainCalcInput {
  code_family: CodeFamily;
  edition: string;
  total_dfu: number;
  slope_in_per_ft: number;
  system_kind: DrainSystemKind;
}

export interface DrainCalcResult {
  min_pipe_size_in: number;
  max_dfu_at_size: number;
  utilization_pct: number;
  slope_in_per_ft: number;
  system_kind: DrainSystemKind;
}

export function calculateDrainSize(
  input: DrainCalcInput,
  store: CodeTableStore
): CalcOutput<DrainCalcResult> {
  const table = store.getTable(
    input.code_family,
    input.edition,
    "drain_sizing"
  );

  if (!Number.isFinite(input.total_dfu) || input.total_dfu <= 0) {
    throw new OutOfRangeInputError(
      `total_dfu must be greater than 0 (received ${input.total_dfu}).`,
      { total_dfu: input.total_dfu }
    );
  }

  if (
    !Number.isFinite(input.slope_in_per_ft) ||
    (input.system_kind === "vertical_stack"
      ? input.slope_in_per_ft < 0
      : input.slope_in_per_ft <= 0)
  ) {
    throw new OutOfRangeInputError(
      `Invalid slope ${input.slope_in_per_ft} in/ft for ${input.system_kind}.`,
      { slope_in_per_ft: input.slope_in_per_ft, system_kind: input.system_kind }
    );
  }

  const matchingRows = table.data.entries
    .filter(
      (entry) =>
        entry.system_kind === input.system_kind &&
        Math.abs(entry.slope_in_per_ft - input.slope_in_per_ft) <= 1e-6
    )
    .sort((a, b) => a.pipe_size_in - b.pipe_size_in);

  if (matchingRows.length === 0) {
    throw new OutOfRangeInputError(
      `No tabulated drain sizing entries for ${input.system_kind} at ${input.slope_in_per_ft} in/ft in ${input.code_family} ${input.edition}.`,
      { slope_in_per_ft: input.slope_in_per_ft, system_kind: input.system_kind }
    );
  }

  const match = matchingRows.find((row) => row.max_dfu >= input.total_dfu);
  if (!match) {
    const maxCap = matchingRows[matchingRows.length - 1].max_dfu;
    throw new OutOfRangeInputError(
      `Load of ${input.total_dfu} DFU exceeds maximum tabulated capacity (${maxCap} DFU) for ${input.system_kind} at ${input.slope_in_per_ft} in/ft.`,
      { total_dfu: input.total_dfu, max_tabulated_dfu: maxCap }
    );
  }

  const utilizationPct = Number(
    ((input.total_dfu / match.max_dfu) * 100).toFixed(1)
  );

  return {
    result: {
      min_pipe_size_in: match.pipe_size_in,
      max_dfu_at_size: match.max_dfu,
      utilization_pct: utilizationPct,
      slope_in_per_ft: input.slope_in_per_ft,
      system_kind: input.system_kind,
    },
    steps: [
      {
        step: 1,
        label: "Filter system & grade",
        formula: `${input.system_kind} @ ${input.slope_in_per_ft} in/ft`,
        value: `${matchingRows.length} tabulated pipe sizes`,
      },
      {
        step: 2,
        label: "Select smallest pipe meeting DFU load",
        formula: `max_dfu >= ${input.total_dfu} DFU`,
        value: `${match.pipe_size_in} in (capacity ${match.max_dfu} DFU)`,
      },
      {
        step: 3,
        label: "Compute capacity utilization",
        formula: `(${input.total_dfu} / ${match.max_dfu}) * 100`,
        value: `${utilizationPct}%`,
      },
    ],
    assumptions: [
      `Capacity thresholds read from "${table.title}" (${table.code_ref}).`,
      "Assumes uniform grade without hydraulic restrictions or unvented offsets.",
    ],
    edition: {
      code_family: table.code_family,
      edition: table.edition,
      table_key: table.table_key,
      code_ref: table.code_ref,
      calc_version: CALC_ENGINE_VERSION,
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Vent Sizing with Developed Length Calculator
// ---------------------------------------------------------------------------

export interface VentCalcInput {
  code_family: CodeFamily;
  edition: string;
  soil_stack_size_in: number;
  total_dfu: number;
  developed_length_ft: number;
}

export interface VentCalcResult {
  min_vent_size_in: number;
  max_developed_length_ft: number;
  max_dfu_at_size: number;
  soil_stack_size_in: number;
}

export function calculateVentSize(
  input: VentCalcInput,
  store: CodeTableStore
): CalcOutput<VentCalcResult> {
  const table = store.getTable(
    input.code_family,
    input.edition,
    "vent_sizing"
  );

  if (
    !Number.isFinite(input.soil_stack_size_in) ||
    input.soil_stack_size_in <= 0
  ) {
    throw new OutOfRangeInputError(
      `soil_stack_size_in must be positive (received ${input.soil_stack_size_in}).`
    );
  }
  if (!Number.isFinite(input.total_dfu) || input.total_dfu <= 0) {
    throw new OutOfRangeInputError(
      `total_dfu must be positive (received ${input.total_dfu}).`
    );
  }
  if (
    !Number.isFinite(input.developed_length_ft) ||
    input.developed_length_ft <= 0
  ) {
    throw new OutOfRangeInputError(
      `developed_length_ft must be positive (received ${input.developed_length_ft}).`
    );
  }

  const stackRows = table.data.entries.filter(
    (e) => Math.abs(e.soil_stack_size_in - input.soil_stack_size_in) <= 1e-6
  );

  if (stackRows.length === 0) {
    throw new OutOfRangeInputError(
      `No vent sizing rows for ${input.soil_stack_size_in}-in soil/waste stack in ${input.code_family} ${input.edition}.`,
      { soil_stack_size_in: input.soil_stack_size_in }
    );
  }

  const qualifying = stackRows
    .filter(
      (e) =>
        e.max_dfu >= input.total_dfu &&
        e.max_developed_length_ft >= input.developed_length_ft
    )
    .sort((a, b) => {
      if (a.vent_size_in !== b.vent_size_in) {
        return a.vent_size_in - b.vent_size_in;
      }
      return a.max_developed_length_ft - b.max_developed_length_ft;
    });

  const match = qualifying[0];
  if (!match) {
    throw new OutOfRangeInputError(
      `No tabulated vent size handles ${input.total_dfu} DFU at ${input.developed_length_ft} ft developed length on a ${input.soil_stack_size_in}-in stack.`,
      {
        soil_stack_size_in: input.soil_stack_size_in,
        total_dfu: input.total_dfu,
        developed_length_ft: input.developed_length_ft,
      }
    );
  }

  return {
    result: {
      min_vent_size_in: match.vent_size_in,
      max_developed_length_ft: match.max_developed_length_ft,
      max_dfu_at_size: match.max_dfu,
      soil_stack_size_in: input.soil_stack_size_in,
    },
    steps: [
      {
        step: 1,
        label: "Filter by soil/waste stack diameter",
        formula: `soil_stack_size_in = ${input.soil_stack_size_in} in`,
        value: `${stackRows.length} vent entries`,
      },
      {
        step: 2,
        label: "Apply DFU & developed length limits",
        formula: `max_dfu >= ${input.total_dfu} AND max_developed_length_ft >= ${input.developed_length_ft}`,
        value: `${qualifying.length} qualifying entries`,
      },
      {
        step: 3,
        label: "Select minimum vent diameter",
        formula: "Smallest vent_size_in meeting both limits",
        value: `${match.vent_size_in} in (up to ${match.max_developed_length_ft} ft / ${match.max_dfu} DFU)`,
      },
    ],
    assumptions: [
      `Vent limits read from "${table.title}" (${table.code_ref}).`,
      "Developed length measured along the centerline from connection to open air terminal.",
    ],
    edition: {
      code_family: table.code_family,
      edition: table.edition,
      table_key: table.table_key,
      code_ref: table.code_ref,
      calc_version: CALC_ENGINE_VERSION,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. WSFU Water-Supply Sizing Calculator
// ---------------------------------------------------------------------------

export type SupplyType = "flush_tank" | "flushometer";

export interface WsfuItemInput {
  fixture_key: string;
  count: number;
}

export interface WsfuCalcInput {
  code_family: CodeFamily;
  edition: string;
  supply_type: SupplyType;
  material: string;
  items: WsfuItemInput[];
}

export interface WsfuCalcResult {
  total_wsfu: number;
  demand_gpm: number;
  min_pipe_size_in: number;
  max_gpm_at_size: number;
  max_velocity_fps: number;
  material: string;
}

export function calculateWsfuSupplySize(
  input: WsfuCalcInput,
  store: CodeTableStore
): CalcOutput<WsfuCalcResult> {
  const table = store.getTable(
    input.code_family,
    input.edition,
    "wsfu_supply"
  );

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new OutOfRangeInputError(
      "Provide at least one supply fixture item to calculate WSFU demand."
    );
  }

  const fixtureMap = new Map(
    table.data.fixtures
      .filter((f) => f.supply_type === input.supply_type)
      .map((f) => [f.fixture_key, f])
  );

  let totalWsfu = 0;
  for (const item of input.items) {
    if (!Number.isInteger(item.count) || item.count < 1) {
      throw new OutOfRangeInputError(
        `Fixture count must be a positive integer (got ${item.count}).`
      );
    }
    const row = fixtureMap.get(item.fixture_key);
    if (!row) {
      throw new OutOfRangeInputError(
        `Unknown WSFU fixture "${item.fixture_key}" for supply_type "${input.supply_type}".`,
        { fixture_key: item.fixture_key, supply_type: input.supply_type }
      );
    }
    totalWsfu += row.wsfu * item.count;
  }
  totalWsfu = Number(totalWsfu.toFixed(2));

  const curve = table.data.demand_curve
    .filter((pt) => pt.supply_type === input.supply_type)
    .sort((a, b) => a.max_wsfu - b.max_wsfu);

  if (curve.length === 0) {
    throw new OutOfRangeInputError(
      `No WSFU-to-GPM demand curve entries for supply_type "${input.supply_type}".`
    );
  }

  const maxCurveWsfu = curve[curve.length - 1].max_wsfu;
  if (totalWsfu > maxCurveWsfu) {
    throw new OutOfRangeInputError(
      `Total ${totalWsfu} WSFU exceeds demand curve maximum (${maxCurveWsfu} WSFU).`,
      { total_wsfu: totalWsfu, max_curve_wsfu: maxCurveWsfu }
    );
  }

  let demandGpm: number;
  if (totalWsfu <= curve[0].max_wsfu) {
    demandGpm = (totalWsfu / curve[0].max_wsfu) * curve[0].gpm;
  } else {
    let interpolated = curve[curve.length - 1].gpm;
    for (let i = 1; i < curve.length; i += 1) {
      const p0 = curve[i - 1];
      const p1 = curve[i];
      if (totalWsfu <= p1.max_wsfu) {
        const ratio =
          (totalWsfu - p0.max_wsfu) / Math.max(1e-9, p1.max_wsfu - p0.max_wsfu);
        interpolated = p0.gpm + ratio * (p1.gpm - p0.gpm);
        break;
      }
    }
    demandGpm = interpolated;
  }
  demandGpm = Number(demandGpm.toFixed(2));

  const pipes = table.data.pipe_sizing
    .filter(
      (p) => p.material.toLowerCase() === input.material.trim().toLowerCase()
    )
    .sort((a, b) => a.pipe_size_in - b.pipe_size_in);

  if (pipes.length === 0) {
    throw new OutOfRangeInputError(
      `No water supply pipe sizing entries for material "${input.material}".`,
      { material: input.material }
    );
  }

  const chosenPipe = pipes.find((p) => p.max_gpm >= demandGpm);
  if (!chosenPipe) {
    const maxCap = pipes[pipes.length - 1].max_gpm;
    throw new OutOfRangeInputError(
      `Demand of ${demandGpm} GPM exceeds maximum tabulated capacity (${maxCap} GPM) for ${input.material}.`,
      { demand_gpm: demandGpm, max_gpm: maxCap }
    );
  }

  return {
    result: {
      total_wsfu: totalWsfu,
      demand_gpm: demandGpm,
      min_pipe_size_in: chosenPipe.pipe_size_in,
      max_gpm_at_size: chosenPipe.max_gpm,
      max_velocity_fps: chosenPipe.max_velocity_fps,
      material: chosenPipe.material,
    },
    steps: [
      {
        step: 1,
        label: "Total WSFU load",
        formula: `Sum of ${input.items.length} fixture groups (${input.supply_type})`,
        value: `${totalWsfu} WSFU`,
      },
      {
        step: 2,
        label: "Convert WSFU to peak GPM",
        formula: `Interpolate demand curve at ${totalWsfu} WSFU`,
        value: `${demandGpm} GPM`,
      },
      {
        step: 3,
        label: "Select water pipe diameter",
        formula: `Smallest ${chosenPipe.material} size with max_gpm >= ${demandGpm} GPM`,
        value: `${chosenPipe.pipe_size_in} in (cap ${chosenPipe.max_gpm} GPM @ <= ${chosenPipe.max_velocity_fps} fps)`,
      },
    ],
    assumptions: [
      `WSFU weights, demand curve, and velocity limits read from "${table.title}" (${table.code_ref}).`,
      "Friction loss budget and static elevation adjustments should be verified separately for long risers.",
    ],
    edition: {
      code_family: table.code_family,
      edition: table.edition,
      table_key: table.table_key,
      code_ref: table.code_ref,
      calc_version: CALC_ENGINE_VERSION,
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Gas Pipe Sizing Calculator
// ---------------------------------------------------------------------------

export interface GasCalcInput {
  code_family: CodeFamily;
  edition: string;
  total_btuh: number;
  developed_length_ft: number;
}

export interface GasCalcResult {
  required_cfh: number;
  lookup_length_ft: number;
  min_pipe_size_in: number;
  max_cfh_at_size: number;
  gas_type: string;
  material: string;
}

export function calculateGasPipeSize(
  input: GasCalcInput,
  store: CodeTableStore
): CalcOutput<GasCalcResult> {
  const table = store.getTable(
    input.code_family,
    input.edition,
    "gas_pipe_sizing"
  );

  if (!Number.isFinite(input.total_btuh) || input.total_btuh <= 0) {
    throw new OutOfRangeInputError(
      `total_btuh must be positive (received ${input.total_btuh}).`
    );
  }
  if (
    !Number.isFinite(input.developed_length_ft) ||
    input.developed_length_ft <= 0
  ) {
    throw new OutOfRangeInputError(
      `developed_length_ft must be positive (received ${input.developed_length_ft}).`
    );
  }

  const requiredCfh = Number(
    (input.total_btuh / table.data.heating_value_btu_per_cf).toFixed(2)
  );

  const uniqueLengths = Array.from(
    new Set(table.data.entries.map((e) => e.length_ft))
  ).sort((a, b) => a - b);

  const lookupLength = uniqueLengths.find(
    (len) => len >= input.developed_length_ft
  );
  if (lookupLength === undefined) {
    const maxLen = uniqueLengths[uniqueLengths.length - 1];
    throw new OutOfRangeInputError(
      `Developed length ${input.developed_length_ft} ft exceeds maximum tabulated length (${maxLen} ft).`,
      { developed_length_ft: input.developed_length_ft, max_length_ft: maxLen }
    );
  }

  const columnRows = table.data.entries
    .filter((e) => Math.abs(e.length_ft - lookupLength) <= 1e-6)
    .sort((a, b) => a.pipe_size_in - b.pipe_size_in);

  const match = columnRows.find((e) => e.max_cfh >= requiredCfh);
  if (!match) {
    const maxCap = columnRows[columnRows.length - 1]?.max_cfh ?? 0;
    throw new OutOfRangeInputError(
      `Demand of ${requiredCfh} CFH exceeds maximum capacity (${maxCap} CFH) at ${lookupLength} ft.`,
      { required_cfh: requiredCfh, lookup_length_ft: lookupLength, max_cfh: maxCap }
    );
  }

  return {
    result: {
      required_cfh: requiredCfh,
      lookup_length_ft: lookupLength,
      min_pipe_size_in: match.pipe_size_in,
      max_cfh_at_size: match.max_cfh,
      gas_type: table.data.gas_type,
      material: table.data.material,
    },
    steps: [
      {
        step: 1,
        label: "Convert BTU/h demand to CFH",
        formula: `${input.total_btuh} BTU/h / ${table.data.heating_value_btu_per_cf} BTU/cf`,
        value: `${requiredCfh} CFH`,
      },
      {
        step: 2,
        label: "Select next-higher tabulated length column",
        formula: `Smallest tabulated length >= ${input.developed_length_ft} ft`,
        value: `${lookupLength} ft`,
      },
      {
        step: 3,
        label: "Select minimum gas pipe diameter",
        formula: `max_cfh >= ${requiredCfh} CFH in ${lookupLength} ft column`,
        value: `${match.pipe_size_in} in (${match.max_cfh} CFH max)`,
      },
    ],
    assumptions: [
      `Gas table data read from "${table.title}" (${table.code_ref}).`,
      `Assumes ${table.data.gas_type}, ${table.data.inlet_pressure_inwc} in. w.c. inlet, ${table.data.pressure_drop_inwc} in. w.c. drop, ${table.data.material}.`,
    ],
    edition: {
      code_family: table.code_family,
      edition: table.edition,
      table_key: table.table_key,
      code_ref: table.code_ref,
      calc_version: CALC_ENGINE_VERSION,
    },
  };
}
