/**
 * Doing things in the space Data tree (PLAN-space-data-agent-crud P3.1/P3.3).
 *
 * Two jobs, both of which the tree previously had no answer for:
 *
 * 1. **The mutations**, going through `/data/*` — the same endpoints an agent
 *    uses. Two editors over one store is the split this whole design removes,
 *    so the human's "New folder" and the agent's `mkdir` are one call.
 * 2. **Reading the outcome correctly**, which is harder than it looks. Three of
 *    the four things that can come back are NOT failures — an approval was
 *    raised, a version was stale, or the module does not have this gesture —
 *    and each needs a different sentence and a different affordance.
 *
 * Markdown pages are `ai.artifact` rows (mixed into Artifacts), not a module
 * `/data` create. Knowledge Base articles still go through the KB adapter when
 * that module is mounted.
 */
import { artifactsQueryRoot } from "@engenty/ai-ui";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import { requestAiJson } from "@/lib/api/client";
import {
  createSpaceDataNode,
  deleteSpaceDataNode,
  moveSpaceDataNode,
} from "@/lib/api/space-data-client";

export {
  describeSpaceDataOutcome,
  type SpaceDataOutcome,
} from "@/lib/space-data-outcome";

import { spaceDriveKeys } from "@/lib/space-drive-queries";

/** Everything the Data tab shows is derived from these queries. */
function invalidateTree(client: QueryClient, spaceId: string): void {
  void client.invalidateQueries({
    queryKey: spaceDriveKeys.dataRoots(spaceId),
  });
  void client.invalidateQueries({
    queryKey: [...spaceDriveKeys.dataChildren(spaceId, "")].slice(0, -1),
  });
  void client.invalidateQueries({
    queryKey: spaceDriveKeys.artifacts(spaceId),
  });
  void client.invalidateQueries({ queryKey: artifactsQueryRoot });
}

export interface SpaceDataActions {
  createArtifact: (input: {
    content?: string;
    name: string;
    type: string;
  }) => Promise<{ id: string }>;
  createFolder: (input: { name: string; parentPath: string }) => Promise<void>;
  createPage: (input: { name: string }) => Promise<{ id: string }>;
  isBusy: boolean;
  moveArtifact: (input: {
    id: string;
    parentId: string | null;
  }) => Promise<void>;
  moveNode: (input: { path: string; toParentPath: string }) => Promise<void>;
  removeArtifact: (input: { id: string }) => Promise<void>;
  removeNode: (input: { path: string; recursive: boolean }) => Promise<void>;
  renameArtifact: (input: { id: string; title: string }) => Promise<void>;
  renameNode: (input: { newName: string; path: string }) => Promise<void>;
}

export function useSpaceDataActions(spaceId: string | null): SpaceDataActions {
  const client = useQueryClient();
  const id = spaceId ?? "";

  const create = useMutation({
    mutationFn: (input: {
      kind: "folder" | "node";
      name: string;
      nodeType?: string;
      parentPath: string;
    }) =>
      createSpaceDataNode({
        kind: input.kind,
        name: input.name,
        parentPath: input.parentPath,
        spaceId: id,
        ...(input.nodeType ? { nodeType: input.nodeType } : {}),
      }),
    onSuccess: () => invalidateTree(client, id),
  });

  const createArtifactMut = useMutation({
    mutationFn: async (input: {
      content?: string;
      name: string;
      type: string;
    }) => {
      const result = await requestAiJson<{ artifact: { id: string } }>(
        "/ai/artifacts",
        {
          body: {
            content: input.content ?? "",
            scope_id: id,
            scope_type: "space",
            title: input.name,
            type: input.type,
          },
          method: "POST",
        }
      );
      return result.artifact;
    },
    onSuccess: () => invalidateTree(client, id),
  });

  const rename = useMutation({
    mutationFn: (input: { newName: string; path: string }) =>
      moveSpaceDataNode({
        newName: input.newName,
        path: input.path,
        spaceId: id,
      }),
    onSuccess: () => invalidateTree(client, id),
  });

  const move = useMutation({
    mutationFn: (input: { path: string; toParentPath: string }) =>
      moveSpaceDataNode({
        path: input.path,
        spaceId: id,
        toParentPath: input.toParentPath,
      }),
    onSuccess: () => invalidateTree(client, id),
  });

  const moveArtifactMut = useMutation({
    mutationFn: (input: { id: string; parentId: string | null }) =>
      requestAiJson(`/ai/artifacts/${encodeURIComponent(input.id)}`, {
        body: { parent_id: input.parentId },
        method: "PATCH",
      }),
    onSuccess: () => invalidateTree(client, id),
  });

  const renameArtifactMut = useMutation({
    mutationFn: async (input: { id: string; title: string }) => {
      const detail = await requestAiJson<{
        artifact: { current_version: number };
        version: { content: string };
      }>(`/ai/artifacts/${encodeURIComponent(input.id)}`);
      await requestAiJson(
        `/ai/artifacts/${encodeURIComponent(input.id)}/versions`,
        {
          body: {
            content: detail.version.content ?? "",
            expected_version: detail.artifact.current_version,
            summary: "Renamed",
            title: input.title,
          },
          method: "POST",
        }
      );
    },
    onSuccess: () => invalidateTree(client, id),
  });

  const remove = useMutation({
    mutationFn: (input: { path: string; recursive: boolean }) =>
      deleteSpaceDataNode({
        path: input.path,
        recursive: input.recursive,
        spaceId: id,
      }),
    onSuccess: () => invalidateTree(client, id),
  });

  const removeArtifactMut = useMutation({
    mutationFn: (input: { id: string }) =>
      requestAiJson(`/ai/artifacts/${encodeURIComponent(input.id)}/archive`, {
        body: {},
        method: "POST",
      }),
    onSuccess: () => invalidateTree(client, id),
  });

  return {
    createArtifact: async (input) => createArtifactMut.mutateAsync(input),
    createFolder: async (input) => {
      await create.mutateAsync({ kind: "folder", ...input });
    },
    createPage: async (input) =>
      createArtifactMut.mutateAsync({ name: input.name, type: "markdown" }),
    isBusy:
      create.isPending ||
      createArtifactMut.isPending ||
      rename.isPending ||
      renameArtifactMut.isPending ||
      move.isPending ||
      moveArtifactMut.isPending ||
      remove.isPending ||
      removeArtifactMut.isPending,
    moveArtifact: async (input) => {
      await moveArtifactMut.mutateAsync(input);
    },
    moveNode: async (input) => {
      await move.mutateAsync(input);
    },
    removeArtifact: async (input) => {
      await removeArtifactMut.mutateAsync(input);
    },
    removeNode: async (input) => {
      await remove.mutateAsync(input);
    },
    renameArtifact: async (input) => {
      await renameArtifactMut.mutateAsync(input);
    },
    renameNode: async (input) => {
      await rename.mutateAsync(input);
    },
  };
}
