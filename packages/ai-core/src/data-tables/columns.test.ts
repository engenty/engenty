import { describe, expect, it } from "vitest";
import { columnEdit, type TableColumn, textColumnStyle } from "./columns.js";
import {
  formatDurationCell,
  formatNumberCell,
  formatTableCell,
} from "./columns-format.js";
import {
  coerceColumnValue,
  coerceRowValues,
  parseTableColumns,
  TableColumnValueError,
} from "./columns-value.js";

const hours: TableColumn = {
  format: { kind: "time", timePrecision: "hours" },
  id: "opens",
  name: "Opens",
  type: "date",
};

const money: TableColumn = {
  format: { currency: "EUR", style: "currency" },
  id: "amount",
  name: "Amount",
  type: "number",
};

const duration: TableColumn = {
  format: { display: "hms", inputUnit: "hours" },
  id: "took",
  name: "Took",
  type: "duration",
};

const status: TableColumn = {
  format: {
    allowCustom: true,
    options: [
      { id: "open", label: "Open" },
      { id: "done", label: "Done" },
    ],
  },
  id: "status",
  name: "Status",
  type: "select",
};

const locked: TableColumn = {
  format: {
    allowCustom: false,
    options: [{ id: "a", label: "A" }],
  },
  id: "kind",
  name: "Kind",
  required: true,
  type: "select",
};

describe("parseTableColumns", () => {
  it("rejects a duplicate column id", () => {
    expect(() =>
      parseTableColumns([
        { id: "name", name: "Name", type: "text" },
        { id: "name", name: "Also name", type: "text" },
      ])
    ).toThrow(/duplicate column id/);
  });

  it("requires a currency code on currency columns", () => {
    expect(() =>
      parseTableColumns([
        {
          format: { style: "currency" },
          id: "amount",
          name: "Amount",
          type: "number",
        },
      ])
    ).toThrow(/ISO 4217/);
  });

  it("accepts text style and edit on a text column", () => {
    const [notes] = parseTableColumns([
      {
        edit: "inline",
        format: { style: "markdown" },
        id: "notes",
        name: "Notes",
        type: "text",
      },
    ]);
    expect(notes).toMatchObject({
      edit: "inline",
      format: { style: "markdown" },
      type: "text",
    });
  });
});

describe("coerceColumnValue", () => {
  it("stores clock time with only hours", () => {
    expect(coerceColumnValue(hours, "9")).toBe("09:00");
    expect(coerceColumnValue(hours, "14:30")).toBe("14:00");
  });

  it("rejects a fractional value on an integer column", () => {
    const count: TableColumn = {
      format: { style: "integer" },
      id: "n",
      name: "N",
      type: "number",
    };
    expect(() => coerceColumnValue(count, 1.5)).toThrow(/whole numbers/);
  });

  it("stores a calendar date as YYYY-MM-DD", () => {
    const day: TableColumn = {
      format: { kind: "date" },
      id: "day",
      name: "Day",
      type: "date",
    };
    expect(coerceColumnValue(day, "2026-08-25")).toBe("2026-08-25");
  });

  it("stores duration in milliseconds from the column's input unit", () => {
    expect(coerceColumnValue(duration, 1.5)).toBe(5_400_000);
    expect(coerceColumnValue(duration, { unit: "minutes", value: 90 })).toBe(
      5_400_000
    );
  });

  it("keeps a select value that is not in the enum when custom is allowed", () => {
    expect(coerceColumnValue(status, "waiting-on-legal")).toBe(
      "waiting-on-legal"
    );
  });

  it("rejects a custom select when the column is a closed enum", () => {
    expect(() => coerceColumnValue(locked, "other")).toThrow(
      TableColumnValueError
    );
  });

  it("rejects a missing required cell", () => {
    expect(() => coerceColumnValue(locked, "")).toThrow(/required/);
  });

  it("collapses newlines on single-line text and keeps them on multiline", () => {
    const single: TableColumn = { id: "title", name: "Title", type: "text" };
    const multi: TableColumn = {
      format: { style: "multiline" },
      id: "body",
      name: "Body",
      type: "text",
    };
    expect(coerceColumnValue(single, "Hello\nworld")).toBe("Hello world");
    expect(coerceColumnValue(multi, "Hello\nworld")).toBe("Hello\nworld");
  });
});

describe("columnEdit", () => {
  it("defaults single-line text and booleans to in-field editing", () => {
    const title: TableColumn = { id: "title", name: "Title", type: "text" };
    const notes: TableColumn = {
      format: { style: "markdown" },
      id: "notes",
      name: "Notes",
      type: "text",
    };
    const flag: TableColumn = { id: "ok", name: "Ok", type: "boolean" };
    expect(textColumnStyle(title)).toBe("single");
    expect(columnEdit(title)).toBe("inline");
    expect(columnEdit(notes)).toBe("popout");
    expect(columnEdit(flag)).toBe("inline");
    expect(columnEdit({ ...notes, edit: "inline" })).toBe("inline");
  });
});

describe("coerceRowValues", () => {
  it("fills every column, including blanks", () => {
    const columns = parseTableColumns([
      { id: "name", name: "Name", type: "text" },
      money,
    ]);
    expect(coerceRowValues(columns, { amount: "12.5" })).toEqual({
      amount: 12.5,
      name: null,
    });
  });
});

describe("format", () => {
  it("formats currency and duration", () => {
    expect(formatNumberCell(12.5, money.format, "de")).toMatch(/12/);
    expect(formatDurationCell(5_400_000, duration.format)).toBe("1:30:00");
    expect(formatTableCell(status, "done")).toBe("Done");
    expect(formatTableCell(status, "waiting-on-legal")).toBe(
      "waiting-on-legal"
    );
  });

  it("formats hours-only clock time and percent", () => {
    expect(formatTableCell(hours, "09:00")).toBe("09:00");
    expect(formatNumberCell(0.15, { style: "percent" }, "en")).toMatch(/15/);
  });
});
