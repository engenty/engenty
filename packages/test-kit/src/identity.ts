import type { PluginAuthContext } from "@engenty/plugin-sdk";

/**
 * Canonical identity constants for tests. Use these instead of hand-typed
 * `"tenant-1"` / `"user-1"` literals so tests share one recognizable set of
 * ids and shape changes stay one-file edits.
 */
export const TEST_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000002";
export const TEST_SCOPE_ID = "default";

/** Auth context with canonical test ids; override any field per test. */
export function makeAuth(
  overrides: Partial<PluginAuthContext> = {}
): PluginAuthContext {
  return {
    principalId: TEST_USER_ID,
    scopeId: TEST_SCOPE_ID,
    tenantId: TEST_TENANT_ID,
    ...overrides,
  };
}
