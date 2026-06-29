// TanStack Query bindings for the file-storage skill catalog (`/ai/skills`).
// Reads list both tiers; mutations are custom-only (managed skills are read-only
// and rejected server-side). Install/upload write into the custom tier.

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  deleteFileStorageSkill,
  getFileStorageSkill,
  getFileStorageSkills,
  installSkillFromRegistry,
  listSkillRegistryProviders,
  reseedManagedSkills,
  searchSkillRegistry,
  type UpsertFileStorageSkillInput,
  upsertFileStorageSkill,
} from "./skills-api.js";

function aiServiceConfigured(): boolean {
  return Boolean(
    (
      import.meta as unknown as { env?: Record<string, string | undefined> }
    ).env?.VITE_ENGENTY_AI_BASE_URL?.trim()
  );
}

export const skillCatalogKeys = {
  all: ["file-storage-skills"] as const,
  detail: (name: string | null) =>
    [...skillCatalogKeys.all, "detail", name] as const,
  list: () => [...skillCatalogKeys.all, "list"] as const,
  providers: () => [...skillCatalogKeys.all, "providers"] as const,
  search: (provider: string | null, query: string) =>
    [...skillCatalogKeys.all, "search", provider, query] as const,
};

export const skillCatalogListOptions = queryOptions({
  queryFn: ({ signal }) => getFileStorageSkills(signal),
  queryKey: skillCatalogKeys.list(),
  retry: false,
  staleTime: 30_000,
});

export function skillCatalogDetailOptions(name: string | null) {
  return queryOptions({
    enabled: Boolean(name),
    queryFn: ({ signal }) => getFileStorageSkill(name ?? "", signal),
    queryKey: skillCatalogKeys.detail(name),
    retry: false,
  });
}

export const skillRegistryProvidersOptions = queryOptions({
  queryFn: ({ signal }) => listSkillRegistryProviders(signal),
  queryKey: skillCatalogKeys.providers(),
  retry: false,
  staleTime: 5 * 60_000,
});

export function useSkillCatalogQuery(enabled = true) {
  return useQuery({
    ...skillCatalogListOptions,
    enabled: enabled && aiServiceConfigured(),
  });
}

export function useSkillCatalogDetailQuery(name: string | null) {
  return useQuery(skillCatalogDetailOptions(name));
}

export function useSkillRegistryProvidersQuery(enabled = true) {
  return useQuery({
    ...skillRegistryProvidersOptions,
    enabled: enabled && aiServiceConfigured(),
  });
}

export function useSkillRegistrySearchQuery(
  provider: string | null,
  query: string,
  enabled: boolean
) {
  return useQuery({
    enabled: enabled && Boolean(provider) && aiServiceConfigured(),
    queryFn: ({ signal }) => searchSkillRegistry(provider ?? "", query, signal),
    queryKey: skillCatalogKeys.search(provider, query),
    retry: false,
  });
}

function useInvalidateSkillCatalog() {
  const queryClient = useQueryClient();
  return async (name?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: skillCatalogKeys.list() }),
      name
        ? queryClient.invalidateQueries({
            queryKey: skillCatalogKeys.detail(name),
          })
        : Promise.resolve(),
    ]);
  };
}

export function useUpsertSkillMutation() {
  const invalidate = useInvalidateSkillCatalog();
  return useMutation({
    mutationFn: (input: UpsertFileStorageSkillInput) =>
      upsertFileStorageSkill(input),
    onSuccess: (result) => invalidate(result.skill.name),
  });
}

export function useDeleteSkillMutation() {
  const invalidate = useInvalidateSkillCatalog();
  return useMutation({
    mutationFn: (name: string) => deleteFileStorageSkill(name),
    onSuccess: (_result, name) => invalidate(name),
  });
}

export function useReseedSkillsMutation() {
  const invalidate = useInvalidateSkillCatalog();
  return useMutation({
    mutationFn: (force?: boolean) => reseedManagedSkills(force ?? false),
    onSuccess: () => invalidate(),
  });
}

export function useInstallSkillMutation() {
  const invalidate = useInvalidateSkillCatalog();
  return useMutation({
    mutationFn: (input: { provider: string; ref: { id: string } }) =>
      installSkillFromRegistry(input),
    onSuccess: (result) => invalidate(result.skill.name),
  });
}
