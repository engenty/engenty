import {
  beginOptimisticUpdate,
  createOptimisticId,
  prependOptimisticItem,
  reconcileOptimisticItem,
  removeOptimisticItems,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import type {
  OfferBlock,
  OfferCreateInput,
  OfferListItem,
  OffersPaginatedResponse,
  OffersQueryParams,
} from "./api.js";
import {
  createOffer,
  createOfferVersion,
  deleteOffer,
  replaceOfferBlocks,
} from "./api.js";
import { offerKeys } from "./query-keys.js";

interface OfferBlocksPage {
  blocks: OfferBlock[];
  offer: OfferListItem;
  [key: string]: unknown;
}

export function optimisticOffer(
  input: OfferCreateInput,
  id: string,
  now = new Date().toISOString()
): OfferListItem {
  return {
    ...input,
    accepted_at: null,
    approved_at: null,
    approved_by_name: null,
    billing_plan: null,
    contract_file_path: null,
    contract_notes: null,
    contract_signed_at: null,
    created_at: now,
    id,
    internal_notes: null,
    lead_id: input.lead_id ?? null,
    parent_offer_id: null,
    project_id: null,
    scope_id: "",
    sent_at: null,
    template_id: input.template_id ?? null,
    tenant_id: "",
    updated_at: now,
    version_number: 1,
  };
}

export function offerMatchesList(
  offer: OfferListItem,
  params: OffersQueryParams
): boolean {
  const searchable = `${offer.title} ${offer.offer_number}`.toLowerCase();
  return (
    (!params.client_id || offer.client_id === params.client_id) &&
    (!params.status || offer.status === params.status) &&
    (!params.search || searchable.includes(params.search.toLowerCase()))
  );
}

export function useCreateOfferMutation(listParams: OffersQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OfferCreateInput) => createOffer(input),
    onMutate: async (input) => {
      const optimisticId = createOptimisticId();
      const optimistic = optimisticOffer(input, optimisticId);
      const queryKey = offerKeys.list(listParams);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<OffersPaginatedResponse>(queryKey, (current) =>
        offerMatchesList(optimistic, listParams)
          ? prependOptimisticItem(current, optimistic)
          : current
      );
      return { optimisticId, queryKey };
    },
    onError: (_error, _input, context) => {
      if (context) {
        queryClient.setQueryData<OffersPaginatedResponse>(
          context.queryKey,
          (current) =>
            removeOptimisticItems(current, new Set([context.optimisticId]))
        );
        void queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
      toast.error("Could not create the offer.");
    },
    onSuccess: (saved, _input, context) => {
      if (context) {
        queryClient.setQueryData<OffersPaginatedResponse>(
          context.queryKey,
          (current) =>
            reconcileOptimisticItem(current, context.optimisticId, saved)
        );
      }
      void queryClient.invalidateQueries({ queryKey: offerKeys.nextNumber() });
    },
  });
}

export function useDeleteOfferMutation(listParams?: OffersQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOffer(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: offerKeys.all });
      for (const [
        key,
        current,
      ] of queryClient.getQueriesData<OffersPaginatedResponse>({
        queryKey: [...offerKeys.all, "list"],
      })) {
        queryClient.setQueryData(
          key,
          removeOptimisticItems(current, new Set([id]))
        );
      }
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: offerKeys.all });
      toast.error("Could not delete the offer. The list is refreshing.");
    },
    onSuccess: (_saved, id) => {
      queryClient.removeQueries({ queryKey: offerKeys.detail(id) });
      queryClient.removeQueries({ queryKey: offerKeys.detailPage(id) });
      queryClient.removeQueries({ queryKey: offerKeys.editPage(id) });
      if (!listParams) {
        void queryClient.invalidateQueries({ queryKey: offerKeys.all });
      }
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
    onMutate: async (blocks) => {
      if (!id) {
        return;
      }
      const optimisticBlocks = blocks as OfferBlock[];
      return {
        transactions: await Promise.all(
          [offerKeys.editPage(id), offerKeys.detailPage(id)].map((queryKey) =>
            beginOptimisticUpdate<OfferBlocksPage>(queryClient, {
              queryKey,
              update: (current) =>
                current ? { ...current, blocks: optimisticBlocks } : current,
            })
          )
        ),
      };
    },
    onError: (_error, _blocks, context) => {
      context?.transactions.forEach((transaction) => transaction.rollback());
      toast.error("Could not save the offer blocks.");
    },
    onSuccess: (saved) => {
      if (!id) {
        return;
      }
      for (const queryKey of [
        offerKeys.editPage(id),
        offerKeys.detailPage(id),
      ]) {
        queryClient.setQueryData<OfferBlocksPage>(queryKey, (current) =>
          current ? { ...current, blocks: saved } : current
        );
      }
    },
  });
}

export function useCreateOfferVersionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => createOfferVersion(id),
    onMutate: async (id) => {
      const optimisticId = createOptimisticId();
      const source = queryClient.getQueryData<OfferListItem>(
        offerKeys.detail(id)
      );
      if (!source) {
        return { optimisticId };
      }
      await queryClient.cancelQueries({ queryKey: offerKeys.versions(id) });
      queryClient.setQueryData<OfferListItem[]>(
        offerKeys.versions(id),
        (current = []) => [
          ...current,
          {
            ...source,
            id: optimisticId,
            parent_offer_id: id,
            version_number: source.version_number + 1,
          },
        ]
      );
      return { optimisticId };
    },
    onError: (_error, id, context) => {
      queryClient.setQueryData<OfferListItem[]>(
        offerKeys.versions(id),
        (current) =>
          current?.filter((item) => item.id !== context?.optimisticId)
      );
      toast.error("Could not create the offer version.");
    },
    onSuccess: (saved, id, context) => {
      queryClient.setQueryData<OfferListItem[]>(
        offerKeys.versions(id),
        (current) =>
          current?.map((item) =>
            item.id === context?.optimisticId ? saved : item
          ) ?? [saved]
      );
    },
  });
}
