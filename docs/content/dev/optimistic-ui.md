---
title: Optimistic UI
description: Shared mutation lifecycle, concurrency rules, and realtime coordination.
---

# Optimistic UI

TanStack Query owns server state. Supabase Realtime remains the convergence
mechanism between users and tabs. Optimistic mutations make a predictable local
change immediately, then reconcile the API's authoritative response.

The shared helper implements only the cache lifecycle. Entity shapes, temporary
IDs, list membership, totals, ordering, and server-result reconciliation remain
module-specific pure reducers.

## Lifecycle

1. Cancel the exact in-flight query so an older response cannot overwrite the
   optimistic value.
2. Capture its current cache snapshot.
3. Replace the cache with the module's immutable optimistic result.
4. On success, merge the complete API response into every affected query.
5. On failure, use the concurrency policy selected for that mutation scope.

```ts
const transaction = await beginOptimisticUpdate<TimeTrackingWeek>(
  queryClient,
  {
    queryKey,
    update: (current) => upsertOptimisticEntry(current, input),
  }
);
```

The helper accepts one exact query key. Mutations that affect list, detail, or
aggregate keys start one transaction per key or use a focused module helper to
coordinate those transactions.

Do not mutate cached objects or arrays in place. Immutable roots are required
both for React rendering and for the transaction's cache-ownership check.

## Concurrency policy is required

Choose and document one policy for each migrated interaction:

### Serialized mutation scope

Prevent or serialize writes to the same entity, row, or cell while one is
pending. On failure, call `transaction.rollback()`.

Rollback restores the snapshot only while the transaction's optimistic value is
still the current cache value. If a newer mutation or a realtime refetch has
already replaced it, rollback preserves that newer value and invalidates the
exact key for authoritative recovery.

```ts
onError: (_error, _variables, context) => {
  context?.transaction.rollback();
  toast.error("Could not save the change.");
};
```

### Overlapping mutation scope

When writes may overlap and a whole snapshot could contain parts of another
write, skip snapshot restoration. Invalidate the affected key instead.

```ts
onError: (_error, _variables, context) => {
  void context?.transaction.invalidate();
  toast.error("Could not save the change.");
};
```

This may briefly keep the failed optimistic value until the refetch completes,
but it cannot erase a newer pending edit.

### Entity-level guarded rollback

If concurrent writes are intentional and the failed field or entity can be
identified, implement a module reducer that removes only that mutation's
contribution. Guard it with entity IDs, temporary IDs, versions, or expected
field values. Fall back to a targeted invalidation when the guard no longer
matches.

The shared helper deliberately does not know those entity rules.

## Success reconciliation

Merge returned IDs, timestamps, computed fields, and canonical values into the
cache in `onSuccess`. A complete API entity should replace its optimistic
counterpart without an automatic success invalidation.

```ts
onSuccess: (saved, _variables, context) => {
  if (!context) {
    return;
  }
  queryClient.setQueryData(context.queryKey, (current) =>
    reconcileSavedEntity(current, saved, context.input)
  );
};
```

For creates, use a clearly temporary ID such as `opt_<uuid>` and replace it with
the server ID. If the response is incomplete, merge what is known and request a
non-blocking targeted invalidation.

The knowledge-base cover mutation in
`modules/knowledge-base/ui/components/use-kb-cover-mutation.ts` demonstrates why
an unconditional success refetch is unsafe: a stale response can briefly
overwrite the optimistic and API-applied result.

## Realtime and live-cache coordination

Do not suppress live-cache invalidations while a local mutation is pending.
Realtime fires after a database commit, so its background refetch should contain
the saved data and also carries changes made by another user or tab.

`packages/live-cache/src/debounced-invalidate.ts` remains unchanged. There is no
global local-mutation gate in the foundation.

A realtime refetch can replace an optimistic cache value during a slow request.
The transaction's ownership check prevents a later failure from restoring an
older snapshot over that authoritative value. A module reducer must still
preserve unrelated fields when it reconciles the API result.

Add a local-mutation gate only if latency tests reproduce cache reversion, and
scope it narrowly enough that another user's update cannot be hidden.

## Migration checklist

- Identify every exact query key affected by the mutation.
- Define immutable optimistic and server-reconciliation reducers.
- Select serialized, invalidate/refetch, or entity-guarded failure recovery.
- Keep user-visible errors in the module mutation hook.
- Reconcile complete API responses without unconditional invalidation.
- Verify delayed success, forced failure, overlapping writes, and realtime
  refetch during a slow write.
- Verify temporary-ID replacement for creates and derived aggregates for
  updates, moves, and deletes.
