import { describe, expect, it, vi } from "vitest";
import { createDebouncedInvalidator } from "./debounced-invalidate.js";
import {
  createLiveCacheRegistry,
  mergePostgresChangesWithScopeFilters,
  mergePostgresChangesWithTenantFilter,
  shouldAcceptSignalForTenant,
  shouldAcceptSignalForUser,
} from "./live-cache-registry.js";
import {
  type PostgresChangeRealtimeChannel,
  readTenantIdFromPayload,
  readUserIdFromPayload,
  subscribePostgresChanges,
} from "./postgres-change-subscription.js";
import type { LiveCacheBinding } from "./types.js";

describe("createDebouncedInvalidator", () => {
  it("coalesces invalidations for the same query key", () => {
    vi.useFakeTimers();
    const invalidateQueries = vi.fn();
    const queryClient = { invalidateQueries } as never;
    const invalidate = createDebouncedInvalidator(queryClient, 150);

    invalidate(["tasks", "detail", "task-1"]);
    invalidate(["tasks", "detail", "task-1"]);
    expect(invalidateQueries).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["tasks", "detail", "task-1"],
    });

    vi.useRealTimers();
  });
});

describe("shouldAcceptSignalForTenant", () => {
  it("rejects signals from another tenant", () => {
    expect(
      shouldAcceptSignalForTenant(
        { tenantId: "tenant-a" },
        {
          kind: "postgres_changes",
          schema: "module_tasks",
          table: "tasks",
          tenantId: "tenant-b",
        }
      )
    ).toBe(false);
  });

  it("rejects signals without tenant_id", () => {
    expect(
      shouldAcceptSignalForTenant(
        { tenantId: "tenant-a" },
        {
          kind: "postgres_changes",
          schema: "module_tasks",
          table: "tasks",
        }
      )
    ).toBe(false);
  });
});

describe("shouldAcceptSignalForUser", () => {
  it("accepts a signal whose user_id matches the context", () => {
    expect(
      shouldAcceptSignalForUser(
        { tenantId: "tenant-a", userId: "user-1" },
        {
          kind: "postgres_changes",
          schema: "core",
          table: "user_settings",
          userId: "user-1",
        }
      )
    ).toBe(true);
  });

  it("rejects another user's signal and signals without user_id", () => {
    expect(
      shouldAcceptSignalForUser(
        { tenantId: "tenant-a", userId: "user-1" },
        {
          kind: "postgres_changes",
          schema: "core",
          table: "user_settings",
          userId: "user-2",
        }
      )
    ).toBe(false);
    expect(
      shouldAcceptSignalForUser(
        { tenantId: "tenant-a", userId: "user-1" },
        { kind: "postgres_changes", schema: "core", table: "user_settings" }
      )
    ).toBe(false);
  });
});

