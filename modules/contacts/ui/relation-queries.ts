import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type {
  ContactRelation,
  ContactRelationCreateInput,
  ContactRelationUpdateInput,
} from "./api/contacts.js";
import {
  createContactRelation,
  deleteContactRelation,
  getContactRelations,
  updateContactRelation,
} from "./api/contacts.js";
import { contactKeys } from "./queries.js";

export function contactRelationsOptions(
  contactId: string,
  options?: { includeInactive?: boolean }
) {
  return queryOptions({
    queryKey: contactKeys.relations(
      contactId,
      options?.includeInactive === true
    ),
    queryFn: ({ signal }) => getContactRelations(contactId, options, signal),
  });
}

export function useContactRelationsQuery(
  contactId: string | null,
  options?: { includeInactive?: boolean }
) {
  return useQuery({
    ...contactRelationsOptions(contactId ?? "", options),
    enabled: !!contactId,
  });
}

async function invalidateRelationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  relation: Pick<ContactRelation, "from_contact_id" | "to_contact_id">
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: contactKeys.relations(relation.from_contact_id, false),
    }),
    queryClient.invalidateQueries({
      queryKey: contactKeys.relations(relation.to_contact_id, false),
    }),
    queryClient.invalidateQueries({
      queryKey: contactKeys.relations(relation.from_contact_id, true),
    }),
    queryClient.invalidateQueries({
      queryKey: contactKeys.relations(relation.to_contact_id, true),
    }),
    queryClient.invalidateQueries({
      queryKey: contactKeys.detail(relation.from_contact_id),
    }),
    queryClient.invalidateQueries({
      queryKey: contactKeys.detail(relation.to_contact_id),
    }),
  ]);
}

export function useCreateContactRelationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactRelationCreateInput) =>
      createContactRelation(input),
    onSuccess: async (relation) => {
      await invalidateRelationQueries(queryClient, relation);
    },
  });
}

export function useUpdateContactRelationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      patch: ContactRelationUpdateInput;
      relationId: string;
    }) => updateContactRelation(input.relationId, input.patch),
    onSuccess: async (relation) => {
      await invalidateRelationQueries(queryClient, relation);
    },
  });
}

export function useDeleteContactRelationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (relationId: string) => deleteContactRelation(relationId),
    onSuccess: async (relation) => {
      await invalidateRelationQueries(queryClient, relation);
    },
  });
}
