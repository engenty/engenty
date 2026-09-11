/**
 * Shared Artifacts ⋯ mutations (move, versions, duplicate, rename, delete,
 * copy link). Dialogs live outside the dropdown so they survive menu close.
 */
import { artifactsQueryRoot } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery, useQueryClient } from "@engenty/query-client";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { requestAiJson } from "@/lib/api/client";
import { getSpaceArtifacts } from "@/lib/api/space-drive-client";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import { spaceDataArtifactPath, spaceDataPath } from "@/lib/space-routes";
import {
  type ArtifactOverflowCapabilities,
  artifactOverflowForType,
} from "./artifact-overflow-capabilities";
import { ArtifactOverflowDialogs } from "./artifact-overflow-dialogs";

interface ArtifactDetailPayload {
  artifact: { current_version: number; type: string };
  version: { content: string };
}

async function loadArtifactDetail(
  artifactId: string
): Promise<ArtifactDetailPayload> {
  return requestAiJson<ArtifactDetailPayload>(
    `/ai/artifacts/${encodeURIComponent(artifactId)}`
  );
}

export function artifactCopilotEditPrompt(
  type: string,
  name: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (type === "table") {
    return t("spaces.data.artifact.askEditTable", {
      defaultValue:
        "Edit the table artifact «{{name}}» in this Space's Artifacts.",
      name,
    });
  }
  if (type === "app") {
    return t("spaces.data.artifact.askEditApp", {
      defaultValue: "Change the app «{{name}}» in this Space's Artifacts.",
      name,
    });
  }
  if (type === "database") {
    return t("spaces.data.artifact.askEditDatabase", {
      defaultValue:
        "Edit the database artifact «{{name}}» in this Space's Artifacts.",
      name,
    });
  }
  return t("spaces.data.artifact.askEditHtml", {
    defaultValue:
      "Edit the HTML artifact «{{name}}» in this Space's Artifacts.",
    name,
  });
}

