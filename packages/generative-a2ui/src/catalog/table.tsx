"use client";

import { createComponentImplementation } from "@a2ui/react/v0_9";
import { DynamicStringSchema, DynamicValueSchema } from "@a2ui/web_core/v0_9";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Table as UiTable,
} from "@engenty/ui-core";
import { z } from "zod";
import { asText, useEngentyA2uiHost, useResolvedProp } from "./host.js";

/**
 * Read a cell by column key: a plain key, or a pointer into the row
 * ("content_json/amount", "content_json.amount") for records that keep their
 * payload nested — the same rows an operation reads and writes.
 */
function readCell(row: Record<string, unknown>, key: string): unknown {
  if (key in row) {
    return row[key];
  }
  let current: unknown = row;
  for (const segment of key.split(/[./]/)) {
    if (!(current && typeof current === "object")) {
      return;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function cellText(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "✓" : "";
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return asText(value);
}

export const Table = createComponentImplementation(
  {
    name: "Table",
    schema: z.object({
      columns: z
        .array(
          z.object({
            align: z.enum(["start", "end"]).optional(),
            key: z.string(),
            label: z.string().optional(),
          })
        )
        .optional(),
      rows: DynamicValueSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const rowsProp = useResolvedProp(context, "rows", props.rows);
    const columns = Array.isArray(props.columns)
      ? props.columns.filter(
          (c): c is { align?: "end" | "start"; key: string; label?: string } =>
            Boolean(c) && typeof c === "object" && typeof c.key === "string"
        )
      : [];
    const rows = Array.isArray(rowsProp)
      ? rowsProp.filter(
          (r): r is Record<string, unknown> =>
            Boolean(r) && typeof r === "object"
        )
      : [];
    if (columns.length === 0) {
      return null;
    }
    return (
      <div className="px-2 py-1">
        <UiTable>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  className={column.align === "end" ? "text-right" : undefined}
                  key={column.key}
                >
                  {column.label ?? column.key}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell
                    className={
                      column.align === "end"
                        ? "text-right tabular-nums"
                        : undefined
                    }
                    key={column.key}
                  >
                    {cellText(readCell(row, column.key))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </UiTable>
      </div>
    );
  }
);

export const Document = createComponentImplementation(
  {
    name: "Document",
    schema: z.object({ artifactRef: DynamicStringSchema.optional() }),
  },
  ({ props }) => {
    const host = useEngentyA2uiHost();
    const artifactId = asText(props.artifactRef);
    if (!artifactId) {
      return null;
    }
    if (host.renderArtifact) {
      return <>{host.renderArtifact(artifactId)}</>;
    }
    return (
      <p className="px-2 text-muted-foreground text-xs">
        Artifact {artifactId}
      </p>
    );
  }
);
