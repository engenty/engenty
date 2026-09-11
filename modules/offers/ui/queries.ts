import { getCommercialSettings } from "@engenty/commercial-settings/ui";
import { getCompanyProfileSettings } from "@engenty/company-profile/ui";
import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@engenty/query-client";
import type { OffersQueryParams } from "./api.js";
import {
  getNextOfferNumber,
  getOffer,
  getOfferBlocks,
  getOfferSettings,
  getOffers,
  getOfferTemplates,
  getOfferVersions,
} from "./api.js";

// biome-ignore lint/performance/noBarrelFile: preserve the module's established query-hook import path
export {
  useCreateOfferMutation,
  useCreateOfferVersionMutation,
  useDeleteOfferMutation,
  useReplaceOfferBlocksMutation,
} from "./complex-optimistic-mutations.js";
export {
  useSetDefaultOfferTemplateMutation,
  useSetOfferSettingsMutation,
  useUpdateOfferMutation,
} from "./optimistic-mutations.js";

import { offerKeys } from "./query-keys.js";

export { offerKeys } from "./query-keys.js";

import type { ContactsPluginApi } from "./plugins.js";

export function offersListOptions(params: OffersQueryParams) {
  return queryOptions({
    queryKey: offerKeys.list(params),
    queryFn: ({ signal }) => getOffers(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useOffersListQuery(params: OffersQueryParams) {
  return useQuery(offersListOptions(params));
}

export function offerDetailOptions(id: string) {
  return queryOptions({
    queryKey: offerKeys.detail(id),
    queryFn: ({ signal }) => getOffer(id, signal),
  });
}

export function useOfferDetailQuery(id: string | null) {
  return useQuery({
    ...offerDetailOptions(id ?? ""),
    enabled: !!id,
  });
}

export function offerTemplatesOptions() {
  return queryOptions({
    queryKey: offerKeys.templates(),
    queryFn: ({ signal }) => getOfferTemplates(signal),
  });
}

export function useOfferTemplatesQuery(enabled = true) {
  return useQuery({
    ...offerTemplatesOptions(),
    enabled,
  });
}

export function offerSettingsPageOptions() {
  return queryOptions({
    queryKey: offerKeys.settingsPage(),
    queryFn: async ({ signal }) => {
      const [settings, templates, commercialSettings] = await Promise.all([
        getOfferSettings(signal),
        getOfferTemplates(signal),
        getCommercialSettings(signal).catch(() => null),
      ]);
      return {
        settings,
        templates,
        commercialSettings: commercialSettings ?? null,
      };
    },
  });
}

export function useOfferSettingsPageQuery(enabled = true) {
  return useQuery({
    ...offerSettingsPageOptions(),
    enabled,
  });
}

export function nextOfferNumberOptions() {
  return queryOptions({
    queryKey: offerKeys.nextNumber(),
    queryFn: async () => {
      const r = await getNextOfferNumber();
      return r.offer_number;
    },
  });
}

export function useNextOfferNumberQuery(enabled: boolean) {
  return useQuery({
    ...nextOfferNumberOptions(),
    enabled,
  });
}

export function offerCreateDialogContactsOptions(
  contactsPlugin: ContactsPluginApi | null,
  enabled: boolean
) {
  return queryOptions({
    queryKey: [...offerKeys.createDialogContacts(), enabled ? "on" : "off"],
    queryFn: ({ signal }) =>
      contactsPlugin!
        .getContacts({ pageSize: 200 }, signal)
        .then((r) =>
          (r ?? []).map((e) => ({ id: e.id, display_name: e.display_name }))
        ),
    enabled: enabled && !!contactsPlugin,
  });
}

export function useOfferCreateDialogContactsQuery(
  contactsPlugin: ContactsPluginApi | null,
  enabled: boolean
) {
  return useQuery(offerCreateDialogContactsOptions(contactsPlugin, enabled));
}

export function offerDetailPageOptions(id: string) {
  return queryOptions({
    queryKey: offerKeys.detailPage(id),
    queryFn: async ({ signal }) => {
      const [offer, blocks, profile] = await Promise.all([
        getOffer(id, signal),
        getOfferBlocks(id, signal),
        getCompanyProfileSettings(signal).catch(() => null),
      ]);
      return { offer, blocks, companyProfile: profile ?? null };
    },
  });
}

export function useOfferDetailPageQuery(id: string | null) {
  return useQuery({
    ...offerDetailPageOptions(id ?? ""),
    enabled: !!id,
  });
}

export function offerDetailContactsOptions(
  contactsPlugin: ContactsPluginApi | null
) {
  return queryOptions({
    queryKey: [...offerKeys.detailContacts(), contactsPlugin ? "on" : "off"],
    queryFn: ({ signal }) =>
      contactsPlugin!.getContacts({ pageSize: 200 }, signal).then((r) =>
        (r ?? []).map((e) => ({
          id: e.id,
          display_name: e.display_name,
          contact_name: e.contact_name ?? "",
        }))
      ),
    enabled: !!contactsPlugin,
  });
}

export function useOfferDetailContactsQuery(
  contactsPlugin: ContactsPluginApi | null
) {
  return useQuery(offerDetailContactsOptions(contactsPlugin));
}

export function offerEditPageOptions(id: string) {
  return queryOptions({
    queryKey: offerKeys.editPage(id),
    queryFn: async ({ signal }) => {
      const [offer, blocks, profile, commercial] = await Promise.all([
        getOffer(id, signal),
        getOfferBlocks(id, signal),
        getCompanyProfileSettings(signal).catch(() => null),
        getCommercialSettings(signal).catch(() => null),
      ]);
      return {
        offer,
        blocks,
        companyProfile: profile ?? null,
        commercialSettings: commercial ?? null,
      };
    },
  });
}

export function useOfferEditPageQuery(id: string | null) {
  return useQuery({
    ...offerEditPageOptions(id ?? ""),
    enabled: !!id,
  });
}

export function offerEditContactsOptions(
  contactsPlugin: ContactsPluginApi | null
) {
  return queryOptions({
    queryKey: [...offerKeys.editContacts(), contactsPlugin ? "on" : "off"],
    queryFn: ({ signal }) =>
      contactsPlugin!
        .getContacts({ pageSize: 200 }, signal)
        .then((r) => r ?? []),
    enabled: !!contactsPlugin,
  });
}

export function useOfferEditContactsQuery(
  contactsPlugin: ContactsPluginApi | null
) {
  return useQuery(offerEditContactsOptions(contactsPlugin));
}

export function offerVersionsOptions(id: string) {
  return queryOptions({
    queryKey: offerKeys.versions(id),
    queryFn: ({ signal }) => getOfferVersions(id, signal),
  });
}

export function useOfferVersionsQuery(id: string | null) {
  return useQuery({
    ...offerVersionsOptions(id ?? ""),
    enabled: !!id,
  });
}
