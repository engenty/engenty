import type { UseQueryResult } from "@engenty/query-client";
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type {
  TeamMemberCreateInput,
  TeamMemberListItem,
  TeamMembersQueryParams,
  TeamMemberUpdateInput,
} from "./api.js";
import {
  createTeamMember,
  deleteTeamMember,
  getTeamMember,
  getTeamMembers,
  updateTeamMember,
} from "./api.js";

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

export function useCreateTeamMemberMutation(
  listParams: TeamMembersQueryParams
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TeamMemberCreateInput) => createTeamMember(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teamMemberKeys.list(listParams),
      });
    },
  });
}

export function useUpdateTeamMemberMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: TeamMemberUpdateInput) => updateTeamMember(id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teamMemberKeys.detail(id),
      });
      await queryClient.invalidateQueries({
        queryKey: teamMemberKeys.detailPage(id),
      });
    },
  });
}

export function useDeleteTeamMemberMutation(
  listParams: TeamMembersQueryParams
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTeamMember,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: teamMemberKeys.list(listParams),
      });
    },
  });
}
