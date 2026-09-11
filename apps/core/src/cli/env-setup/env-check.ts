import {
  diffScope,
  type EnvVarStatus,
  requiredGaps,
  type ScopeReport,
} from "./env-diff.js";
import { envFilePath, loadScopeDocument, maskSecret } from "./env-files.js";
import { ENV_SCOPES, manifestForScope } from "./env-manifest.js";
import type { EnvScope, EnvVarSpec } from "./env-manifest-types.js";
import { bold, cyan, dim, green, red, underline, yellow } from "./env-style.js";

export function buildScopeReport(
  workspaceRoot: string,
  scope: EnvScope
): ScopeReport {
  return diffScope({
    doc: loadScopeDocument(workspaceRoot, scope),
    scope,
    specs: manifestForScope(scope),
  });
}

function hintFor(spec: EnvVarSpec): string {
  switch (spec.obtain.kind) {
    case "generate":
      return "engenty env generate";
    case "supabase":
      return "pnpm supabase:start, then engenty env init";
    case "portless":
      return "pnpm portless:setup";
    case "provider":
      return spec.obtain.url;
    case "manual":
      return spec.obtain.instructions?.[0] ?? "";
    default:
      return "";
  }
}

/** A cell carries plain text (for width math) plus an optional paint applied after padding. */
interface Cell {
  paint?: (text: string) => string;
  text: string;
}

type Row = { cells: Cell[]; type: "cells" } | { label: string; type: "group" };

function formatTable(rows: Row[]): string {
  const cellRows = rows.filter(
    (row): row is Extract<Row, { type: "cells" }> => row.type === "cells"
  );
  const columnCount = Math.max(...cellRows.map((row) => row.cells.length));
  const widths = Array.from({ length: columnCount }, (_, index) =>
    Math.max(...cellRows.map((row) => row.cells[index]?.text.length ?? 0))
  );
  const lines: string[] = [];
  for (const row of rows) {
    if (row.type === "group") {
      lines.push("", `  ${dim(`── ${row.label} ──`)}`);
      continue;
    }
    const line = row.cells
      .map((cell, index) => {
        const padded = cell.text.padEnd(widths[index]);
        // Blank cells stay unpainted so trailing whitespace trims away.
        return cell.paint && cell.text.trim() !== ""
          ? cell.paint(padded)
          : padded;
      })
      .join("  ")
      .trimEnd();
    lines.push(`  ${line}`);
  }
  return lines.join("\n");
}

const STATUS_STYLES: Record<
  EnvVarStatus,
  { paint: (text: string) => string; symbol: string }
> = {
  empty: { paint: yellow, symbol: "○" },
  invalid: { paint: red, symbol: "✗" },
  missing: { paint: red, symbol: "✗" },
  ok: { paint: green, symbol: "✓" },
  placeholder: { paint: yellow, symbol: "◌" },
};

function statusCell(entry: ScopeReport["vars"][number]): Cell {
  const { paint, symbol } = STATUS_STYLES[entry.status];
  if (entry.portlessOwned) {
    return { paint: cyan, text: `${symbol} ${entry.status} (portless)` };
  }
  // Unset optional vars are informational, not warnings.
  if (entry.requirement === "optional" && entry.status !== "invalid") {
    return entry.status === "ok"
      ? { paint, text: `${symbol} ok` }
      : { paint: dim, text: "· unset" };
  }
  return { paint, text: `${symbol} ${entry.status}` };
}

function summaryLine(report: ScopeReport): string {
  let ok = 0;
  let problems = 0;
  let optionalUnset = 0;
  for (const entry of report.vars) {
    if (entry.status === "ok") {
      ok++;
    } else if (entry.requirement === "optional" && entry.status !== "invalid") {
      optionalUnset++;
    } else {
      problems++;
    }
  }
  const parts = [green(`✓ ${ok} ok`)];
  if (problems > 0) {
    parts.push(red(`✗ ${problems} need attention`));
  }
  if (optionalUnset > 0) {
    parts.push(dim(`· ${optionalUnset} optional unset`));
  }
  return `  ${parts.join(dim("  ·  "))}`;
}

function displayValue(report: ScopeReport["vars"][number]): string {
  if (report.value === undefined || report.value.trim() === "") {
    return "-";
  }
  if (report.spec.secret) {
    return maskSecret(report.value);
  }
  return report.value.length > 40
    ? `${report.value.slice(0, 37)}…`
    : report.value;
}

export function renderScopeReport(
  workspaceRoot: string,
  report: ScopeReport
): string {
  const header = `${bold(underline(ENV_SCOPES[report.scope].label))}  ${dim(envFilePath(workspaceRoot, report.scope))}`;
  if (!report.fileExists) {
    return `${header}\n  ${red("✗ File missing.")} Run: ${cyan("pnpm dev:env:init")}`;
  }

  const rows: Row[] = [
    {
      cells: ["KEY", "STATUS", "VALUE", "HINT"].map((text) => ({
        paint: dim,
        text,
      })),
      type: "cells",
    },
  ];
  let currentGroup: string | undefined;
  for (const entry of report.vars) {
    if (entry.spec.group !== currentGroup) {
      currentGroup = entry.spec.group;
      rows.push({ label: currentGroup, type: "group" });
    }
    const needsHint = entry.status !== "ok";
    rows.push({
      cells: [
        { text: entry.spec.key },
        statusCell(entry),
        { paint: dim, text: displayValue(entry) },
        {
          paint: needsHint && entry.status === "invalid" ? red : dim,
          text: needsHint ? (entry.error ?? hintFor(entry.spec)) : "",
        },
      ],
      type: "cells",
    });
  }

  const lines = [header, formatTable(rows), "", summaryLine(report)];
  if (report.extras.length > 0) {
    lines.push(
      `  ${dim(`extra keys (not in manifest, left untouched): ${report.extras.join(", ")}`)}`
    );
  }
  return lines.join("\n");
}

export interface EnvCheckResult {
  hasRequiredGaps: boolean;
  reports: ScopeReport[];
}

export function runEnvCheck(
  workspaceRoot: string,
  scopes: EnvScope[]
): EnvCheckResult {
  const reports = scopes.map((scope) => buildScopeReport(workspaceRoot, scope));
  const hasRequiredGaps = reports.some(
    (report) => !report.fileExists || requiredGaps(report).length > 0
  );
  return { hasRequiredGaps, reports };
}

export function checkResultToJson(
  workspaceRoot: string,
  result: EnvCheckResult
): unknown {
  return {
    hasRequiredGaps: result.hasRequiredGaps,
    scopes: result.reports.map((report) => ({
      envFile: envFilePath(workspaceRoot, report.scope),
      extras: report.extras,
      fileExists: report.fileExists,
      scope: report.scope,
      vars: report.vars.map((entry) => ({
        error: entry.error,
        key: entry.spec.key,
        portlessOwned: entry.portlessOwned,
        required: entry.requirement,
        secret: entry.spec.secret,
        status: entry.status,
      })),
    })),
  };
}
