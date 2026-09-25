export type {
  QueryClient,
  UseMutationResult,
  UseQueryResult,
} from "@tanstack/react-query";
export {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useMutationState,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
export {
  type BeginOptimisticUpdateOptions,
  beginOptimisticUpdate,
  type OptimisticRollbackResult,
  type OptimisticUpdateTransaction,
} from "./optimistic/begin-optimistic-update.js";
export {
  createOptimisticId,
  type OptimisticPage,
  patchOptimisticItems,
  prependOptimisticItem,
  reconcileOptimisticItem,
  removeOptimisticItems,
  reorderOptimisticItems,
} from "./optimistic/paginated-list.js";
export {
  keepPollingWhenHidden,
  POLL_STAGGER_RATIO,
  staggeredRefetchInterval,
  staggerPollMs,
} from "./poll.js";
export { EngentyQueryProvider } from "./provider.js";
