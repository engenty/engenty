// Tier 1 threads barrel — provider, hooks, hostKey profile, and persisted active-thread storage.

export type { AppsAiThreadRecord as EngentyThreadRecord } from "../ag-ui/apps-ai/apps-ai-thread-api.js";
export {
  EngentyThreadsProvider,
  type EngentyThreadsProviderProps,
  useEngentyThreadsContext,
} from "./engenty-threads-provider.js";
export { engentyThreadsListQueryKey } from "./engenty-threads-query-keys.js";
export {
  createEngentyThreadsRealtimeSubscription,
  type EngentyThreadsRealtimeChannel,
  type EngentyThreadsRealtimeClient,
} from "./engenty-threads-realtime.js";
export {
  ENGENTY_THREAD_HOST_KEY_FIELD,
  mergeRouteContextWithHostKey,
  readThreadHostKeyFromRouteContext,
  sessionMatchesHostKey,
} from "./thread-host-key.js";
export {
  type EngentyThreadHostListMode,
  type EngentyThreadHostProfile,
  resolveEngentyThreadHostProfile,
} from "./thread-host-profile.js";
export {
  activeThreadStorageKey,
  readActiveThreadIdForHost,
  readAllActiveThreadIds,
  writeActiveThreadIdForHost,
} from "./threads-active-storage.js";
export {
  type UseEngentyThreadOptions,
  type UseEngentyThreadResult,
  useEngentyThread,
} from "./use-engenty-thread.js";
export {
  type CreateEngentyThreadOptions,
  isTemporaryEngentyThreadId,
  TEMPORARY_ENGENTY_THREAD_ID_PREFIX,
  type UseEngentyThreadsOptions,
  type UseEngentyThreadsResult,
  useEngentyThreads,
} from "./use-engenty-threads.js";
