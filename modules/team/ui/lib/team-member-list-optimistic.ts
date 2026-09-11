import {
  createOptimisticId,
  prependOptimisticItem,
  reconcileOptimisticItem,
  removeOptimisticItems,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import type {
  TeamMemberCreateInput,
  TeamMemberListItem,
  TeamMembersPaginatedResponse,
  TeamMembersQueryParams,
} from "../api.js";
import { createTeamMember, deleteTeamMember } from "../api.js";
import { teamMemberKeys } from "../queries.js";

export function optimisticTeamMember(
  input: TeamMemberCreateInput,
  id: string,
  now = new Date().toISOString()
): TeamMemberListItem {
  return {
    ...input,
    created_at: now,
    id,
    import_id: input.import_id ?? null,
    last_imported_at: input.last_imported_at ?? null,
    member_type: input.member_type ?? "internal",
    scope_id: "",
    tenant_id: "",
    updated_at: now,
    user_id: null,
  } as TeamMemberListItem;
}

export function teamMemberMatchesList(
  member: TeamMemberListItem,
  params: TeamMembersQueryParams
): boolean {
  const searchable = [
    member.full_name,
    member.email,
    member.position,
    member.department,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    !params.group_id &&
    (!params.location_term_id ||
      member.location_term_id === params.location_term_id) &&
    (!params.role_term_id || member.role_term_id === params.role_term_id) &&
    (!params.search || searchable.includes(params.search.toLowerCase()))
  );
}

export function useCreateTeamMemberMutation(
  listParams: TeamMembersQueryParams
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TeamMemberCreateInput) => createTeamMember(input),
    onMutate: async (input) => {
      const optimisticId = createOptimisticId();
      const optimistic = optimisticTeamMember(input, optimisticId);
      const queryKey = teamMemberKeys.list(listParams);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<TeamMembersPaginatedResponse>(
        queryKey,
        (current) =>
          teamMemberMatchesList(optimistic, listParams)
            ? prependOptimisticItem(current, optimistic)
            : current
      );
      return { optimisticId, queryKey };
    },
    onError: (_error, _input, context) => {
      if (context) {
        queryClient.setQueryData<TeamMembersPaginatedResponse>(
          context.queryKey,
          (current) =>
            removeOptimisticItems(current, new Set([context.optimisticId]))
        );
        void queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
      toast.error("Could not create the team member.");
    },
    onSuccess: (saved, _input, context) => {
      if (context) {
        queryClient.setQueryData<TeamMembersPaginatedResponse>(
          context.queryKey,
          (current) =>
            reconcileOptimisticItem(current, context.optimisticId, saved)
        );
      }
    },
  });
}

export function useDeleteTeamMemberMutation(
  listParams: TeamMembersQueryParams
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTeamMember,
    onMutate: async (id) => {
      const queryKey = teamMemberKeys.list(listParams);
      await queryClient.cancelQueries({ queryKey: teamMemberKeys.all });
      queryClient.setQueryData<TeamMembersPaginatedResponse>(
        queryKey,
        (current) => removeOptimisticItems(current, new Set([id]))
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: teamMemberKeys.all });
      toast.error("Could not delete the team member. The list is refreshing.");
    },
  });
}
