import { Pane, PaneTabStrip, PaneTopBar } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, cn, Spinner } from "@engenty/ui-core";
import {
  Download,
  Maximize2,
  Minimize2,
  Pencil,
  Shapes,
  X,
} from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ObjectPaneBody } from "../objects/object-pane-body.js";
import {
  ArtifactPinMenu,
  type ArtifactStoreTarget,
} from "./artifact-pin-menu.js";
import {
  resolveArtifactEditor,
  resolveArtifactRenderer,
} from "./artifact-renderers.js";
import type { ObjectPaneTab } from "./artifact-store.js";
import type { ArtifactSummary } from "./artifacts-api.js";

const SOURCE_FILE_BY_TYPE: Record<string, { ext: string; mime: string }> = {
  html: { ext: "html", mime: "text/html" },
  markdown: { ext: "md", mime: "text/markdown" },
  table: { ext: "csv", mime: "text/csv" },
};

/** Client-side source download — the content is already in hand. */
function downloadArtifactSource(artifact: ArtifactSummary, content: string) {
  const file = SOURCE_FILE_BY_TYPE[artifact.type] ?? {
    ext: "txt",
    mime: "text/plain",
  };
  const slug =
    artifact.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 64) || "artifact";
  const url = URL.createObjectURL(new Blob([content], { type: file.mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug}.${file.ext}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export interface ArtifactPaneProps {
  activeContent: string | null;
  activeId: string | null;
  artifacts: ArtifactSummary[];
  className?: string;
  isContentLoading: boolean;
  /** Module-object tabs sharing the strip with artifact tabs (see artifact-store). */
  objectTabs?: ObjectPaneTab[];
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  /**
   * Persist a user edit as a new version; throws (with `status: 409` on a
   * version conflict) on failure. Omitting hides the edit affordance.
   */
  onSaveContent?: (params: {
    artifactId: string;
    content: string;
    expectedVersion: number;
  }) => Promise<void>;
  onSetExpanded: (expanded: boolean) => void;
  onSetPaneOpen: (open: boolean) => void;
  /** Store ("pin") the active artifact to a task/project scope; omitting hides the pin menu. */
  onStore?: (target: ArtifactStoreTarget & { artifactId: string }) => void;
  paneExpanded: boolean;
  storePending?: boolean;
  /** Task offered as a one-click store target (set on task detail routes). */
  storeTaskTarget?: { id: string; title?: string } | null;
  style?: CSSProperties;
}

/**
 * The Artifact Pane: a typed pane whose top bar holds artifact tabs (never
 * mixed with other tab kinds) plus pane controls; the body renders the active
 * artifact via the renderer registry, or its editor while editing.
 * Presentational — the list, active content, and actions are provided by
 * WorkspaceArtifactPane.
 */
export function ArtifactPane({
  activeContent,
  activeId,
  artifacts,
  className,
  isContentLoading,
  onActivate,
  onClose,
  onSaveContent,
  onSetExpanded,
  onSetPaneOpen,
  onStore,
  objectTabs = [],
  paneExpanded,
  storePending,
  storeTaskTarget,
  style,
}: ArtifactPaneProps) {
  const { t } = useTranslation("ai-ui");
  const ExpandIcon = paneExpanded ? Minimize2 : Maximize2;

  const activeObjectTab =
    objectTabs.find((tab) => tab.key === activeId) ?? null;
  const active = activeObjectTab
    ? null
    : (artifacts.find((a) => a.id === activeId) ?? null);
  const Renderer = active ? resolveArtifactRenderer(active.type) : null;
  const Editor = active ? resolveArtifactEditor(active.type) : null;

  // Edit session: draft lives in a ref (the editor fires per keystroke), the
  // base content/version are captured at edit start so a concurrent agent
  // update surfaces as a 409 instead of silently losing one side.
  const [editing, setEditing] = useState<{
    artifactId: string;
    baseContent: string;
    baseVersion: number;
  } | null>(null);
  const draftRef = useRef("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Switching tabs (or the artifact leaving the list) discards the session.
  useEffect(() => {
    if (editing && editing.artifactId !== activeId) {
      setEditing(null);
      setSaveError(null);
    }
  }, [activeId, editing]);

  const startEditing = () => {
    if (!(active && typeof activeContent === "string")) {
      return;
    }
    draftRef.current = activeContent;
    setSaveError(null);
    setEditing({
      artifactId: active.id,
      baseContent: activeContent,
      baseVersion: active.current_version,
    });
  };

  const stopEditing = () => {
    setEditing(null);
    setSaveError(null);
  };

  const save = async () => {
    if (!(editing && onSaveContent)) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSaveContent({
        artifactId: editing.artifactId,
        content: draftRef.current,
        expectedVersion: editing.baseVersion,
      });
      setEditing(null);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setSaveError(
        status === 409 ? t("artifacts.saveConflict") : t("artifacts.saveFailed")
      );
    } finally {
      setSaving(false);
    }
  };

  const isEditingActive = Boolean(editing && editing.artifactId === activeId);

  return (
    <Pane
      aria-label={t("artifacts.paneLabel")}
      className={cn("shrink-0", className)}
      style={style}
      topBar={
        <PaneTopBar
          actions={
            isEditingActive ? (
              <>
                <Button
                  disabled={saving}
                  onClick={stopEditing}
                  size="sm"
                  variant="ghost"
                >
                  {t("artifacts.cancelEdit")}
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => void save()}
                  size="sm"
                  variant="default"
                >
                  {saving ? "…" : t("artifacts.saveEdit")}
                </Button>
              </>
            ) : (
              <>
                {active && Editor && typeof activeContent === "string" ? (
                  <Button
                    aria-label={t("artifacts.editAction")}
                    onClick={startEditing}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
                {active && typeof activeContent === "string" ? (
                  <Button
                    aria-label={t("artifacts.downloadAction")}
                    onClick={() =>
                      downloadArtifactSource(active, activeContent)
                    }
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                ) : null}
                {active && onStore ? (
                  <ArtifactPinMenu
                    disabled={storePending}
                    onStore={(target) =>
                      onStore({ ...target, artifactId: active.id })
                    }
                    taskTarget={storeTaskTarget}
                  />
                ) : null}
                <Button
                  aria-label={
                    paneExpanded
                      ? t("artifacts.collapsePane")
                      : t("artifacts.expandPane")
                  }
                  onClick={() => onSetExpanded(!paneExpanded)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ExpandIcon className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={t("artifacts.closePane")}
                  onClick={() => onSetPaneOpen(false)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )
          }
        >
          <PaneTabStrip
            activeId={activeId}
            closeLabel={t("artifacts.closeTab")}
            items={[
              ...artifacts.map((a) => ({ id: a.id, label: a.title })),
              ...objectTabs.map((tab) => ({ id: tab.key, label: tab.title })),
            ]}
            onActivate={onActivate}
            onClose={onClose}
          />
          {/* Stored artifacts carry their home scope; thread scope is implied. */}
          {active && active.scope_type !== "thread" ? (
            <Badge className="ml-1 shrink-0" variant="secondary">
              {t(`artifacts.scope.${active.scope_type}`)}
            </Badge>
          ) : null}
        </PaneTopBar>
      }
    >
      {saveError ? (
        <p className="border-b px-4 py-2 text-destructive text-sm">
          {saveError}
        </p>
      ) : null}
      {activeObjectTab ? (
        <ObjectPaneBody objectRef={activeObjectTab.ref} />
      ) : active && isEditingActive && Editor ? (
        <Editor
          artifact={active}
          initialContent={editing?.baseContent ?? ""}
          onChange={(content) => {
            draftRef.current = content;
          }}
        />
      ) : active && Renderer ? (
        isContentLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <Renderer artifact={active} content={activeContent} />
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <Shapes className="h-6 w-6 text-muted-foreground/50" />
          <p className="max-w-sm text-muted-foreground text-sm">
            {t("artifacts.empty")}
          </p>
        </div>
      )}
    </Pane>
  );
}
