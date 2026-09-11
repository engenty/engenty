import { describe, expect, it } from "vitest";
import {
  patchOptimisticItems,
  prependOptimisticItem,
  reconcileOptimisticItem,
  removeOptimisticItems,
  reorderOptimisticItems,
} from "./paginated-list.js";

const page = {
  data: [
    { id: "a", lane: "todo", title: "A" },
    { id: "b", lane: "todo", title: "B" },
  ],
  page: 1,
  pageSize: 2,
  total: 3,
};

describe("paginated optimistic reducers", () => {
  it("prepends temporary rows only to the first page", () => {
    const optimistic = prependOptimisticItem(page, {
      id: "opt_1",
      lane: "todo",
      title: "Now",
    });
    expect(optimistic?.data.map(({ id }) => id)).toEqual(["opt_1", "a"]);
    expect(optimistic?.total).toBe(4);
    expect(prependOptimisticItem({ ...page, page: 2 }, page.data[0])).toEqual({
      ...page,
      page: 2,
    });
  });

  it("reconciles a temporary ID with the authoritative row", () => {
    const optimistic = prependOptimisticItem(page, {
      id: "opt_1",
      lane: "todo",
      title: "Draft",
    });
    const saved = reconcileOptimisticItem(optimistic, "opt_1", {
      id: "server-1",
      lane: "todo",
      title: "Saved",
    });
    expect(saved?.data[0]).toEqual({
      id: "server-1",
      lane: "todo",
      title: "Saved",
    });
  });

  it("does not duplicate a server row inserted by realtime", () => {
    const realtimePage = {
      ...page,
      data: [
        { id: "opt_1", lane: "todo", title: "Draft" },
        { id: "server-1", lane: "todo", title: "Realtime" },
      ],
      total: 4,
    };

    const saved = reconcileOptimisticItem(realtimePage, "opt_1", {
      id: "server-1",
      lane: "todo",
      title: "Saved",
    });

    expect(saved?.data).toEqual([
      { id: "server-1", lane: "todo", title: "Saved" },
    ]);
    expect(saved?.total).toBe(4);
  });

  it("restores a saved row when a slow-write refetch removed its temp row", () => {
    const authoritativeBeforeCommit = {
      ...page,
      data: [{ id: "a", lane: "todo", title: "A" }],
      total: 1,
    };

    const saved = reconcileOptimisticItem(authoritativeBeforeCommit, "opt_1", {
      id: "server-1",
      lane: "todo",
      title: "Saved",
    });

    expect(saved?.data.map(({ id }) => id)).toEqual(["server-1", "a"]);
    expect(saved?.total).toBe(2);
  });

  it("does not inject a reconciled create into a later page", () => {
    const laterPage = { ...page, page: 2 };

    expect(
      reconcileOptimisticItem(laterPage, "opt_missing", {
        id: "server-1",
        lane: "todo",
        title: "Saved",
      })
    ).toBe(laterPage);
  });

  it("removes failed creates and deterministic deletes", () => {
    const optimistic = prependOptimisticItem(page, {
      id: "opt_1",
      lane: "todo",
      title: "Draft",
    });
    const recovered = removeOptimisticItems(optimistic, new Set(["opt_1"]));
    expect(recovered?.data.map(({ id }) => id)).toEqual(["a"]);
    expect(recovered?.total).toBe(3);
  });

  it("moves rows out of filtered lanes and preserves unrelated rows", () => {
    const moved = patchOptimisticItems(
      page,
      new Set(["a"]),
      { lane: "done" },
      (item) => item.lane === "todo"
    );
    expect(moved?.data.map(({ id }) => id)).toEqual(["b"]);
    expect(moved?.total).toBe(2);
    expect(page.data[0].lane).toBe("todo");
  });

  it("applies explicit order while retaining unmentioned rows", () => {
    expect(
      reorderOptimisticItems(
        [...page.data, { id: "c", lane: "todo", title: "C" }],
        ["b", "a"]
      ).map(({ id }) => id)
    ).toEqual(["b", "a", "c"]);
  });
});
