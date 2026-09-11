import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import { toast } from "sonner";
import {
  addSpaceMember,
  createSpaceWithSetup,
  deleteSpace,
  getSpaceAgentCatalog,
  getSpaceConnectorCatalog,
  getSpaceMembers,
  getSpaceMounts,
  getSpaceSetupCatalog,
  getSpaceSkillCatalog,
  getSpaceSurface,
  getSpaces,
  getUserDirectory,
  removeSpaceMember,
  restoreSpace,
  type SpaceSetupCatalog,
  type SpaceSetupPayload,
  updateSpaceSetup,
} from "@/lib/api/spaces-client";
import { spaceSetupNotices } from "@/lib/space-setup-notices";

export const spaceKeys = {
  adminList: () => [...spaceKeys.all, "list", "admin"] as const,
  agents: () => [...spaceKeys.all, "catalog", "agents"] as const,
  all: ["spaces"] as const,
  connectors: () => [...spaceKeys.all, "catalog", "connectors"] as const,
  directory: () => [...spaceKeys.all, "directory"] as const,
  list: () => [...spaceKeys.all, "list"] as const,
  members: (spaceId: string) => [...spaceKeys.all, "members", spaceId] as const,
  mounts: (spaceId: string) => [...spaceKeys.all, "mounts", spaceId] as const,
  setupCatalog: () => [...spaceKeys.all, "catalog", "setup"] as const,
  skills: () => [...spaceKeys.all, "catalog", "skills"] as const,
  surface: (spaceId: string) => [...spaceKeys.all, "surface", spaceId] as const,
};

export function useSpacesQuery(options?: { includeDeleted?: boolean }) {
  const includeDeleted = options?.includeDeleted === true;
  return useQuery({
    queryFn: ({ signal }) => getSpaces(signal, { includeDeleted }),
    queryKey: includeDeleted ? spaceKeys.adminList() : spaceKeys.list(),
  });
}

export function useSpaceSetupCatalogQuery(enabled = true) {
  return useQuery({
    enabled,
    // Installed modules and the baseline change only on deploy.
    queryFn: ({ signal }) => getSpaceSetupCatalog(signal),
    queryKey: spaceKeys.setupCatalog(),
    staleTime: 5 * 60_000,
  });
}

export function useSpaceAgentCatalogQuery(enabled = true) {
  return useQuery({
    enabled,
    queryFn: ({ signal }) => getSpaceAgentCatalog(signal),
    queryKey: spaceKeys.agents(),
    staleTime: 60_000,
  });
}

export function useSpaceSkillCatalogQuery(enabled = true) {
  return useQuery({
    enabled,
    queryFn: ({ signal }) => getSpaceSkillCatalog(signal),
    queryKey: spaceKeys.skills(),
    staleTime: 60_000,
  });
}

export function useSpaceConnectorCatalogQuery(enabled = true) {
  return useQuery({
    enabled,
    queryFn: ({ signal }) => getSpaceConnectorCatalog(signal),
    queryKey: spaceKeys.connectors(),
    staleTime: 60_000,
  });
}

export function useSpaceMountsQuery(spaceId: string | null) {
  return useQuery({
    enabled: spaceId != null,
    queryFn: ({ signal }) => getSpaceMounts(spaceId as string, signal),
    queryKey: spaceKeys.mounts(spaceId ?? ""),
  });
}

export function useSpaceSurfaceQuery(spaceId: string | null) {
  return useQuery({
    enabled: spaceId != null,
    queryFn: ({ signal }) => getSpaceSurface(spaceId as string, signal),
    queryKey: spaceKeys.surface(spaceId ?? ""),
  });
}

export function useSpaceMembersQuery(spaceId: string | null) {
  return useQuery({
    enabled: spaceId != null,
    queryFn: ({ signal }) => getSpaceMembers(spaceId as string, signal),
    queryKey: spaceKeys.members(spaceId ?? ""),
  });
}

/**
 * The tenant directory, for the "add someone" picker.
 *
 * Long `staleTime`: colleagues do not appear and disappear while a popover is
 * open, and this is fetched on every space the user visits.
 */
export function useUserDirectoryQuery(enabled = true) {
  return useQuery({
    enabled,
    queryFn: ({ signal }) => getUserDirectory(signal),
    queryKey: spaceKeys.directory(),
    staleTime: 5 * 60_000,
  });
}

export function useAddSpaceMemberMutation(spaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => addSpaceMember(spaceId as string, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: spaceKeys.members(spaceId ?? ""),
      });
    },
  });
}

export function useRemoveSpaceMemberMutation(spaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      removeSpaceMember(spaceId as string, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: spaceKeys.members(spaceId ?? ""),
      });
    },
  });
}

/**
 * The dialog's single save.
 *
 * Create and edit differ by one field (`key`) and one HTTP verb; everything
 * else — the complete desired mount set — is identical, which is the point:
 * the component that creates a space and the component that edits one are the
 * same component, so they must not have two write paths underneath them.
 */
export function useSaveSpaceSetupMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (
      input: SpaceSetupPayload & { key?: string; spaceId?: string }
    ) => {
      const { key, spaceId, ...payload } = input;
      if (spaceId) {
        return updateSpaceSetup(spaceId, payload);
      }
      if (!key) {
        throw new Error("space_key_required");
      }
      return createSpaceWithSetup({ ...payload, key });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.list() });
      const spaceId = result.space.id;
      queryClient.invalidateQueries({ queryKey: spaceKeys.mounts(spaceId) });
      queryClient.invalidateQueries({ queryKey: spaceKeys.surface(spaceId) });
      // A module whose own first-use setup did not finish (its manifest
      // `mountOperation`) is placed but not usable; the save must not read as
      // done for it. Said here, once, for the wizard and the setup dialog.
      const catalog = queryClient.getQueryData<SpaceSetupCatalog>(
        spaceKeys.setupCatalog()
      );
      const names = new Map(
        (catalog?.modules ?? []).map((module) => [module.id, module.name])
      );
      for (const notice of spaceSetupNotices(result.mounted, names)) {
        const detail =
          notice.error ??
          notice.needs
            .map((need) =>
              t(`spaces.setup.needs.${need}`, { defaultValue: need })
            )
            .join(", ");
        toast.warning(
          t("spaces.setup.moduleNotReady", {
            detail,
            module: notice.moduleName,
          }),
          { description: t("spaces.setup.moduleNotReadyRetry") }
        );
      }
    },
  });
}

export function useDeleteSpaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { confirmName: string; spaceId: string }) =>
      deleteSpace(input.spaceId, input.confirmName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.all });
    },
  });
}

export function useRestoreSpaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (spaceId: string) => restoreSpace(spaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: spaceKeys.all });
    },
  });
}
