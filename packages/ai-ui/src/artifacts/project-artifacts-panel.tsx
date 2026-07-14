import { useTranslation } from "@engenty/i18n/ui";
import {
  adminListCardsGridClassName,
  Badge,
  cn,
  ListIconSegmentToggle,
  Spinner,
} from "@engenty/ui-core";
import { LayoutGrid, List, Shapes } from "lucide-react";
import { useState } from "react";
import { ArtifactStoragePicker } from "./artifact-storage-picker.js";
import { activateArtifact } from "./artifact-store.js";
import {
  type ArtifactSummary,
  useArtifactsListQuery,
} from "./artifacts-api.js";
import { WorkspaceArtifactPane } from "./workspace-artifact-pane.js";

/** One pane host shared by all project detail pages (scope re-seeds per project). */
export const ENGENTY_PROJECT_ARTIFACTS_HOST_KEY = "engenty.artifacts.project";

type ArtifactsViewMode = "rows" | "cards";

const VIEW_MODE_STORAGE_KEY = "engenty.artifacts.project_view";

function readStoredViewMode(): ArtifactsViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "cards"
      ? "cards"
      : "rows";
  } catch {
    return "rows";
  }
}

const CARD_CN =
  "ui-canvas-raised cursor-pointer rounded-md bg-card text-left transition-shadow hover:shadow-[var(--e-3)]";

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

/**
 * Project "Artifacts" tab body: the artifacts stored on the project as card
 * rows or a card grid (the standard list views — no table, the count stays
 * small); clicking one opens it in a project-scoped artifact pane mounted
 * alongside. Registered by the projects module via `registerTab`.
 */
export function ProjectArtifactsPanel({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation("ai-ui");
  const listQuery = useArtifactsListQuery("project", projectId);
  const artifacts = listQuery.data ?? [];
  const [viewMode, setViewMode] = useState<ArtifactsViewMode>(() =>
    readStoredViewMode()
  );
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const changeViewMode = (mode: ArtifactsViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // View preference is a nicety; private mode may block storage.
    }
  };

  const open = (artifact: ArtifactSummary) =>
    activateArtifact(ENGENTY_PROJECT_ARTIFACTS_HOST_KEY, artifact.id);

  return (
    <section
      aria-label={t("artifacts.paneLabel")}
      className="mt-4 w-full max-w-4xl"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
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
        <ArtifactStoragePicker scopeId={projectId} scopeType="project" />
      </div>
      {listQuery.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : artifacts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Shapes className="h-6 w-6 text-muted-foreground/50" />
          <p className="max-w-sm text-muted-foreground text-sm">
            {t("artifacts.projectEmpty")}
          </p>
        </div>
      ) : viewMode === "cards" ? (
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
      <WorkspaceArtifactPane
        hostKey={ENGENTY_PROJECT_ARTIFACTS_HOST_KEY}
        scope={{ type: "project", id: projectId }}
      />
    </section>
  );
}
