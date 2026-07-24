// One panel, five views: the artifacts + workspace files that live inside a
// work container (task | goal | routine | project | global). Backed by the
// Phase 2 `?container=<tier>:<id>` routes so every surface renders the same
// component with only a different container ref. See PLAN-where-work-lives.

import { useTranslation } from "@engenty/i18n/ui";
import {
  adminListCardsGridClassName,
  Badge,
  cn,
  ListIconSegmentToggle,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { FileText, LayoutGrid, List, Shapes } from "lucide-react";
import { useState } from "react";
import { ArtifactStoragePicker } from "./artifact-storage-picker.js";
import { activateArtifact } from "./artifact-store.js";
import {
  type ArtifactScopeType,
  type ArtifactSummary,
  useContainerArtifactsQuery,
  type WorkContainerRef,
} from "./artifacts-api.js";
import { type WorkFileEntry, useWorkFilesQuery } from "./work-files-api.js";
import { WorkspaceArtifactPane } from "./workspace-artifact-pane.js";

type ArtifactsViewMode = "rows" | "cards";

const VIEW_MODE_STORAGE_KEY = "engenty.work_panel.view";

const CARD_CN =
  "ui-canvas-raised cursor-pointer rounded-md bg-card text-left transition-shadow hover:shadow-[var(--e-3)]";

/** Container tiers that map to a promotable artifact scope (storage binding). */
function bindingScopeType(
  tier: WorkContainerRef["tier"]
): Exclude<ArtifactScopeType, "thread"> | null {
  if (tier === "task" || tier === "goal" || tier === "project") {
    return tier;
  }
  return null;
}

function formatBytes(bytes: number | null): string | null {
  if (bytes == null) {
    return null;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

function ArtifactRowCard({
  artifact,
  dateLabel,
  onOpen,
}: {
  artifact: ArtifactSummary;
  dateLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      className={cn(CARD_CN, "flex w-full items-center gap-3 p-3")}
      onClick={onOpen}
      type="button"
    >
      <Shapes className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium text-sm">
        {artifact.title}
      </span>
      <Badge className="shrink-0" variant="secondary">
        {artifact.type}
      </Badge>
      <span className="shrink-0 text-muted-foreground text-xs">
        {dateLabel}
      </span>
    </button>
  );
}

function ArtifactGridCard({
  artifact,
  dateLabel,
  onOpen,
}: {
  artifact: ArtifactSummary;
  dateLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      className={cn(CARD_CN, "flex flex-col gap-2 p-4")}
      onClick={onOpen}
      type="button"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <Shapes className="size-4 shrink-0 text-muted-foreground" />
        <Badge className="shrink-0" variant="secondary">
          {artifact.type}
        </Badge>
      </div>
      <span className="line-clamp-2 w-full font-medium text-sm">
        {artifact.title}
      </span>
      <span className="text-muted-foreground text-xs">{dateLabel}</span>
    </button>
  );
}

function WorkFileRow({ entry }: { entry: WorkFileEntry }) {
  const size = formatBytes(entry.size_bytes);
  return (
    <div className="flex w-full items-center gap-3 rounded-md border bg-card p-3">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-sm">
        {entry.filename}
      </span>
      {size ? (
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {size}
        </span>
      ) : null}
    </div>
  );
}

export interface WorkPanelProps {
  className?: string;
  container: WorkContainerRef;
  /**
   * Pane host for opening an artifact. When `mountPane` is false the caller
   * owns the pane (e.g. task detail reuses the copilot pane) — the panel only
   * activates the artifact into this host.
   */
  hostKey: string;
  /** Mount a self-contained artifact pane (default). */
  mountPane?: boolean;
  /** Offer the rows/cards view toggle (wide surfaces only, e.g. project tab). */
  showViewToggle?: boolean;
}

/**
 * The shared work surface: an Artifacts tab (aggregated over the container)
 * and a Files tab (workspace files under the container's prefixes). Opening an
 * artifact activates it in a `WorkspaceArtifactPane` container-scoped to the
 * same ref.
 */
export function WorkPanel({
  className,
  container,
  hostKey,
  mountPane = true,
  showViewToggle = false,
}: WorkPanelProps) {
  const { t, i18n } = useTranslation("ai-ui");
  const artifactsQuery = useContainerArtifactsQuery(container);
  const filesQuery = useWorkFilesQuery(container);
  const artifacts = artifactsQuery.data ?? [];
  const files = filesQuery.data?.entries ?? [];
  const [viewMode, setViewMode] = useState<ArtifactsViewMode>(() => {
    try {
      return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "cards"
        ? "cards"
        : "rows";
    } catch {
      return "rows";
    }
  });
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const scopeType = bindingScopeType(container.tier);

  const changeViewMode = (mode: ArtifactsViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // View preference is a nicety; private mode may block storage.
    }
  };

  const open = (artifact: ArtifactSummary) =>
    activateArtifact(hostKey, artifact.id);

  return (
    <section aria-label={t("workPanel.label")} className={cn("w-full", className)}>
      <Tabs defaultValue="artifacts">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="artifacts">
              {t("workPanel.artifactsTab")}
            </TabsTrigger>
            <TabsTrigger value="files">{t("workPanel.filesTab")}</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            {showViewToggle ? (
              <ListIconSegmentToggle
                aria-label={t("artifacts.viewLabel")}
                onChange={(mode) => {
                  if (mode !== "") {
                    changeViewMode(mode);
                  }
                }}
                segments={[
                  { value: "rows", label: t("artifacts.viewRows"), icon: List },
                  {
                    value: "cards",
                    label: t("artifacts.viewCards"),
                    icon: LayoutGrid,
                  },
                ]}
                value={viewMode}
              />
            ) : null}
            {scopeType ? (
              <ArtifactStoragePicker
                scopeId={container.id}
                scopeType={scopeType}
              />
            ) : null}
          </div>
        </div>

        <TabsContent value="artifacts">
          {artifactsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : artifacts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Shapes className="h-6 w-6 text-muted-foreground/50" />
              <p className="max-w-sm text-muted-foreground text-sm">
                {t("workPanel.artifactsEmpty")}
              </p>
            </div>
          ) : showViewToggle && viewMode === "cards" ? (
            <div className={adminListCardsGridClassName()}>
              {artifacts.map((artifact) => (
                <ArtifactGridCard
                  artifact={artifact}
                  dateLabel={dateFormat.format(new Date(artifact.updated_at))}
                  key={artifact.id}
                  onOpen={() => open(artifact)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {artifacts.map((artifact) => (
                <ArtifactRowCard
                  artifact={artifact}
                  dateLabel={dateFormat.format(new Date(artifact.updated_at))}
                  key={artifact.id}
                  onOpen={() => open(artifact)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="files">
          {filesQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <FileText className="h-6 w-6 text-muted-foreground/50" />
              <p className="max-w-sm text-muted-foreground text-sm">
                {t("workPanel.filesEmpty")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((entry) => (
                <WorkFileRow entry={entry} key={entry.key} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {mountPane ? (
        <WorkspaceArtifactPane
          container={container}
          hostKey={hostKey}
          // Suppress the copilot-thread default so an owned pane shows only the
          // container's artifacts (never a bystander chat's).
          scope={{ id: null, type: "thread" }}
        />
      ) : null}
    </section>
  );
}
