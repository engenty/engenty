import { getCommercialSettings } from "@engenty/commercial-settings/ui";
import { getCompanyProfileSettings } from "@engenty/company-profile/ui";
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type {
  OfferBlock,
  OfferCreateInput,
  OffersQueryParams,
  OfferUpdateInput,
} from "./api.js";
import {
  createOffer,
  createOfferVersion,
  deleteOffer,
  getNextOfferNumber,
  getOffer,
  getOfferBlocks,
  getOfferSettings,
  getOffers,
  getOfferTemplates,
  getOfferVersions,
  replaceOfferBlocks,
  setDefaultOfferTemplate,
  setOfferSettings,
  updateOffer,
} from "./api.js";
import type { ContactsPluginApi } from "./plugins.js";

export const offerKeys = {
  all: ["offers"] as const,
  list: (params: OffersQueryParams) =>
    [...offerKeys.all, "list", params] as const,
  detail: (id: string) => [...offerKeys.all, "detail", id] as const,
  detailPage: (id: string) => [...offerKeys.all, "detail-page", id] as const,
  editPage: (id: string) => [...offerKeys.all, "edit-page", id] as const,
  settingsPage: () => [...offerKeys.all, "settings-page"] as const,
  templates: () => [...offerKeys.all, "templates"] as const,
  nextNumber: () => [...offerKeys.all, "next-number"] as const,
  createDialogContacts: () =>
    [...offerKeys.all, "create-dialog-contacts"] as const,
  detailContacts: () => [...offerKeys.all, "detail-contacts"] as const,
  editContacts: () => [...offerKeys.all, "edit-contacts"] as const,
  versions: (id: string) => [...offerKeys.all, "versions", id] as const,
};

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

export function useCreateOfferMutation(listParams: OffersQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OfferCreateInput) => createOffer(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: offerKeys.list(listParams),
      });
      await queryClient.invalidateQueries({ queryKey: offerKeys.nextNumber() });
    },
  });
}

export function useReplaceOfferBlocksMutation(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      blocks: Pick<
        OfferBlock,
        "id" | "offer_id" | "type" | "content_json" | "order_index"
      >[]
    ) => replaceOfferBlocks(id!, blocks),
    onSuccess: async () => {
      if (!id) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: offerKeys.editPage(id) });
      await queryClient.invalidateQueries({
        queryKey: offerKeys.detailPage(id),
      });
    },
  });
}

export function useUpdateOfferMutation(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: OfferUpdateInput) => updateOffer(id!, patch),
    onSuccess: async () => {
      if (!id) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: offerKeys.detail(id) });
      await queryClient.invalidateQueries({
        queryKey: offerKeys.detailPage(id),
      });
      await queryClient.invalidateQueries({
        queryKey: offerKeys.editPage(id),
      });
    },
  });
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

export function useCreateOfferVersionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => createOfferVersion(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: offerKeys.all });
    },
  });
}

export function useDeleteOfferMutation(listParams?: OffersQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOffer(id),
    onSuccess: async () => {
      if (listParams) {
        await queryClient.invalidateQueries({
          queryKey: offerKeys.list(listParams),
        });
      } else {
        await queryClient.invalidateQueries({ queryKey: offerKeys.all });
      }
    },
  });
}

export function useSetOfferSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setOfferSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: offerKeys.settingsPage(),
      });
    },
  });
}

export function useSetDefaultOfferTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setDefaultOfferTemplate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: offerKeys.templates() });
      await queryClient.invalidateQueries({
        queryKey: offerKeys.settingsPage(),
      });
    },
  });
}
