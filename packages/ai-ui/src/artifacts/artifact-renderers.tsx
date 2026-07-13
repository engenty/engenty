import { RichEditor } from "@engenty/tiptap-editor/rich";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@engenty/ui-core";
import type { ComponentType } from "react";
import type { ArtifactSummary } from "./artifacts-api.js";

/**
 * Renderer registry: artifact `type` → view component. Real content types
 * register here; the pane resolves by the artifact's `type`.
 */
export interface ArtifactViewProps {
  artifact: ArtifactSummary;
  content: string | null;
}

const renderers = new Map<string, ComponentType<ArtifactViewProps>>();

export function registerArtifactRenderer(
  type: string,
  Component: ComponentType<ArtifactViewProps>
): () => void {
  renderers.set(type, Component);
  return () => {
    renderers.delete(type);
  };
}

export function resolveArtifactRenderer(
  type: string
): ComponentType<ArtifactViewProps> | null {
  return renderers.get(type) ?? null;
}

function MarkdownArtifactView({ content }: ArtifactViewProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <RichEditor
        editable={false}
        markdown={content ?? ""}
        showToolbar={false}
      />
    </div>
  );
}

function HtmlArtifactView({ content }: ArtifactViewProps) {
  return (
    <iframe
      className="min-h-0 flex-1 border-0 bg-white"
      sandbox="allow-forms allow-popups allow-scripts"
      srcDoc={content ?? ""}
      title="HTML artifact"
    />
  );
}

/** Parse a table artifact into headers + rows (JSON array of objects, or CSV). */
function parseTable(
  content: string
): { headers: string[]; rows: string[][] } | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return null;
      }
      const headers = [...new Set(parsed.flatMap((row) => Object.keys(row)))];
      const rows = parsed.map((row) =>
        headers.map((h) => (row[h] == null ? "" : String(row[h])))
      );
      return { headers, rows };
    } catch {
      return null;
    }
  }
  // CSV: naive split (no embedded-comma handling — Phase D upgrades this).
  const lines = trimmed.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return null;
  }
  const split = (line: string) => line.split(",").map((c) => c.trim());
  return { headers: split(lines[0]), rows: lines.slice(1).map(split) };
}

function TableArtifactView({ content }: ArtifactViewProps) {
  const table = content ? parseTable(content) : null;
  if (!table) {
    return (
      <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-sm">
        {content ?? ""}
      </pre>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <Table>
        <TableHeader>
          <TableRow>
            {table.headers.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row, i) => (
            // Row order is stable; index key is fine for a read-only view.
            <TableRow key={String(i)}>
              {row.map((cell, j) => (
                <TableCell key={String(j)}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

registerArtifactRenderer("markdown", MarkdownArtifactView);
registerArtifactRenderer("html", HtmlArtifactView);
registerArtifactRenderer("table", TableArtifactView);
