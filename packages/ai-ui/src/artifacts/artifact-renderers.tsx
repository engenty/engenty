import { useTranslation } from "@engenty/i18n/ui";
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
import { AppArtifactView } from "./app-artifact-view.js";
import type { ArtifactSummary } from "./artifacts-api.js";
import { parseFileArtifactHandle } from "./file-artifact-handle.js";
import { WorkFilePreview } from "./work-file-preview.js";

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

/**
 * Editor registry: artifact `type` → editing component. A registered editor
 * makes the pane offer an Edit mode; saving posts a new version. Editors hold
 * no persistence themselves — they report the draft source via `onChange`.
 */
export interface ArtifactEditorProps {
  artifact: ArtifactSummary;
  /** The version content the edit session started from. */
  initialContent: string;
  onChange: (content: string) => void;
}

const editors = new Map<string, ComponentType<ArtifactEditorProps>>();

export function registerArtifactEditor(
  type: string,
  Component: ComponentType<ArtifactEditorProps>
): () => void {
  editors.set(type, Component);
  return () => {
    editors.delete(type);
  };
}

export function resolveArtifactEditor(
  type: string
): ComponentType<ArtifactEditorProps> | null {
  return editors.get(type) ?? null;
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

function MarkdownArtifactEditor({
  initialContent,
  onChange,
}: ArtifactEditorProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <RichEditor
        editable
        markdown={initialContent}
        onChange={(_json, markdown) => onChange(markdown)}
        showToolbar
      />
    </div>
  );
}

/**
 * A `file` artifact renders the stored object it points at — the same preview
 * the Files tab uses (text/json/markdown/csv/images/pdf, office via the core
 * preview-pdf route, a "no preview" placard otherwise). Download lives on the
 * pane header, so every file is reachable even when nothing can preview it.
 */
function FileArtifactView({ content }: ArtifactViewProps) {
  const { t } = useTranslation("ai-ui");
  const handle = parseFileArtifactHandle(content);
  if (!handle) {
    return (
      <div className="min-h-0 flex-1 p-6 text-muted-foreground text-sm">
        {t("workPanel.fileNoPreview")}
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <WorkFilePreview
        entryKey={handle.key}
        filename={handle.name}
        labels={{
          loading: t("workPanel.filePreviewLoading"),
          noPreview: t("workPanel.fileNoPreview"),
          truncated: t("workPanel.filePreviewTruncated"),
        }}
      />
    </div>
  );
}

registerArtifactRenderer("markdown", MarkdownArtifactView);
registerArtifactRenderer("html", HtmlArtifactView);
registerArtifactRenderer("table", TableArtifactView);
// engenty Apps: a bridged, opaque-origin frame rather than a bare iframe —
// see app-artifact-view.tsx.
registerArtifactRenderer("app", AppArtifactView);
registerArtifactRenderer("file", FileArtifactView);
registerArtifactEditor("markdown", MarkdownArtifactEditor);
