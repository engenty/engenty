import type { UseQueryResult } from "@engenty/query-client";
import {
  beginOptimisticUpdate,
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import type {
  TeamMemberListItem,
  TeamMembersQueryParams,
  TeamMemberUpdateInput,
} from "./api.js";
import { getTeamMember, getTeamMembers, updateTeamMember } from "./api.js";
import {
  patchTeamMember,
  patchTeamMemberDetailPage,
} from "./lib/team-member-optimistic-cache.js";

// biome-ignore lint/performance/noBarrelFile: preserve established query-hook imports
export {
  useCreateTeamMemberMutation,
  useDeleteTeamMemberMutation,
} from "./lib/team-member-list-optimistic.js";

export const teamMemberKeys = {
  all: ["team", "members"] as const,
  list: (params: TeamMembersQueryParams) =>
    [...teamMemberKeys.all, "list", params] as const,
  detail: (id: string) => [...teamMemberKeys.all, "detail", id] as const,
  detailPage: (id: string) =>
    [...teamMemberKeys.all, "detail-page", id] as const,
};

export function teamMembersListOptions(params: TeamMembersQueryParams) {
  return queryOptions({
    queryKey: teamMemberKeys.list(params),
    queryFn: ({ signal }) => getTeamMembers(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useTeamMembersListQuery(params: TeamMembersQueryParams) {
  return useQuery(teamMembersListOptions(params));
}

export function teamMemberDetailOptions(id: string) {
  return queryOptions({
    queryKey: teamMemberKeys.detail(id),
    queryFn: ({ signal }) => getTeamMember(id, signal),
  });
}

export function useTeamMemberDetailQuery(id: string | null) {
  return useQuery({
    ...teamMemberDetailOptions(id ?? ""),
    enabled: !!id,
  });
}

export interface TeamMemberDetailPageData {
  member: TeamMemberListItem;
}

export function teamMemberDetailPageOptions(id: string) {
  return queryOptions({
    queryKey: teamMemberKeys.detailPage(id),
    queryFn: async ({ signal }) => {
      const member = await getTeamMember(id, signal);
      return { member } satisfies TeamMemberDetailPageData;
    },
  });
}

export function useTeamMemberDetailPageQuery(
  id: string | null
): UseQueryResult<TeamMemberDetailPageData> {
  return useQuery({
    ...teamMemberDetailPageOptions(id ?? ""),
    enabled: !!id,
  });
}

export function useUpdateTeamMemberMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: TeamMemberUpdateInput) => updateTeamMember(id, patch),
    onMutate: async (patch) => ({
      transactions: await Promise.all([
        beginOptimisticUpdate<TeamMemberListItem>(queryClient, {
          queryKey: teamMemberKeys.detail(id),
          update: (current) => patchTeamMember(current, patch),
        }),
        beginOptimisticUpdate<TeamMemberDetailPageData>(queryClient, {
          queryKey: teamMemberKeys.detailPage(id),
          update: (current) => patchTeamMemberDetailPage(current, patch),
        }),
      ]),
    }),
    onError: (_error, _patch, context) => {
      context?.transactions.forEach((transaction) => transaction.rollback());
      toast.error("Could not save the team member.");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(teamMemberKeys.detail(id), saved);
      queryClient.setQueryData<TeamMemberDetailPageData>(
        teamMemberKeys.detailPage(id),
        (current) => (current ? { ...current, member: saved } : current)
      );
    },
  });
}