describe("createLiveCacheRegistry", () => {
  it("invalidates bound query keys for matching postgres signals", () => {
    const invalidate = vi.fn();
    const binding: LiveCacheBinding = {
      id: "tasks_detail",
      postgresChanges: [{ schema: "module_tasks", table: "tasks" }],
      resolveQueryKeys: () => [["tasks", "detail", "task-1"]],
    };
    const registry = createLiveCacheRegistry([binding]);

    registry.handleSignal(
      {} as never,
      { tenantId: "tenant-1" },
      {
        kind: "postgres_changes",
        schema: "module_tasks",
        table: "tasks",
        tenantId: "tenant-1",
      },
      invalidate
    );

    expect(invalidate).toHaveBeenCalledWith(["tasks", "detail", "task-1"]);

    invalidate.mockClear();
    registry.handleSignal(
      {} as never,
      { tenantId: "tenant-1" },
      {
        kind: "postgres_changes",
        schema: "module_tasks",
        table: "tasks",
      },
      invalidate
    );
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("createLiveCacheRegistry (user scope)", () => {
  it("invalidates on a matching user_id and ignores other users", () => {
    const invalidate = vi.fn();
    const binding: LiveCacheBinding = {
      id: "user-settings",
      postgresChanges: [
        { schema: "core", table: "user_settings", scope: "user" },
      ],
      resolveQueryKeys: () => [["user-settings"]],
    };
    const registry = createLiveCacheRegistry([binding]);

    registry.handleSignal(
      {} as never,
      { tenantId: "tenant-1", userId: "user-1" },
      {
        kind: "postgres_changes",
        schema: "core",
        table: "user_settings",
        userId: "user-1",
      },
      invalidate
    );
    expect(invalidate).toHaveBeenCalledWith(["user-settings"]);

    invalidate.mockClear();
    registry.handleSignal(
      {} as never,
      { tenantId: "tenant-1", userId: "user-1" },
      {
        kind: "postgres_changes",
        schema: "core",
        table: "user_settings",
        userId: "user-2",
      },
      invalidate
    );
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("mergePostgresChangesWithScopeFilters", () => {
  it("filters tenant rows by tenant_id and user rows by user_id", () => {
    const bindings: LiveCacheBinding[] = [
      {
        id: "tenant-settings",
        postgresChanges: [{ schema: "core", table: "tenant_settings" }],
        resolveQueryKeys: () => [],
      },
      {
        id: "user-settings",
        postgresChanges: [
          { schema: "core", table: "user_settings", scope: "user" },
        ],
        resolveQueryKeys: () => [],
      },
    ];

    expect(
      mergePostgresChangesWithScopeFilters(bindings, {
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).toEqual([
      {
        schema: "core",
        table: "tenant_settings",
        filter: "tenant_id=eq.tenant-1",
      },
      {
        schema: "core",
        table: "user_settings",
        scope: "user",
        filter: "user_id=eq.user-1",
      },
    ]);
  });

  it("drops user-scoped specs when no userId is in context", () => {
    const bindings: LiveCacheBinding[] = [
      {
        id: "user-settings",
        postgresChanges: [
          { schema: "core", table: "user_settings", scope: "user" },
        ],
        resolveQueryKeys: () => [],
      },
    ];
    expect(
      mergePostgresChangesWithScopeFilters(bindings, { tenantId: "tenant-1" })
    ).toEqual([]);
  });
});

describe("readUserIdFromPayload", () => {
  it("reads user_id from new or old record", () => {
    expect(readUserIdFromPayload({ new: { user_id: "user-1" } })).toBe(
      "user-1"
    );
    expect(readUserIdFromPayload({ old: { user_id: "user-2" } })).toBe(
      "user-2"
    );
    expect(readUserIdFromPayload({ new: { id: "x" } })).toBeNull();
  });
});

describe("mergePostgresChangesWithTenantFilter", () => {
  it("adds tenant filter when missing", () => {
    const bindings: LiveCacheBinding[] = [
      {
        id: "tasks",
        postgresChanges: [{ schema: "module_tasks", table: "tasks" }],
        resolveQueryKeys: () => [],
      },
    ];

    expect(mergePostgresChangesWithTenantFilter(bindings, "tenant-1")).toEqual([
      {
        schema: "module_tasks",
        table: "tasks",
        filter: "tenant_id=eq.tenant-1",
      },
    ]);
  });
});

describe("subscribePostgresChanges", () => {
  it("subscribes and forwards postgres payloads as signals", () => {
    // Held in an object property so the assignment inside the `on` closure is
    // visible to the type checker at the call site below (a plain `let` stays
    // narrowed to its `null` initializer).
    const captured: { callback?: (payload: unknown) => void } = {};
    const channel: PostgresChangeRealtimeChannel = {
      on: vi.fn((event, _config, nextCallback) => {
        // A "system" error listener is also registered; only capture the
        // postgres_changes handler here.
        if (event === "postgres_changes") {
          captured.callback = nextCallback as (payload: unknown) => void;
        }
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    const client = { channel: vi.fn(() => channel) };
    const onSignal = vi.fn();

    subscribePostgresChanges({
      channelName: "tasks:tenant-1",
      changes: [{ schema: "module_tasks", table: "tasks" }],
      client,
      onSignal,
    });

    captured.callback?.({
      eventType: "UPDATE",
      new: { id: "task-1", tenant_id: "tenant-1" },
    });

    expect(onSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "postgres_changes",
        schema: "module_tasks",
        table: "tasks",
        tenantId: "tenant-1",
      })
    );
  });
});

describe("readTenantIdFromPayload", () => {
  it("reads tenant_id from new or old record", () => {
    expect(
      readTenantIdFromPayload({
        new: { tenant_id: "tenant-1" },
      })
    ).toBe("tenant-1");
    expect(
      readTenantIdFromPayload({
        old: { tenant_id: "tenant-2" },
      })
    ).toBe("tenant-2");
  });
});