export function useArtifactOverflow(input: {
  artifactId: string;
  content?: string | null;
  parentId?: string | null;
  spaceId: string | null;
  spaceKey: string;
  title: string;
  type: string;
}): {
  capabilities: ArtifactOverflowCapabilities;
  copyLink: () => void;
  dialogs: ReactNode;
  duplicate: () => Promise<void>;
  openDelete: () => void;
  openHistory: () => void;
  openMove: () => void;
  openRename: () => void;
  pending: boolean;
} {
  const { artifactId, content, parentId, spaceId, spaceKey, title, type } =
    input;
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const capabilities = useMemo(() => artifactOverflowForType(type), [type]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [renameName, setRenameName] = useState(title);
  const [moveParentId, setMoveParentId] = useState<string | null>(
    parentId ?? null
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: artifactsQueryRoot });
    if (spaceId) {
      void queryClient.invalidateQueries({
        queryKey: spaceDriveKeys.artifacts(spaceId),
      });
    }
  }, [queryClient, spaceId]);

  const copyLink = useCallback(() => {
    const href = `${window.location.origin}${spaceDataArtifactPath(spaceKey, artifactId)}`;
    void navigator.clipboard.writeText(href).then(
      () =>
        toast.success(
          t("spaces.data.artifact.linkCopied", { defaultValue: "Link copied" })
        ),
      () =>
        toast.error(
          t("spaces.data.artifact.linkCopyFailed", {
            defaultValue: "Could not copy link",
          })
        )
    );
  }, [artifactId, spaceKey, t]);

  const foldersQuery = useQuery({
    enabled: Boolean(spaceId) && moveOpen,
    queryFn: ({ signal }) => getSpaceArtifacts(spaceId ?? "", signal),
    queryKey: spaceDriveKeys.artifacts(spaceId ?? ""),
  });
  const folders = (foldersQuery.data ?? []).filter(
    (row) => row.type === "folder" && row.id !== artifactId
  );

  const historyQuery = useQuery({
    enabled: historyOpen,
    queryFn: () =>
      requestAiJson<{
        versions: Array<{
          created_at: string;
          summary: string | null;
          version: number;
        }>;
      }>(`/ai/artifacts/${encodeURIComponent(artifactId)}/versions`),
    queryKey: [...artifactsQueryRoot, "versions", artifactId],
  });
  const historyRows = historyQuery.data?.versions ?? [];
  const currentVersion = historyRows.reduce(
    (max, row) => Math.max(max, row.version),
    0
  );

  const duplicate = useCallback(async () => {
    if (!spaceId) {
      return;
    }
    setPending(true);
    try {
      const rows =
        parentId === undefined ? await getSpaceArtifacts(spaceId) : [];
      const parent =
        parentId === undefined
          ? (rows.find((row) => row.id === artifactId)?.parentId ?? null)
          : parentId;
      const body =
        content == null
          ? (await loadArtifactDetail(artifactId)).version.content
          : content;
      const result = await requestAiJson<{ artifact: { id: string } }>(
        "/ai/artifacts",
        {
          body: {
            content: body,
            parent_id: parent,
            scope_id: spaceId,
            scope_type: "space",
            title: `${title}${t("spaces.data.artifact.duplicateSuffix", {
              defaultValue: " copy",
            })}`,
            type,
          },
          method: "POST",
        }
      );
      invalidate();
      toast.success(
        t("spaces.data.artifact.duplicateDone", { defaultValue: "Duplicated" })
      );
      navigate(spaceDataArtifactPath(spaceKey, result.artifact.id));
    } catch {
      toast.error(
        t("spaces.data.artifact.duplicateFailed", {
          defaultValue: "Could not duplicate",
        })
      );
    } finally {
      setPending(false);
    }
  }, [
    artifactId,
    content,
    invalidate,
    navigate,
    parentId,
    spaceId,
    spaceKey,
    t,
    title,
    type,
  ]);

  const applyMove = useCallback(async () => {
    setPending(true);
    try {
      await requestAiJson(`/ai/artifacts/${encodeURIComponent(artifactId)}`, {
        body: { parent_id: moveParentId },
        method: "PATCH",
      });
      invalidate();
      toast.success(t("spaces.data.artifact.moved", { defaultValue: "Moved" }));
      setMoveOpen(false);
    } catch {
      toast.error(
        t("spaces.data.artifact.moveFailed", { defaultValue: "Could not move" })
      );
    } finally {
      setPending(false);
    }
  }, [artifactId, invalidate, moveParentId, t]);

  const applyRename = useCallback(async () => {
    const next = renameName.trim();
    if (!next) {
      return;
    }
    setPending(true);
    try {
      const detail = await loadArtifactDetail(artifactId);
      await requestAiJson(
        `/ai/artifacts/${encodeURIComponent(artifactId)}/versions`,
        {
          body: {
            content: detail.version.content ?? "",
            expected_version: detail.artifact.current_version,
            summary: "Renamed",
            title: next,
          },
          method: "POST",
        }
      );
      invalidate();
      toast.success(
        t("spaces.data.artifact.renamed", { defaultValue: "Renamed" })
      );
      setRenameOpen(false);
    } catch {
      toast.error(
        t("spaces.data.artifact.renameFailed", {
          defaultValue: "Could not rename",
        })
      );
    } finally {
      setPending(false);
    }
  }, [artifactId, invalidate, renameName, t]);

  const applyDelete = useCallback(async () => {
    setPending(true);
    try {
      await requestAiJson(
        `/ai/artifacts/${encodeURIComponent(artifactId)}/archive`,
        { body: {}, method: "POST" }
      );
      invalidate();
      toast.success(
        t("spaces.data.artifact.deleted", { defaultValue: "Deleted" })
      );
      setDeleteOpen(false);
      if (searchParams.get("artifact") === artifactId && spaceKey) {
        navigate(spaceDataPath(spaceKey));
      }
    } catch {
      toast.error(
        t("spaces.data.artifact.deleteFailed", {
          defaultValue: "Could not delete",
        })
      );
    } finally {
      setPending(false);
    }
  }, [artifactId, invalidate, navigate, searchParams, spaceKey, t]);

  const openMove = useCallback(() => {
    void (async () => {
      let next: string | null;
      if (parentId !== undefined) {
        next = parentId;
      } else if (spaceId) {
        try {
          const rows = await getSpaceArtifacts(spaceId);
          next = rows.find((row) => row.id === artifactId)?.parentId ?? null;
        } catch {
          next = null;
        }
      } else {
        next = null;
      }
      setMoveParentId(next);
      setMoveOpen(true);
    })();
  }, [artifactId, parentId, spaceId]);

  const openDelete = useCallback(() => setDeleteOpen(true), []);
  const openHistory = useCallback(() => setHistoryOpen(true), []);
  const openRename = useCallback(() => {
    setRenameName(title);
    setRenameOpen(true);
  }, [title]);

  const dialogs = (
    <ArtifactOverflowDialogs
      currentVersion={currentVersion}
      deleteOpen={deleteOpen}
      folders={folders.map((folder) => ({
        id: folder.id,
        title: folder.title,
      }))}
      historyOpen={historyOpen}
      historyRows={historyRows}
      labels={{
        cancel: t("actions.cancel"),
        current: t("spaces.data.artifact.historyCurrent", {
          defaultValue: "Current",
        }),
        deleteConfirm: t("spaces.data.artifact.deleteConfirm", {
          defaultValue: "Delete",
        }),
        deleteDescription:
          type === "folder"
            ? t("spaces.data.artifact.deleteFolderDescription", {
                defaultValue:
                  "This folder is archived and leaves Artifacts. This cannot be undone from here.",
              })
            : t("spaces.data.artifact.deleteDescription", {
                defaultValue:
                  "This artifact is archived and leaves Artifacts. This cannot be undone from here.",
              }),
        deleteTitle: t("spaces.data.artifact.deleteTitle", {
          defaultValue: "Delete {{name}}?",
          name: title,
        }),
        history: t("spaces.data.artifact.history", {
          defaultValue: "Versions",
        }),
        historyEmpty: t("spaces.data.artifact.historyEmpty", {
          defaultValue: "Only the current version exists.",
        }),
        moveDescription: t("spaces.data.artifact.moveDescription", {
          defaultValue: "Choose a folder, or the Artifacts root.",
        }),
        moveHere: t("spaces.data.artifact.moveHere", { defaultValue: "Move" }),
        moveTitle: t("spaces.data.artifact.moveTitle", {
          defaultValue: "Move",
        }),
        rename: t("spaces.data.artifact.rename", { defaultValue: "Rename" }),
        root: t("spaces.data.artifact.root", { defaultValue: "Artifacts" }),
      }}
      moveOpen={moveOpen}
      moveParentId={moveParentId}
      onApplyDelete={() => void applyDelete()}
      onApplyMove={() => void applyMove()}
      onApplyRename={() => void applyRename()}
      onDeleteOpenChange={setDeleteOpen}
      onHistoryOpenChange={setHistoryOpen}
      onMoveOpenChange={setMoveOpen}
      onMoveParentIdChange={setMoveParentId}
      onRenameNameChange={setRenameName}
      onRenameOpenChange={setRenameOpen}
      pending={pending}
      renameName={renameName}
      renameOpen={renameOpen}
    />
  );

  return {
    capabilities,
    copyLink,
    dialogs,
    duplicate,
    openDelete,
    openHistory,
    openMove,
    openRename,
    pending,
  };
}
