import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type { ContactRole, ContactsQueryParams } from "./api/contacts.js";
import {
  addContactRole,
  createContact,
  deleteContact,
  getContact,
  getContacts,
  removeContactRole,
  updateContact,
} from "./api/contacts.js";
import type { ContactsRoleMenuConfig } from "./api/role-menu-settings.js";
import {
  getContactsRoleMenuConfig,
  setContactsRoleMenuConfig,
} from "./api/role-menu-settings.js";
import type { ContactSettings } from "./api/settings.js";
import { getContactSettings, setContactSettings } from "./api/settings.js";

/** Primitive tuple so list cache keys change reliably when `type` / `role` / etc. change (avoids object-key edge cases). */
export function contactsListQueryKeyParts(params: ContactsQueryParams) {
  return [
    params.page ?? 1,
    params.pageSize ?? 25,
    params.role ?? null,
    params.type ?? null,
    params.search ?? null,
    params.sortBy ?? null,
    params.sortOrder ?? null,
  ] as const;
}

export const contactKeys = {
  all: ["contacts"] as const,
  list: (params: ContactsQueryParams) =>
    [...contactKeys.all, "list", ...contactsListQueryKeyParts(params)] as const,
  detail: (id: string) => [...contactKeys.all, "detail", id] as const,
  relations: (id: string, includeInactive = false) =>
    [...contactKeys.all, "relations", id, includeInactive] as const,
  settings: () => [...contactKeys.all, "settings"] as const,
  roleMenu: () => [...contactKeys.all, "role-menu"] as const,
  settingsPage: () => [...contactKeys.all, "settings-page"] as const,
};

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

interface ContactSettingsPageData {
  roleMenuConfig: ContactsRoleMenuConfig;
  settings: ContactSettings;
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

export function useCreateContactMutation(listParams: ContactsQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createContact,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: contactKeys.list(listParams),
      });
    },
  });
}

export function useUpdateContactMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateContact>[1]) =>
      updateContact(id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contactKeys.detail(id) });
    },
  });
}

export function useDeleteContactMutation(listParams: ContactsQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteContact,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: contactKeys.list(listParams),
      });
    },
  });
}

export function useAddContactRoleMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: ContactRole) => addContactRole(id, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contactKeys.detail(id) });
    },
  });
}

export function useRemoveContactRoleMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: ContactRole) => removeContactRole(id, role),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contactKeys.detail(id) });
    },
  });
}

export function useSetContactSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setContactSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contactKeys.settings() });
      await queryClient.invalidateQueries({
        queryKey: contactKeys.settingsPage(),
      });
    },
  });
}

export function useSetContactsRoleMenuConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setContactsRoleMenuConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contactKeys.roleMenu() });
      await queryClient.invalidateQueries({
        queryKey: contactKeys.settingsPage(),
      });
    },
  });
}

export function useSaveContactSettingsPageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      settings: ContactSettings;
      roleMenuConfig: ContactsRoleMenuConfig;
    }) => {
      await Promise.all([
        setContactSettings(payload.settings),
        setContactsRoleMenuConfig(payload.roleMenuConfig),
      ]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contactKeys.settings() });
      await queryClient.invalidateQueries({ queryKey: contactKeys.roleMenu() });
      await queryClient.invalidateQueries({
        queryKey: contactKeys.settingsPage(),
      });
    },
  });
}
