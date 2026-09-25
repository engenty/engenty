/** @vitest-environment happy-dom */

import { roomKeys, spaceHomeQueryKey } from "@engenty/ai-ui";
import type { QueryClient } from "@engenty/query-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { spaceHomeCursorKey } from "@/lib/space-home-visit";
import {
  prefetchSpaceDestination,
  resetSpaceDestinationPrefetchCooldown,
} from "./prefetch-space-destination";

afterEach(() => {
  resetSpaceDestinationPrefetchCooldown();
  window.localStorage.clear();
});

function mockQueryClient() {
  return {
    prefetchQuery: vi.fn().mockResolvedValue(undefined),
  };
}

describe("prefetchSpaceDestination", () => {
  it("warms home and conversations for the destination space", () => {
    const queryClient = mockQueryClient();

    prefetchSpaceDestination(queryClient as unknown as QueryClient, {
      id: "space-1",
    });

    const keys = queryClient.prefetchQuery.mock.calls.map(
      (call) => (call[0] as { queryKey: readonly unknown[] }).queryKey
    );
    expect(keys).toContainEqual(spaceHomeQueryKey("space-1", null));
    expect(keys).toContainEqual(roomKeys.list("space-1"));
  });

  it("uses that space's stored home cursor, not a shared one", () => {
    window.localStorage.setItem(
      spaceHomeCursorKey("space-1"),
      "2026-09-22T10:00:00.000Z"
    );
    const queryClient = mockQueryClient();

    prefetchSpaceDestination(queryClient as unknown as QueryClient, {
      id: "space-1",
    });

    const keys = queryClient.prefetchQuery.mock.calls.map(
      (call) => (call[0] as { queryKey: readonly unknown[] }).queryKey
    );
    expect(keys).toContainEqual(
      spaceHomeQueryKey("space-1", "2026-09-22T10:00:00.000Z")
    );
  });

  it("does not burst the same space on repeated hover", () => {
    const queryClient = mockQueryClient();

    prefetchSpaceDestination(queryClient as unknown as QueryClient, {
      id: "space-1",
    });
    prefetchSpaceDestination(queryClient as unknown as QueryClient, {
      id: "space-1",
    });

    expect(queryClient.prefetchQuery).toHaveBeenCalledTimes(2);
  });
});
