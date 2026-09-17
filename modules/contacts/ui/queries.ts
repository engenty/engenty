import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@engenty/query-client";
import type { ContactsQueryParams } from "./api/contacts.js";
import { getContact, getContacts } from "./api/contacts.js";
import { getContactsRoleMenuConfig } from "./api/role-menu-settings.js";
import { getContactSettings } from "./api/settings.js";
import type { ContactSettingsPageData } from "./optimistic-mutations.js";
import { contactKeys } from "./query-keys.js";

// biome-ignore lint/performance/noBarrelFile: preserve the module's established query-hook import path
export {
  useCreateContactMutation,
  useDeleteContactMutation,
} from "./contact-list-optimistic.js";
export {
  useAddContactRoleMutation,
  useRemoveContactRoleMutation,
  useSaveContactSettingsPageMutation,
  useUpdateContactMutation,
} from "./optimistic-mutations.js";
export { contactKeys, contactsListQueryKeyParts } from "./query-keys.js";

export function contactsListOptions(params: ContactsQueryParams) {
  return queryOptions({
    queryKey: contactKeys.list(params),
    queryFn: ({ signal }) => getContacts(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useContactsListQuery(params: ContactsQueryParams) {
  return useQuery(contactsListOptions(params));
}

export function contactDetailOptions(id: string) {
  return queryOptions({
    queryKey: contactKeys.detail(id),
    queryFn: ({ signal }) => getContact(id, signal),
  });
}

export function useContactDetailQuery(id: string | null) {
  return useQuery({
    ...contactDetailOptions(id ?? ""),
    enabled: !!id,
  });
}

export function contactSettingsOptions() {
  return queryOptions({
    queryKey: contactKeys.settings(),
    queryFn: ({ signal }) => getContactSettings(signal),
  });
}

export function useContactSettingsQuery() {
  return useQuery(contactSettingsOptions());
}

export function contactsRoleMenuOptions() {
  return queryOptions({
    queryKey: contactKeys.roleMenu(),
    queryFn: ({ signal }) => getContactsRoleMenuConfig(signal),
  });
}

export function useContactsRoleMenuQuery() {
  return useQuery(contactsRoleMenuOptions());
}

export function contactSettingsPageOptions() {
  return queryOptions({
    queryKey: contactKeys.settingsPage(),
    queryFn: async ({ signal }) => {
      const [settings, roleMenuConfig] = await Promise.all([
        getContactSettings(signal),
        getContactsRoleMenuConfig(signal),
      ]);
      return { settings, roleMenuConfig } satisfies ContactSettingsPageData;
    },
  });
}

export function useContactSettingsPageQuery() {
  return useQuery(contactSettingsPageOptions());
}
