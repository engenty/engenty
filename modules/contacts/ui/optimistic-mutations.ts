import {
  beginOptimisticUpdate,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import {
  addContactRole,
  type ContactListItem,
  type ContactRole,
  removeContactRole,
  updateContact,
} from "./api/contacts.js";
import type { ContactsRoleMenuConfig } from "./api/role-menu-settings.js";
import { setContactsRoleMenuConfig } from "./api/role-menu-settings.js";
import type { ContactSettings } from "./api/settings.js";
import { setContactSettings } from "./api/settings.js";
import { contactKeys } from "./query-keys.js";

export interface ContactSettingsPageData {
  roleMenuConfig: ContactsRoleMenuConfig;
  settings: ContactSettings;
}

export function patchContact(
  current: ContactListItem | undefined,
  patch: Parameters<typeof updateContact>[1]
) {
  return current ? { ...current, ...patch } : current;
}

export function useUpdateContactMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateContact>[1]) =>
      updateContact(id, patch),
    onMutate: async (patch) => ({
      transaction: await beginOptimisticUpdate<ContactListItem>(queryClient, {
        queryKey: contactKeys.detail(id),
        update: (current) => patchContact(current, patch),
      }),
    }),
    onError: (_error, _patch, context) => {
      context?.transaction.rollback();
      toast.error("Could not save the contact.");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(contactKeys.detail(id), saved);
    },
  });
}

export function useAddContactRoleMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: ContactRole) => addContactRole(id, role),
    onMutate: async (role) => ({
      transaction: await beginOptimisticUpdate<ContactListItem>(queryClient, {
        queryKey: contactKeys.detail(id),
        update: (current) =>
          current
            ? { ...current, roles: [...new Set([...current.roles, role])] }
            : current,
      }),
    }),
    onError: (_error, _role, context) => {
      context?.transaction.rollback();
      toast.error("Could not add the contact role.");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(contactKeys.detail(id), saved);
    },
  });
}

export function useRemoveContactRoleMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: ContactRole) => removeContactRole(id, role),
    onMutate: async (role) => ({
      transaction: await beginOptimisticUpdate<ContactListItem>(queryClient, {
        queryKey: contactKeys.detail(id),
        update: (current) =>
          current
            ? {
                ...current,
                roles: current.roles.filter((value) => value !== role),
              }
            : current,
      }),
    }),
    onError: (_error, _role, context) => {
      context?.transaction.rollback();
      toast.error("Could not remove the contact role.");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(contactKeys.detail(id), saved);
    },
  });
}

export function useSetContactSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setContactSettings,
    onMutate: async (settings) => ({
      transactions: await Promise.all([
        beginOptimisticUpdate<ContactSettings>(queryClient, {
          queryKey: contactKeys.settings(),
          update: () => settings,
        }),
        beginOptimisticUpdate<ContactSettingsPageData>(queryClient, {
          queryKey: contactKeys.settingsPage(),
          update: (current) => (current ? { ...current, settings } : current),
        }),
      ]),
    }),
    onError: (_error, _settings, context) => {
      context?.transactions.forEach((transaction) => transaction.rollback());
      toast.error("Could not save contact settings.");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(contactKeys.settings(), saved);
      queryClient.setQueryData<ContactSettingsPageData>(
        contactKeys.settingsPage(),
        (current) => (current ? { ...current, settings: saved } : current)
      );
    },
  });
}

export function useSetContactsRoleMenuConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setContactsRoleMenuConfig,
    onMutate: async (roleMenuConfig) => ({
      transactions: await Promise.all([
        beginOptimisticUpdate<ContactsRoleMenuConfig>(queryClient, {
          queryKey: contactKeys.roleMenu(),
          update: () => roleMenuConfig,
        }),
        beginOptimisticUpdate<ContactSettingsPageData>(queryClient, {
          queryKey: contactKeys.settingsPage(),
          update: (current) =>
            current ? { ...current, roleMenuConfig } : current,
        }),
      ]),
    }),
    onError: (_error, _config, context) => {
      context?.transactions.forEach((transaction) => transaction.rollback());
      toast.error("Could not save the contact role menu.");
    },
    onSuccess: (_result, roleMenuConfig) => {
      queryClient.setQueryData(contactKeys.roleMenu(), roleMenuConfig);
      queryClient.setQueryData<ContactSettingsPageData>(
        contactKeys.settingsPage(),
        (current) => (current ? { ...current, roleMenuConfig } : current)
      );
    },
  });
}

export function useSaveContactSettingsPageMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ContactSettingsPageData) => {
      await Promise.all([
        setContactSettings(payload.settings),
        setContactsRoleMenuConfig(payload.roleMenuConfig),
      ]);
    },
    onMutate: async (payload) => ({
      transactions: await Promise.all([
        beginOptimisticUpdate<ContactSettings>(queryClient, {
          queryKey: contactKeys.settings(),
          update: () => payload.settings,
        }),
        beginOptimisticUpdate<ContactsRoleMenuConfig>(queryClient, {
          queryKey: contactKeys.roleMenu(),
          update: () => payload.roleMenuConfig,
        }),
        beginOptimisticUpdate<ContactSettingsPageData>(queryClient, {
          queryKey: contactKeys.settingsPage(),
          update: () => payload,
        }),
      ]),
    }),
    onError: (_error, _payload, context) => {
      context?.transactions.forEach((transaction) => transaction.rollback());
      toast.error("Could not save contact settings.");
    },
    onSuccess: (_result, payload) => {
      queryClient.setQueryData(contactKeys.settings(), payload.settings);
      queryClient.setQueryData(contactKeys.roleMenu(), payload.roleMenuConfig);
      queryClient.setQueryData(contactKeys.settingsPage(), payload);
    },
  });
}
