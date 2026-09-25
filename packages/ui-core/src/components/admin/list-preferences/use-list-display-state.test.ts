/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useListDisplayState } from "./use-list-display-state.js";

const options = {
  storageKey: "test-list-display-page-size",
  defaults: {
    viewMode: "table" as const,
    tableSize: "normal" as const,
    sortBy: "name" as const,
    sortOrder: "asc" as const,
    columnVisibility: { name: true },
    columnOrder: ["name"] as "name"[],
    pageSize: 50 as const,
  },
};

describe("useListDisplayState pageSize", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("restores a changed page size on the next mount", () => {
    const first = renderHook(() => useListDisplayState(options));
    act(() => {
      first.result.current.setPageSize(250);
    });
    first.unmount();

    const second = renderHook(() => useListDisplayState(options));
    expect(second.result.current.pageSize).toBe(250);
  });
});
