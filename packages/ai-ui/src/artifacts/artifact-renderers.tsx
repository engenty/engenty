import { useTranslation } from "@engenty/i18n/ui";
import type { ComponentType } from "react";
import { AppArtifactView } from "./app-artifact-view.js";
import type { ArtifactSummary } from "./artifacts-api.js";
import { DatabaseArtifactView } from "./database-artifact-view.js";
import { parseFileArtifactHandle } from "./file-artifact-handle.js";
import { MarkdownDocumentEditor } from "./markdown-document-editor.js";
import { useMarkdownReadingStyle } from "./markdown-reading-style.js";
import { TableArtifactView } from "./table-artifact-view.js";
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

function MarkdownArtifactView({ artifact, content }: ArtifactViewProps) {
  const { readingStyle } = useMarkdownReadingStyle();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <MarkdownDocumentEditor
        editable={false}
        markdown={content ?? ""}
        readingStyle={readingStyle}
        title={artifact.title}
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

function MarkdownArtifactEditor({
  artifact,
  initialContent,
  onChange,
}: ArtifactEditorProps) {
  const { readingStyle } = useMarkdownReadingStyle();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <MarkdownDocumentEditor
        editable
        markdown={initialContent}
        onChange={onChange}
        readingStyle={readingStyle}
        title={artifact.title}
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
          extractedTextLoading: t("workPanel.extractedTextLoading"),
          loading: t("workPanel.filePreviewLoading"),
          noExtractedText: t("workPanel.noExtractedText"),
          noPreview: t("workPanel.fileNoPreview"),
          original: t("workPanel.original"),
          parsed: t("workPanel.parsed"),
          truncated: t("workPanel.filePreviewTruncated"),
        }}
      />
    </div>
  );
}

registerArtifactRenderer("markdown", MarkdownArtifactView);
registerArtifactRenderer("html", HtmlArtifactView);
registerArtifactRenderer("table", TableArtifactView);
registerArtifactRenderer("database", DatabaseArtifactView);
// engenty Apps: a bridged, opaque-origin frame rather than a bare iframe —
// see app-artifact-view.tsx.
registerArtifactRenderer("app", AppArtifactView);
registerArtifactRenderer("file", FileArtifactView);
registerArtifactEditor("markdown", MarkdownArtifactEditor);
