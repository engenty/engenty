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
  ContactCreateInput,
  ContactListItem,
  ContactsPaginatedResponse,
  ContactsQueryParams,
} from "./api/contacts.js";
import { createContact, deleteContact } from "./api/contacts.js";
import { contactKeys } from "./query-keys.js";

export function optimisticContact(
  input: ContactCreateInput,
  id: string,
  now = new Date().toISOString()
): ContactListItem {
  return {
    ...input,
    created_at: now,
    deleted_at: null,
    id,
    linked_invoices_count: 0,
    roles: [],
    scope_id: "",
    tenant_id: "",
    updated_at: now,
  } as ContactListItem;
}

export function contactMatchesList(
  contact: ContactListItem,
  params: ContactsQueryParams
): boolean {
  const searchable = [contact.display_name, contact.contact_name, contact.email]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    (!params.type || contact.type === params.type) &&
    (!params.role || contact.roles.includes(params.role)) &&
    (!params.search || searchable.includes(params.search.toLowerCase()))
  );
}

export function useCreateContactMutation(listParams: ContactsQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createContact,
    onMutate: async (input) => {
      const optimisticId = createOptimisticId();
      const optimistic = optimisticContact(input, optimisticId);
      const queryKey = contactKeys.list(listParams);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<ContactsPaginatedResponse>(
        queryKey,
        (current) =>
          contactMatchesList(optimistic, listParams)
            ? prependOptimisticItem(current, optimistic)
            : current
      );
      return { optimisticId, queryKey };
    },
    onError: (_error, _input, context) => {
      if (context) {
        queryClient.setQueryData<ContactsPaginatedResponse>(
          context.queryKey,
          (current) =>
            removeOptimisticItems(current, new Set([context.optimisticId]))
        );
        void queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
      toast.error("Could not create the contact.");
    },
    onSuccess: (saved, _input, context) => {
      if (context) {
        queryClient.setQueryData<ContactsPaginatedResponse>(
          context.queryKey,
          (current) =>
            reconcileOptimisticItem(current, context.optimisticId, saved)
        );
      }
    },
  });
}

export function useDeleteContactMutation(listParams: ContactsQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteContact,
    onMutate: async (id) => {
      const queryKey = contactKeys.list(listParams);
      await queryClient.cancelQueries({ queryKey: contactKeys.all });
      queryClient.setQueryData<ContactsPaginatedResponse>(queryKey, (current) =>
        removeOptimisticItems(current, new Set([id]))
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
      toast.error("Could not delete the contact. The list is refreshing.");
    },
  });
}
