/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LIST_PAGE_SIZE_DEFAULT } from "./list-page-size.js";
import { useListDisplayState } from "./use-list-display-state.js";

const STORAGE_KEY = "test-list-display-page-size";

const defaults = {
  viewMode: "table" as const,
  tableSize: "normal" as const,
  sortBy: "name" as const,
  sortOrder: "asc" as const,
  columnVisibility: { name: true },
  columnOrder: ["name"] as "name"[],
  pageSize: 50 as const,
};

describe("useListDisplayState pageSize", () => {
  afterEach(() => {
    window.localStorage.removeItem(`engenty.list-display.${STORAGE_KEY}`);
  });

  it("defaults to LIST_PAGE_SIZE_DEFAULT when omitted", () => {
    const { result } = renderHook(() =>
      useListDisplayState({
        storageKey: STORAGE_KEY,
        defaults: {
          viewMode: "table",
          tableSize: "normal",
          sortBy: "name",
          sortOrder: "asc",
          columnVisibility: { name: true },
          columnOrder: ["name"],
        },
      })
    );

    expect(result.current.pageSize).toBe(LIST_PAGE_SIZE_DEFAULT);
  });

  it("persists pageSize changes", () => {
    const { result } = renderHook(() =>
      useListDisplayState({
        storageKey: STORAGE_KEY,
        defaults,
      })
    );

    expect(result.current.pageSize).toBe(50);

    act(() => {
      result.current.setPageSize(250);
    });

    expect(result.current.pageSize).toBe(250);

    const stored = JSON.parse(
      window.localStorage.getItem(`engenty.list-display.${STORAGE_KEY}`) ?? "{}"
    );
    expect(stored.pageSize).toBe(250);
  });
});
