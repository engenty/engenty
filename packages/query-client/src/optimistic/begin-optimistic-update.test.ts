import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { beginOptimisticUpdate } from "./begin-optimistic-update.js";

const queryKey = ["optimistic-test", "detail"] as const;

describe("beginOptimisticUpdate", () => {
  it("cancels the exact query before reading and patching its cache", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKey, { value: "before" });
    const events: string[] = [];
    let releaseCancellation = () => {};
    const cancellation = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    vi.spyOn(queryClient, "cancelQueries").mockImplementation(async () => {
      events.push("cancel-start");
      await cancellation;
      events.push("cancel-finish");
    });

    const transactionPromise = beginOptimisticUpdate(queryClient, {
      queryKey,
      update: (current: { value: string } | undefined) => {
        events.push("update");
        return { value: `${current?.value}-optimistic` };
      },
    });

    await Promise.resolve();
    expect(events).toEqual(["cancel-start"]);
    expect(queryClient.getQueryData(queryKey)).toEqual({ value: "before" });

    releaseCancellation();
    await transactionPromise;

    expect(events).toEqual(["cancel-start", "cancel-finish", "update"]);
    expect(queryClient.cancelQueries).toHaveBeenCalledWith({
      exact: true,
      queryKey,
    });
    expect(queryClient.getQueryData(queryKey)).toEqual({
      value: "before-optimistic",
    });
  });

  it("restores its snapshot when its optimistic value is still current", async () => {
    const queryClient = new QueryClient();
    const snapshot = { value: "before" };
    queryClient.setQueryData(queryKey, snapshot);

    const transaction = await beginOptimisticUpdate(queryClient, {
      queryKey,
      update: () => ({ value: "optimistic" }),
    });

    expect(transaction.rollback()).toBe("restored");
    expect(queryClient.getQueryData(queryKey)).toEqual(snapshot);
  });

  it("removes optimistic data when no snapshot existed", async () => {
    const queryClient = new QueryClient();
    const transaction = await beginOptimisticUpdate(queryClient, {
      queryKey,
      update: () => ({ value: "optimistic" }),
    });

    expect(queryClient.getQueryData(queryKey)).toEqual({
      value: "optimistic",
    });
    expect(transaction.rollback()).toBe("restored");
    expect(queryClient.getQueryState(queryKey)).toBeUndefined();
  });

  it("does not erase a newer mutation and invalidates for recovery", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKey, { value: "before" });
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    const transaction = await beginOptimisticUpdate(queryClient, {
      queryKey,
      update: () => ({ value: "first optimistic value" }),
    });

    queryClient.setQueryData(queryKey, { value: "newer mutation" });

    expect(transaction.rollback()).toBe("invalidated");
    expect(queryClient.getQueryData(queryKey)).toEqual({
      value: "newer mutation",
    });
    expect(invalidate).toHaveBeenCalledWith({ exact: true, queryKey });
  });

  it("preserves authoritative data written by a realtime refetch", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKey, { value: "before" });
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    const transaction = await beginOptimisticUpdate(queryClient, {
      queryKey,
      update: () => ({ value: "optimistic" }),
    });

    queryClient.setQueryData(queryKey, { value: "authoritative realtime" });

    expect(transaction.rollback()).toBe("invalidated");
    expect(queryClient.getQueryData(queryKey)).toEqual({
      value: "authoritative realtime",
    });
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("supports explicit refetch recovery for overlapping mutation scopes", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    const transaction = await beginOptimisticUpdate(queryClient, {
      queryKey,
      update: () => ({ value: "optimistic" }),
    });

    await transaction.invalidate();

    expect(invalidate).toHaveBeenCalledWith({ exact: true, queryKey });
  });
});
