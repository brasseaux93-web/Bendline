import { z } from "zod";
import type { CodeFamily } from "@/lib/domain/types";
import {
  InvalidCodeTableSchemaError,
  MissingCodeTableError,
} from "./errors";

export const CALC_ENGINE_VERSION = "1.0.0" as const;

export const CODE_TABLE_KEYS = [
  "dfu_fixtures",
  "drain_sizing",
  "vent_sizing",
  "wsfu_supply",
  "gas_pipe_sizing",
] as const;

export type CodeTableKey = (typeof CODE_TABLE_KEYS)[number];

export const dfuFixturesTableSchema = z.object({
  fixtures: z
    .array(
      z.object({
        fixture_key: z.string().min(1),
        label: z.string().min(1),
        dfu: z.number().positive(),
        min_trap_in: z.number().positive(),
        occupancy: z.enum(["private", "public", "any"]).optional(),
      })
    )
    .min(1),
});

export const drainSizingTableSchema = z.object({
  entries: z
    .array(
      z.object({
        pipe_size_in: z.number().positive(),
        slope_in_per_ft: z.number().min(0),
        max_dfu: z.number().positive(),
        system_kind: z.enum([
          "horizontal_branch",
          "building_drain",
          "vertical_stack",
        ]),
      })
    )
    .min(1),
});

export const ventSizingTableSchema = z.object({
  entries: z
    .array(
      z.object({
        soil_stack_size_in: z.number().positive(),
        max_dfu: z.number().positive(),
        vent_size_in: z.number().positive(),
        max_developed_length_ft: z.number().positive(),
      })
    )
    .min(1),
});

export const wsfuSupplyTableSchema = z.object({
  fixtures: z
    .array(
      z.object({
        fixture_key: z.string().min(1),
        label: z.string().min(1),
        wsfu: z.number().positive(),
        supply_type: z.enum(["flush_tank", "flushometer"]),
      })
    )
    .min(1),
  demand_curve: z
    .array(
      z.object({
        max_wsfu: z.number().positive(),
        gpm: z.number().positive(),
        supply_type: z.enum(["flush_tank", "flushometer"]),
      })
    )
    .min(1),
  pipe_sizing: z
    .array(
      z.object({
        pipe_size_in: z.number().positive(),
        material: z.string().min(1),
        max_gpm: z.number().positive(),
        max_velocity_fps: z.number().positive(),
      })
    )
    .min(1),
});

export const gasPipeSizingTableSchema = z.object({
  gas_type: z.string().min(1),
  heating_value_btu_per_cf: z.number().positive(),
  inlet_pressure_inwc: z.number().positive(),
  pressure_drop_inwc: z.number().positive(),
  material: z.string().min(1),
  entries: z
    .array(
      z.object({
        pipe_size_in: z.number().positive(),
        length_ft: z.number().positive(),
        max_cfh: z.number().positive(),
      })
    )
    .min(1),
});

export type DfuFixturesTableData = z.infer<typeof dfuFixturesTableSchema>;
export type DrainSizingTableData = z.infer<typeof drainSizingTableSchema>;
export type VentSizingTableData = z.infer<typeof ventSizingTableSchema>;
export type WsfuSupplyTableData = z.infer<typeof wsfuSupplyTableSchema>;
export type GasPipeSizingTableData = z.infer<typeof gasPipeSizingTableSchema>;

export interface CodeTableDataMap {
  dfu_fixtures: DfuFixturesTableData;
  drain_sizing: DrainSizingTableData;
  vent_sizing: VentSizingTableData;
  wsfu_supply: WsfuSupplyTableData;
  gas_pipe_sizing: GasPipeSizingTableData;
}

export const TABLE_SCHEMA_BY_KEY = {
  dfu_fixtures: dfuFixturesTableSchema,
  drain_sizing: drainSizingTableSchema,
  vent_sizing: ventSizingTableSchema,
  wsfu_supply: wsfuSupplyTableSchema,
  gas_pipe_sizing: gasPipeSizingTableSchema,
} as const;

export interface CodeTableRecord<K extends CodeTableKey = CodeTableKey> {
  id?: string;
  code_family: CodeFamily;
  edition: string;
  table_key: K;
  schema_version: number;
  title: string;
  code_ref: string;
  data: CodeTableDataMap[K];
  verified_at?: string | null;
}

export interface CalcStep {
  step: number;
  label: string;
  formula: string;
  value: string;
}

export interface CalcEditionMetadata {
  code_family: CodeFamily;
  edition: string;
  table_key: CodeTableKey;
  code_ref: string;
  calc_version: string;
}

export interface CalcOutput<TResult> {
  result: TResult;
  steps: CalcStep[];
  assumptions: string[];
  edition: CalcEditionMetadata;
}

export interface CodeTableStore {
  getTable<K extends CodeTableKey>(
    codeFamily: CodeFamily,
    edition: string,
    tableKey: K
  ): CodeTableRecord<K>;
  hasTable(
    codeFamily: CodeFamily,
    edition: string,
    tableKey: CodeTableKey
  ): boolean;
  listEditions(): Array<{ code_family: CodeFamily; edition: string; table_keys: CodeTableKey[] }>;
}

function makeStoreKey(
  codeFamily: string,
  edition: string,
  tableKey: string
): string {
  return `${codeFamily.trim().toUpperCase()}::${edition.trim()}::${tableKey}`;
}

export function createCodeTableStore(
  records: CodeTableRecord[]
): CodeTableStore {
  const index = new Map<string, CodeTableRecord>();
  for (const record of records) {
    index.set(
      makeStoreKey(record.code_family, record.edition, record.table_key),
      record
    );
  }

  return {
    hasTable(codeFamily, edition, tableKey) {
      return index.has(makeStoreKey(codeFamily, edition, tableKey));
    },
    getTable<K extends CodeTableKey>(
      codeFamily: CodeFamily,
      edition: string,
      tableKey: K
    ): CodeTableRecord<K> {
      const record = index.get(makeStoreKey(codeFamily, edition, tableKey));
      if (!record) {
        throw new MissingCodeTableError(codeFamily, edition, tableKey);
      }
      const schema = TABLE_SCHEMA_BY_KEY[tableKey];
      const parsed = schema.safeParse(record.data);
      if (!parsed.success) {
        throw new InvalidCodeTableSchemaError(
          codeFamily,
          edition,
          tableKey,
          parsed.error.issues[0]?.message ?? "Malformed table data"
        );
      }
      return {
        ...record,
        data: parsed.data as CodeTableDataMap[K],
      } as CodeTableRecord<K>;
    },
    listEditions() {
      const grouped = new Map<
        string,
        { code_family: CodeFamily; edition: string; table_keys: CodeTableKey[] }
      >();
      for (const rec of index.values()) {
        const key = `${rec.code_family}::${rec.edition}`;
        const existing = grouped.get(key) ?? {
          code_family: rec.code_family,
          edition: rec.edition,
          table_keys: [],
        };
        existing.table_keys.push(rec.table_key);
        grouped.set(key, existing);
      }
      return [...grouped.values()];
    },
  };
}
