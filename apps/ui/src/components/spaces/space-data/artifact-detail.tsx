/**
 * A space-scoped artifact in the pane — an app the copilot built, a document
 * it wrote.
 *
 * Markdown opens as a page: reader first, then Edit (slash commands, no
 * toolbar). Other types keep the registry renderer the chat panel uses, plus
 * the same ⋯ menu as the tree (no Open — already showing).
 */
import {
  type ArtifactSummary,
  resolveArtifactRenderer,
  useArtifactDetailQuery,
} from "@engenty/ai-ui";
import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Spinner } from "@engenty/ui-core";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { getSpaceArtifacts } from "@/lib/api/space-drive-client";
import { buildSpaceDataArtifactSlice } from "@/lib/space-data-agent-context";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import { useAskCopilotSidebar } from "@/lib/use-ask-copilot-sidebar";
import { ArtifactFolderPane } from "./artifact-folder-view";
import {
  artifactCopilotEditPrompt,
  useArtifactOverflow,
} from "./artifact-overflow";
import { ArtifactOverflowMenuItems } from "./artifact-overflow-menu";
import { MarkdownPage } from "./markdown-page";
import { PaneChrome } from "./pane-chrome";
import { SPACE_DATA_ARTIFACT_SLICE_ID } from "./surfaces";
import { useArtifactBreadcrumbs } from "./use-artifact-breadcrumbs";

function ArtifactTypedPane({
  artifact,
  breadcrumbs,
  content,
  onClose,
  spaceId,
}: {
  artifact: ArtifactSummary;
  breadcrumbs: PageBreadcrumb[];
  content: string | null;
  onClose: () => void;
  spaceId?: string | null;
}) {
  const { t } = useTranslation("common");
  const { spaceKey = "" } = useParams();
  const askCopilot = useAskCopilotSidebar();
  const overflow = useArtifactOverflow({
    artifactId: artifact.id,
    content,
    parentId: artifact.parent_id ?? null,
    spaceId: spaceId ?? null,
    spaceKey,
    title: artifact.title,
    type: artifact.type,
  });
  const menuItems = useMemo(
    () => (
      <ArtifactOverflowMenuItems
        artifactId={artifact.id}
        capabilities={overflow.capabilities}
        onCopyLink={overflow.copyLink}
        onDelete={overflow.openDelete}
        onDuplicate={() => void overflow.duplicate()}
        onEdit={() =>
          askCopilot(
            artifactCopilotEditPrompt(artifact.type, artifact.title, t)
          )
        }
        onMove={overflow.openMove}
        onRename={overflow.openRename}
        onVersions={overflow.openHistory}
        pending={overflow.pending}
        spaceId={spaceId ?? null}
      />
    ),
    [
      artifact.id,
      artifact.title,
      artifact.type,
      askCopilot,
      overflow.capabilities,
      overflow.copyLink,
      overflow.duplicate,
      overflow.openDelete,
      overflow.openHistory,
      overflow.openMove,
      overflow.openRename,
      overflow.pending,
      spaceId,
      t,
    ]
  );
  const View = resolveArtifactRenderer(artifact.type);
  const actions = (
    <span className="hidden text-muted-foreground text-xs md:inline">
      {[
        t("spaces.data.kind.artifact", { defaultValue: "Artifact" }),
        artifact.type,
        `v${artifact.current_version}`,
      ].join(" · ")}
    </span>
  );

  return (
    <>
      <PaneChrome
        actions={actions}
        breadcrumbs={breadcrumbs}
        menuItems={menuItems}
        onClose={onClose}
      >
        {View ? (
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <View artifact={artifact} content={content} />
          </div>
        ) : content ? (
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-6 py-4 font-mono text-xs">
            {content}
          </pre>
        ) : (
          <p className="p-6 text-muted-foreground text-sm">
            {t("spaces.data.noPreview", {
              defaultValue: "No preview for this file type.",
            })}
          </p>
        )}
      </PaneChrome>
      {overflow.dialogs}
    </>
  );
}

export function ArtifactDetail({
  artifactId,
  onClose,
  spaceId,
}: {
  artifactId: string;
  onClose: () => void;
  spaceId?: string | null;
}) {
  const { t } = useTranslation("common");
  const artifactsQuery = useQuery({
    enabled: Boolean(spaceId),
    queryFn: ({ signal }) => getSpaceArtifacts(spaceId ?? "", signal),
    queryKey: spaceDriveKeys.artifacts(spaceId ?? ""),
  });
  const listed = artifactsQuery.data?.find((row) => row.id === artifactId);
  const listedIsFolder = listed?.type === "folder";
  const query = useArtifactDetailQuery(listedIsFolder ? null : artifactId);
  const artifact = query.data?.artifact ?? null;
  const content = query.data?.version.content ?? null;
  const version = query.data?.version;
  const isFolder = listedIsFolder || artifact?.type === "folder";
  const folderTitle = listed?.title ?? artifact?.title ?? "";

  useRegisterAgentUiSlice(
    SPACE_DATA_ARTIFACT_SLICE_ID,
    useMemo(
      () =>
        artifact && !isFolder
          ? buildSpaceDataArtifactSlice({
              artifactId,
              content,
              title: artifact.title,
              type: artifact.type,
              version: artifact.current_version,
            })
          : null,
      [artifact, artifactId, content, isFolder]
    )
  );

  const breadcrumbs = useArtifactBreadcrumbs(
    isFolder || artifact
      ? { id: artifactId, title: folderTitle || artifact?.title || "" }
      : null,
    spaceId
  );

  if (isFolder) {
    return (
      <ArtifactFolderPane
        artifact={{
          id: artifactId,
          parent_id: listed?.parentId ?? artifact?.parent_id ?? null,
          title: folderTitle,
          type: "folder",
        }}
        breadcrumbs={breadcrumbs}
        onClose={onClose}
        spaceId={spaceId}
      />
    );
  }

  if (artifactsQuery.isPending || query.isPending) {
    return (
      <PaneChrome breadcrumbs={breadcrumbs} onClose={onClose}>
        <div className="flex items-center gap-2 p-6 text-muted-foreground text-sm">
          <Spinner className="size-4" />
          {t("spaces.data.loading")}
        </div>
      </PaneChrome>
    );
  }
  if (query.error || !artifact) {
    return (
      <PaneChrome breadcrumbs={breadcrumbs} onClose={onClose}>
        <p className="p-6 text-destructive text-sm">
          {t("spaces.data.readFailed", {
            defaultValue: "This node could not be read.",
          })}
        </p>
      </PaneChrome>
    );
  }
  if (!version) {
    return (
      <PaneChrome breadcrumbs={breadcrumbs} onClose={onClose}>
        <p className="p-6 text-destructive text-sm">
          {t("spaces.data.readFailed", {
            defaultValue: "This node could not be read.",
          })}
        </p>
      </PaneChrome>
    );
  }
  if (artifact.type === "markdown") {
    return (
      <MarkdownPage
        artifact={artifact}
        breadcrumbs={breadcrumbs}
        content={content ?? ""}
        onClose={onClose}
        spaceId={spaceId}
        version={version}
      />
    );
  }

  return (
    <ArtifactTypedPane
      artifact={artifact}
      breadcrumbs={breadcrumbs}
      content={content}
      onClose={onClose}
      spaceId={spaceId}
    />
  );
}
