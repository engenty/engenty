// Artifact detail — opens one artifact read-only via the shared renderer
// registry (markdown / html / table). Reached by clicking a card in the
// artifacts catalog; also works as a cold deep-link.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { ArrowLeft, Database, Download, HardDrive, Users } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
// Side-effect import: registers the markdown/html/table renderers.
import { resolveArtifactRenderer } from "../artifacts/artifact-renderers";
import type { AdminArtifactRow } from "../artifacts/artifacts-api";
import { useArtifactDetailQuery } from "../artifacts/artifacts-api";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildArtifactsPath,
} from "../features/agents-workspace/agent-workspace-paths";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";

const SOURCE_FILE_BY_TYPE: Record<string, { ext: string; mime: string }> = {
  html: { ext: "html", mime: "text/html" },
  markdown: { ext: "md", mime: "text/markdown" },
  table: { ext: "csv", mime: "text/csv" },
};

function downloadSource(title: string, type: string, content: string) {
  const file = SOURCE_FILE_BY_TYPE[type] ?? { ext: "txt", mime: "text/plain" };
  const slug =
    title
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

export function ArtifactsDetailPage() {
  const { t } = useTranslation("ai-ui");
  const { artifactId = "" } = useParams();
  const location = useLocation();
  // The catalog passes the full admin row via router state; absent on deep-link.
  const stateRow = (location.state as { row?: AdminArtifactRow } | null)?.row;

  const nav = useWorkspaceNavData();
  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });

  const detailQuery = useArtifactDetailQuery(artifactId || null);
  const artifact = detailQuery.data?.artifact;
  const content = detailQuery.data?.version.content ?? null;

  const title = artifact?.title ?? stateRow?.title ?? "";
  const type = artifact?.type ?? stateRow?.type ?? "";
  const scopeType = artifact?.scope_type ?? stateRow?.scope_type ?? "";
  const scopeId = artifact?.scope_id ?? stateRow?.scope_id ?? "";
  const version = artifact?.current_version ?? stateRow?.current_version;

  usePageConfig({
    actions:
      content != null && type ? (
        <Button
          className="gap-1.5"
          onClick={() => downloadSource(title, type, content)}
          size="sm"
          variant="outline"
        >
          <Download className="size-4" />
          {t("artifactDetail.download")}
        </Button>
      ) : undefined,
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("artifactsCatalog.title"), to: buildArtifactsPath() },
      { label: title || t("artifactDetail.untitled") },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const Renderer = type ? resolveArtifactRenderer(type) : null;
  const audienceKey = `artifactsCatalog.audience.${scopeType}`;
  const audience = t(audienceKey);
  const scopeLabelKey = `artifactsCatalog.scope.${scopeType}`;
  const scopeLabel = t(scopeLabelKey);
  const StorageIcon = stateRow?.storage === "blob" ? HardDrive : Database;

  const notFound =
    !detailQuery.isLoading && (detailQuery.isError || !detailQuery.data);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden p-page">
      <div className="mb-3 flex flex-col gap-2">
        <Button asChild className="w-fit gap-1.5" size="sm" variant="ghost">
          <Link to={buildArtifactsPath()}>
            <ArrowLeft className="size-4" />
            {t("artifactDetail.back")}
          </Link>
        </Button>

        {/* Where it lives + who can see it */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {scopeType ? (
            <Badge variant="secondary">
              {scopeLabel === scopeLabelKey ? scopeType : scopeLabel}
            </Badge>
          ) : null}
          {scopeId ? (
            <span
              className="truncate font-mono text-muted-foreground text-xs"
              title={scopeId}
            >
              {scopeId}
            </span>
          ) : null}
          {audience === audienceKey ? null : (
            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
              <Users aria-hidden className="size-3.5 shrink-0" />
              {audience}
            </span>
          )}
          {stateRow ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
              <StorageIcon aria-hidden className="size-3.5 shrink-0" />
              {t(
                stateRow.storage === "blob"
                  ? "artifactsCatalog.storage.blob.label"
                  : "artifactsCatalog.storage.inline.label"
              )}
            </span>
          ) : null}
          {version ? (
            <span className="font-mono text-muted-foreground text-xs">
              v{version}
            </span>
          ) : null}
        </div>
      </div>

      <div className="ui-canvas-raised flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        {detailQuery.isLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : notFound ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("artifactDetail.notFound")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : Renderer ? (
          <Renderer
            artifact={artifact ?? stateRowAsSummary(stateRow)}
            content={content}
          />
        ) : (
          <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-sm">
            {content ?? ""}
          </pre>
        )}
      </div>
    </section>
  );
}

/** Minimal ArtifactSummary from a cold deep-link's router state (best effort). */
function stateRowAsSummary(row: AdminArtifactRow | undefined) {
  return {
    current_version: row?.current_version ?? 1,
    id: row?.id ?? "",
    scope_id: row?.scope_id ?? "",
    scope_type: row?.scope_type ?? "thread",
    title: row?.title ?? "",
    type: row?.type ?? "",
    updated_at: row?.updated_at ?? "",
  } as const;
}
