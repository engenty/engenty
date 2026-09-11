/**
 * Space-table column definitions.
 *
 * A table is a small database, not a CSV dump: every column has a type and a
 * display format. Agents create the definition; row writes are validated
 * against it.
 */
import { z } from "zod";

const COLUMN_ID = /^[a-z][a-z0-9_]*$/;

const columnBaseSchema = z.object({
  description: z.string().max(1024).optional(),
  /**
   * Where the cell is edited. Omit to use the type default:
   * single-line text and booleans are in-field; everything else is a popout.
   */
  edit: z.enum(["inline", "popout"]).optional(),
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(COLUMN_ID, "column id must be a lowercase slug (a-z, 0-9, _)"),
  name: z.string().min(1).max(128),
  required: z.boolean().optional(),
});

export const numberStyleSchema = z.enum([
  "integer",
  "decimal",
  "percent",
  "currency",
]);
export type NumberStyle = z.infer<typeof numberStyleSchema>;

export const numberFormatSchema = z
  .object({
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code")
      .optional(),
    fractionDigits: z.number().int().min(0).max(8).optional(),
    grouping: z.boolean().optional(),
    style: numberStyleSchema,
  })
  .superRefine((val, ctx) => {
    if (val.style === "currency" && !val.currency) {
      ctx.addIssue({
        code: "custom",
        message: "currency style needs an ISO 4217 code",
        path: ["currency"],
      });
    }
    if (val.style !== "currency" && val.currency) {
      ctx.addIssue({
        code: "custom",
        message: "currency is only valid on currency columns",
        path: ["currency"],
      });
    }
  });
export type NumberFormat = z.infer<typeof numberFormatSchema>;

export const dateKindSchema = z.enum(["date", "datetime", "time"]);
export type DateKind = z.infer<typeof dateKindSchema>;

export const dateStyleSchema = z.enum(["short", "medium", "long", "iso"]);
export type DateStyle = z.infer<typeof dateStyleSchema>;

/** `hours` is clock time with no minutes — `14` or `14:30` both store as `14:00`. */
export const timePrecisionSchema = z.enum(["hours", "minutes", "seconds"]);
export type TimePrecision = z.infer<typeof timePrecisionSchema>;

export const dateFormatSchema = z.object({
  dateStyle: dateStyleSchema.optional(),
  kind: dateKindSchema,
  timePrecision: timePrecisionSchema.optional(),
});
export type DateFormat = z.infer<typeof dateFormatSchema>;

export const durationUnitSchema = z.enum([
  "milliseconds",
  "seconds",
  "minutes",
  "hours",
  "days",
]);
export type DurationUnit = z.infer<typeof durationUnitSchema>;

export const durationDisplaySchema = z.enum([
  "hms",
  "hours",
  "minutes",
  "decimal-hours",
  "iso",
]);
export type DurationDisplay = z.infer<typeof durationDisplaySchema>;

export const durationFormatSchema = z.object({
  display: durationDisplaySchema,
  /** Unit a writer typically types; stored value is always milliseconds. */
  inputUnit: durationUnitSchema,
});
export type DurationFormat = z.infer<typeof durationFormatSchema>;

export const selectOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(128),
});
export type SelectOption = z.infer<typeof selectOptionSchema>;

export const selectFormatSchema = z.object({
  /** Values outside `options` are kept as-is instead of rejected. */
  allowCustom: z.boolean(),
  multiple: z.boolean().optional(),
  options: z.array(selectOptionSchema).max(200),
});
export type SelectFormat = z.infer<typeof selectFormatSchema>;

export const textStyleSchema = z.enum(["single", "multiline", "markdown"]);
export type TextStyle = z.infer<typeof textStyleSchema>;

export const textFormatSchema = z.object({
  /** `single` is one line; `multiline` is plain wrapping text; `markdown` is inline marks. */
  style: textStyleSchema.default("single"),
});
export type TextFormat = z.infer<typeof textFormatSchema>;

