import {
  beginOptimisticUpdate,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import type {
  OfferListItem,
  OfferSettings,
  OfferTemplate,
  OfferUpdateInput,
} from "./api.js";
import {
  setDefaultOfferTemplate,
  setOfferSettings,
  updateOffer,
} from "./api.js";
import { offerKeys } from "./query-keys.js";

interface OfferPageData {
  offer: OfferListItem;
  [key: string]: unknown;
}

interface OfferSettingsPageData {
  settings: OfferSettings;
  templates: OfferTemplate[];
  [key: string]: unknown;
}

export function patchOffer(
  current: OfferListItem | undefined,
  patch: OfferUpdateInput
) {
  return current ? { ...current, ...patch } : current;
}

export function patchOfferPage(
  current: OfferPageData | undefined,
  patch: OfferUpdateInput
): OfferPageData | undefined {
  return current
    ? { ...current, offer: { ...current.offer, ...patch } }
    : current;
}

function setDefaultTemplate(
  templates: OfferTemplate[] | undefined,
  templateId: string
) {
  return templates?.map((template) => ({
    ...template,
    is_default: template.id === templateId,
  }));
}

export function useUpdateOfferMutation(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: OfferUpdateInput) => updateOffer(id!, patch),
    onMutate: async (patch) => {
      if (!id) {
        return { transactions: [] };
      }
      return {
        transactions: await Promise.all([
          beginOptimisticUpdate<OfferListItem>(queryClient, {
            queryKey: offerKeys.detail(id),
            update: (current) => patchOffer(current, patch),
          }),
          beginOptimisticUpdate<OfferPageData>(queryClient, {
            queryKey: offerKeys.detailPage(id),
            update: (current) => patchOfferPage(current, patch),
          }),
          beginOptimisticUpdate<OfferPageData>(queryClient, {
            queryKey: offerKeys.editPage(id),
            update: (current) => patchOfferPage(current, patch),
          }),
        ]),
      };
    },
    onError: (_error, _patch, context) => {
      context?.transactions.forEach((transaction) => transaction.rollback());
      toast.error("Could not save the offer.");
    },
    onSuccess: (saved) => {
      if (!id) {
        return;
      }
      queryClient.setQueryData(offerKeys.detail(id), saved);
      for (const queryKey of [
        offerKeys.detailPage(id),
        offerKeys.editPage(id),
      ]) {
        queryClient.setQueryData<OfferPageData>(queryKey, (current) =>
          current ? { ...current, offer: saved } : current
        );
      }
    },
  });
}

export function useSetOfferSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setOfferSettings,
    onMutate: async (settings) => ({
      transaction: await beginOptimisticUpdate<OfferSettingsPageData>(
        queryClient,
        {
          queryKey: offerKeys.settingsPage(),
          update: (current) =>
            current
              ? { ...current, settings: { ...current.settings, ...settings } }
              : current,
        }
      ),
    }),
    onError: (_error, _settings, context) => {
      context?.transaction.rollback();
      toast.error("Could not save offer settings.");
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<OfferSettingsPageData>(
        offerKeys.settingsPage(),
        (current) => (current ? { ...current, settings: saved } : current)
      );
    },
  });
}

export function useSetDefaultOfferTemplateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setDefaultOfferTemplate,
    onMutate: async (templateId) => ({
      transactions: await Promise.all([
        beginOptimisticUpdate<OfferTemplate[]>(queryClient, {
          queryKey: offerKeys.templates(),
          update: (current) => setDefaultTemplate(current, templateId),
        }),
        beginOptimisticUpdate<OfferSettingsPageData>(queryClient, {
          queryKey: offerKeys.settingsPage(),
          update: (current) =>
            current
              ? {
                  ...current,
                  templates:
                    setDefaultTemplate(current.templates, templateId) ?? [],
                }
              : current,
        }),
      ]),
    }),
    onError: (_error, _templateId, context) => {
      context?.transactions.forEach((transaction) => transaction.rollback());
      toast.error("Could not set the default offer template.");
    },
    onSuccess: (saved) => {
      const reconcile = (templates: OfferTemplate[] | undefined) =>
        templates?.map((template) =>
          template.id === saved.id ? saved : { ...template, is_default: false }
        );
      queryClient.setQueryData<OfferTemplate[]>(
        offerKeys.templates(),
        reconcile
      );
      queryClient.setQueryData<OfferSettingsPageData>(
        offerKeys.settingsPage(),
        (current) =>
          current
            ? {
                ...current,
                templates: reconcile(current.templates) ?? [],
              }
            : current
      );
    },
  });
}
