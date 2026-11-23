export type CalcErrorCode =
  | "MISSING_CODE_TABLE"
  | "INVALID_CODE_TABLE_SCHEMA"
  | "OUT_OF_RANGE_INPUT"
  | "EMPTY_FIXTURES";

export class CalcError extends Error {
  readonly code: CalcErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: CalcErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CalcError";
    this.code = code;
    this.details = details;
  }
}

export class MissingCodeTableError extends CalcError {
  readonly codeFamily: string;
  readonly edition: string;
  readonly tableKey: string;

  constructor(codeFamily: string, edition: string, tableKey: string) {
    super(
      "MISSING_CODE_TABLE",
      `Missing DB code table "${tableKey}" for ${codeFamily} ${edition}. Verify and import table data before calculating.`,
      { codeFamily, edition, tableKey }
    );
    this.name = "MissingCodeTableError";
    this.codeFamily = codeFamily;
    this.edition = edition;
    this.tableKey = tableKey;
  }
}

export class InvalidCodeTableSchemaError extends CalcError {
  constructor(
    codeFamily: string,
    edition: string,
    tableKey: string,
    reason: string
  ) {
    super(
      "INVALID_CODE_TABLE_SCHEMA",
      `Code table "${tableKey}" for ${codeFamily} ${edition} failed schema validation: ${reason}`,
      { codeFamily, edition, tableKey, reason }
    );
    this.name = "InvalidCodeTableSchemaError";
  }
}

export class OutOfRangeInputError extends CalcError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("OUT_OF_RANGE_INPUT", message, details);
    this.name = "OutOfRangeInputError";
  }
}

export class EmptyFixturesError extends CalcError {
  constructor(fixtureName: string, count: number, minRequired: number) {
    super(
      "EMPTY_FIXTURES",
      `Fixture set "${fixtureName}" contains ${count} cases; at least ${minRequired} cases are required.`,
      { fixtureName, count, minRequired }
    );
    this.name = "EmptyFixturesError";
  }
}