export const tableColumnSchema = z.discriminatedUnion("type", [
  columnBaseSchema.extend({
    format: textFormatSchema.optional(),
    type: z.literal("text"),
  }),
  columnBaseSchema.extend({
    format: numberFormatSchema,
    type: z.literal("number"),
  }),
  columnBaseSchema.extend({
    format: dateFormatSchema,
    type: z.literal("date"),
  }),
  columnBaseSchema.extend({
    format: durationFormatSchema,
    type: z.literal("duration"),
  }),
  columnBaseSchema.extend({
    format: selectFormatSchema,
    type: z.literal("select"),
  }),
  columnBaseSchema.extend({ type: z.literal("boolean") }),
]);
export type TableColumn = z.infer<typeof tableColumnSchema>;

export type ColumnEdit = NonNullable<TableColumn["edit"]>;

export function textColumnStyle(column: TableColumn): TextStyle {
  return column.type === "text" ? (column.format?.style ?? "single") : "single";
}

/** Where this cell is edited. Explicit `edit` wins; otherwise type defaults. */
export function columnEdit(column: TableColumn): ColumnEdit {
  if (column.edit) {
    return column.edit;
  }
  if (column.type === "boolean") {
    return "inline";
  }
  if (column.type === "text" && textColumnStyle(column) === "single") {
    return "inline";
  }
  return "popout";
}

export const tableColumnsSchema = z
  .array(tableColumnSchema)
  .min(1)
  .max(64)
  .superRefine((columns, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < columns.length; i++) {
      const id = columns[i]?.id;
      if (!id) {
        continue;
      }
      if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate column id "${id}"`,
          path: [i, "id"],
        });
      }
      seen.add(id);
    }
  });

/**
 * The shape a MODEL is shown for `columns`, as opposed to the one we validate.
 *
 * `tableColumnsSchema` is a six-branch discriminated union that repeats the
 * whole column base per branch. As a tool's JSON Schema that came to 14.7 KB —
 * on its own 5% of a copilot prompt, resent on every model call of every run,
 * whether or not a table is in play. The union earns that as a *contract*; it
 * does not earn it as a *hint*.
 *
 * So the wire shape is one flat object with every format key optional, and the
 * tool re-parses the result with `tableColumnsSchema` before doing anything.
 * Validation is unchanged and the error the model gets back is the strict
 * schema's own; only the advertisement shrinks. Per-type rules live in the
 * tool description, which the model reads anyway.
 */
export const tableColumnWireSchema = z.object({
  description: z.string().optional(),
  edit: z.enum(["inline", "popout"]).optional(),
  format: z
    .object({
      allowCustom: z.boolean().optional(),
      currency: z.string().optional(),
      dateStyle: z.enum(["short", "medium", "long", "iso"]).optional(),
      display: durationDisplaySchema.optional(),
      fractionDigits: z.number().int().optional(),
      grouping: z.boolean().optional(),
      inputUnit: durationUnitSchema.optional(),
      kind: dateKindSchema.optional(),
      multiple: z.boolean().optional(),
      options: z.array(selectOptionSchema).optional(),
      // `style` spans text and number columns; which values are legal follows
      // from `type`, and the strict schema is what decides.
      style: z
        .enum([
          "single",
          "multiline",
          "markdown",
          "integer",
          "decimal",
          "percent",
          "currency",
        ])
        .optional(),
      timePrecision: timePrecisionSchema.optional(),
    })
    .optional(),
  id: z.string(),
  name: z.string(),
  required: z.boolean().optional(),
  type: z.enum(["text", "number", "date", "duration", "select", "boolean"]),
});

export const tableColumnsWireSchema = z.array(tableColumnWireSchema);
export type TableColumnWire = z.infer<typeof tableColumnWireSchema>;

export const DATA_TABLE_ARTIFACT_TYPE = "database" as const;
export const DATA_TABLE_MIME_TYPE = "application/vnd.engenty.database+json";

export const dataTableHandleSchema = z.object({
  table_id: z.string().uuid(),
});
export type DataTableHandle = z.infer<typeof dataTableHandleSchema>;
