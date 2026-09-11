import type { QueryClient, QueryKey } from "@tanstack/react-query";

export type OptimisticRollbackResult = "invalidated" | "restored" | "unchanged";

export interface OptimisticUpdateTransaction {
  /** Marks the exact query stale and refetches it when active. */
  invalidate: () => Promise<void>;
  /**
   * Restores the snapshot while this transaction still owns the cache value.
   * If another mutation or refetch has replaced it, keeps that newer value and
   * invalidates the query instead.
   */
  rollback: () => OptimisticRollbackResult;
}

export interface BeginOptimisticUpdateOptions<TData> {
  queryKey: QueryKey;
  update: (current: TData | undefined) => TData | undefined;
}

/**
 * Starts the shape-agnostic portion of an optimistic mutation.
 *
 * Entity-specific optimistic and server-result reducers belong to the caller.
 */
export async function beginOptimisticUpdate<TData>(
  queryClient: QueryClient,
  options: BeginOptimisticUpdateOptions<TData>
): Promise<OptimisticUpdateTransaction> {
  await queryClient.cancelQueries({
    exact: true,
    queryKey: options.queryKey,
  });

  const snapshot = queryClient.getQueryData<TData>(options.queryKey);
  const optimisticData = options.update(snapshot);
  queryClient.setQueryData<TData>(options.queryKey, optimisticData);

  // QueryClient may structurally share the supplied value. Capture the actual
  // cache reference so rollback can detect a later mutation or refetch.
  const appliedData = queryClient.getQueryData<TData>(options.queryKey);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      exact: true,
      queryKey: options.queryKey,
    });
  };

  return {
    invalidate,
    rollback: () => {
      const current = queryClient.getQueryData<TData>(options.queryKey);
      if (current !== appliedData) {
        void invalidate();
        return "invalidated";
      }

      if (snapshot === undefined) {
        if (appliedData === undefined) {
          return "unchanged";
        }
        queryClient.removeQueries({
          exact: true,
          queryKey: options.queryKey,
        });
      } else {
        queryClient.setQueryData<TData>(options.queryKey, snapshot);
      }
      return "restored";
    },
  };
}
