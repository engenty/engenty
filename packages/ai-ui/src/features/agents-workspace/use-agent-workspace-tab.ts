// State + data for the agent Workspace tab: the resolved mount table, the cached
// per-mount file tree, and a text editor for the selected file (write/delete
// gated by the mount's read-only flag server-side).

import { useEffect, useMemo, useState } from "react";

import {
  useAgentWorkspaceViewQuery,
  useDeleteWorkspaceFileMutation,
  useWorkspaceFileQuery,
  useWorkspaceTreeQuery,
  useWriteWorkspaceFileMutation,
} from "../../lib/admin/agent-workspace-queries";
import type { AgentDetailTab } from "./agent-detail-tabs";
import { buildWorkspaceTree } from "./workspace-tree-utils";

/** The agent's own files: the Files tab browses this mount and no other. */
export const AGENT_HOME_MOUNT = "/home";

export function useAgentWorkspaceTab(params: {
  activeTab: AgentDetailTab;
  agentId: string | null;
  t: (key: string) => string;
}) {
  const active =
    (params.activeTab === "workspace" || params.activeTab === "files") &&
    Boolean(params.agentId);
  const agentId = active ? (params.agentId ?? "") : "";
  // The Files tab is the Workspace browser held on `/home`: what the agent
  // keeps for itself, without the mount table in the way.
  const pinnedMount = params.activeTab === "files" ? AGENT_HOME_MOUNT : null;

  const viewQuery = useAgentWorkspaceViewQuery(agentId);
  const view = viewQuery.data?.workspace ?? null;

  const [selectedMount, setSelectedMount] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editorBody, setEditorBody] = useState("");

  // Default to the first browsable mount once the view resolves; the Files
  // tab defaults to (and stays on) `/home`.
  useEffect(() => {
    if (!view) {
      return;
    }
    if (pinnedMount) {
      if (selectedMount !== pinnedMount) {
        setSelectedMount(pinnedMount);
        setSelectedFile(null);
      }
      return;
    }
    if (selectedMount) {
      return;
    }
    const first = view.mounts.find((mount) => mount.browsable);
    if (first) {
      setSelectedMount(first.path);
    }
  }, [pinnedMount, view, selectedMount]);

  const activeMount = useMemo(
    () => view?.mounts.find((mount) => mount.path === selectedMount) ?? null,
    [view, selectedMount]
  );
  const readOnly = activeMount?.access === "ro";

  const treeQuery = useWorkspaceTreeQuery(agentId, selectedMount ?? "");
  const tree = useMemo(
    () => buildWorkspaceTree(treeQuery.data?.files ?? []),
    [treeQuery.data?.files]
  );
  const existingPaths = useMemo(
    () => new Set((treeQuery.data?.files ?? []).map((file) => file.path)),
    [treeQuery.data?.files]
  );
  // A path the user is composing but hasn't saved yet (404 on read is expected).
  const isNewFile = selectedFile !== null && !existingPaths.has(selectedFile);

  const fileQuery = useWorkspaceFileQuery(
    agentId,
    selectedMount ?? "",
    selectedFile ?? ""
  );

  const loadedBody = fileQuery.data?.content ?? "";
  useEffect(() => {
    setEditorBody(loadedBody);
  }, [loadedBody, selectedFile]);

  const writeMutation = useWriteWorkspaceFileMutation(agentId);
  const deleteMutation = useDeleteWorkspaceFileMutation(agentId);

  const selectMount = (mountPath: string) => {
    setSelectedMount(mountPath);
    setSelectedFile(null);
  };

  const startNewFile = (path: string) => {
    setSelectedFile(path);
    setEditorBody("");
  };

  const errorMessage = (() => {
    const candidate = writeMutation.error ?? deleteMutation.error;
    if (candidate instanceof Error) {
      return candidate.message;
    }
    return null;
  })();

  return {
    activeMount,
    editorBody,
    errorMessage,
    fileQuery,
    isBusy: writeMutation.isPending || deleteMutation.isPending,
    isDirty: selectedFile !== null && editorBody !== loadedBody,
    isNewFile,
    /** True on the Files tab: the mount is `/home` and not for choosing. */
    mountLocked: pinnedMount !== null,
    readOnly,
    selectedFile,
    selectedMount,
    setEditorBody,
    setSelectedFile,
    selectMount,
    startNewFile,
    tree,
    treeQuery,
    view,
    viewQuery,
    onSave: () => {
      if (!(selectedMount && selectedFile) || readOnly) {
        return;
      }
      void writeMutation.mutateAsync({
        content: editorBody,
        mount: selectedMount,
        path: selectedFile,
      });
    },
    onDelete: () => {
      if (!(selectedMount && selectedFile) || readOnly) {
        return;
      }
      void deleteMutation
        .mutateAsync({ mount: selectedMount, path: selectedFile })
        .then(() => setSelectedFile(null));
    },
  };
}
