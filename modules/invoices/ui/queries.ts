import { getCommercialSettings } from "@engenty/commercial-settings/ui";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import type {
  InvoiceBlockInput,
  InvoiceCreateInput,
  InvoiceSettings,
  InvoiceStatus,
  InvoiceUpdateInput,
} from "./api.js";
import {
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  getInvoice,
  getInvoiceBlocks,
  getInvoiceSettings,
  getInvoices,
  getNextInvoiceNumber,
  issueInvoice,
  replaceInvoiceBlocks,
  setInvoiceSettings,
  setInvoiceStatus,
  updateInvoice,
} from "./api.js";
import { normalizeInvoiceTaxRates } from "./lib/invoice-tax-rates.js";
import type { ContactsPluginApi } from "./plugins.js";

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: () => [...invoiceKeys.all, "list"] as const,
  detail: (id: string) => [...invoiceKeys.all, "detail", id] as const,
  blocks: (id: string) => [...invoiceKeys.all, "blocks", id] as const,
  editPage: (id: string) => [...invoiceKeys.all, "edit-page", id] as const,
  settings: () => [...invoiceKeys.all, "settings"] as const,
  taxRates: () => [...invoiceKeys.all, "tax-rates"] as const,
  nextNumber: () => [...invoiceKeys.all, "next-number"] as const,
  modalContacts: () => [...invoiceKeys.all, "modal-contacts"] as const,
};

export const invoicesListOptions = queryOptions({
  queryKey: invoiceKeys.list(),
  queryFn: ({ signal }) => getInvoices(signal),
});

export function useInvoicesListQuery() {
  return useQuery(invoicesListOptions);
}

export function useInvoiceDetailQuery(id: string | null) {
  return useQuery({
    queryKey: invoiceKeys.detail(id ?? ""),
    queryFn: ({ signal }) => getInvoice(id ?? "", signal),
    enabled: Boolean(id),
  });
}

export function useInvoiceEditPageQuery(id: string | null) {
  return useQuery({
    queryKey: invoiceKeys.editPage(id ?? ""),
    queryFn: async ({ signal }) => {
      const [invoice, blocks] = await Promise.all([
        getInvoice(id ?? "", signal),
        getInvoiceBlocks(id ?? "", signal),
      ]);
      return { invoice, blocks };
    },
    enabled: Boolean(id),
  });
}

export function useInvoiceBlocksQuery(id: string | null) {
  return useQuery({
    queryKey: invoiceKeys.blocks(id ?? ""),
    queryFn: ({ signal }) => getInvoiceBlocks(id ?? "", signal),
    enabled: Boolean(id),
  });
}

export function useInvoiceSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: invoiceKeys.settings(),
    queryFn: ({ signal }) => getInvoiceSettings(signal),
    enabled,
  });
}

export function useInvoiceTaxRatesQuery(enabled = true) {
  return useQuery({
    queryKey: invoiceKeys.taxRates(),
    queryFn: async ({ signal }) => {
      const settings = await getCommercialSettings(signal).catch(() => null);
      return normalizeInvoiceTaxRates(settings?.tax_rates);
    },
    enabled,
  });
}

export function useNextInvoiceNumberQuery(enabled = true) {
  return useQuery({
    queryKey: invoiceKeys.nextNumber(),
    queryFn: () => getNextInvoiceNumber(),
    enabled,
    staleTime: 0,
  });
}

export function useCreateInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InvoiceCreateInput) => createInvoice(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

export function useUpdateInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: InvoiceUpdateInput }) =>
      updateInvoice(id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

export function useReplaceInvoiceBlocksMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, blocks }: { id: string; blocks: InvoiceBlockInput[] }) =>
      replaceInvoiceBlocks(id, blocks),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

export function useDeleteInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.list() });
    },
  });
}

export function useIssueInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => issueInvoice(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

export function useSetInvoiceStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) =>
      setInvoiceStatus(id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

export function useCancelInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelInvoice(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}

export function useSetInvoiceSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<InvoiceSettings>) => setInvoiceSettings(patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invoiceKeys.settings() });
    },
  });
}

export function invoiceModalContactsOptions(
  contactsPlugin: ContactsPluginApi | null
) {
  return queryOptions({
    queryKey: [...invoiceKeys.modalContacts(), contactsPlugin ? "on" : "off"],
    queryFn: ({ signal }) =>
      contactsPlugin
        ? contactsPlugin.getContacts({}, signal).then((list) =>
            (list ?? []).map((e) => ({
              id: e.id,
              display_name: e.display_name,
            }))
          )
        : Promise.resolve([]),
    enabled: !!contactsPlugin,
  });
}

export function useInvoiceModalContactsQuery(
  contactsPlugin: ContactsPluginApi | null
) {
  return useQuery(invoiceModalContactsOptions(contactsPlugin));
}
