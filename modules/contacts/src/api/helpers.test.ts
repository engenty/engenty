import { describe, expect, it, vi } from "vitest";
import { attachLinkedInvoiceCounts, countLinkedInvoices } from "./helpers.js";

describe("countLinkedInvoices", () => {
  it("returns undefined when the invoices operation is not registered", async () => {
    const invokeOperation = vi.fn();
    const api = {
      hasOperation: () => false,
      invokeOperation,
    };

    const out = await countLinkedInvoices(api as never, "c1", undefined);

    expect(out).toBeUndefined();
    expect(invokeOperation).not.toHaveBeenCalled();
  });

  it("returns the linked invoice count when the gateway call succeeds", async () => {
    const invokeOperation = vi
      .fn()
      .mockResolvedValue([{ id: "i1" }, { id: "i2" }]);
    const api = {
      hasOperation: (name: string) => name === "invoices_list_by_client",
      invokeOperation,
    };

    const out = await countLinkedInvoices(api as never, "c1", undefined);

    expect(out).toBe(2);
  });

  it("degrades gracefully when the gateway call throws (e.g. missing module.invoices.read → 403)", async () => {
    const invokeOperation = vi.fn().mockRejectedValue(new Error("forbidden"));
    const api = {
      hasOperation: (name: string) => name === "invoices_list_by_client",
      invokeOperation,
    };

    const out = await countLinkedInvoices(api as never, "c1", undefined);

    // The count is optional enrichment; a cross-module authorization failure
    // must not propagate and break loading the contact itself.
    expect(out).toBeUndefined();
  });
});

describe("attachLinkedInvoiceCounts", () => {
  it("returns early for empty contact lists", async () => {
    const invokeOperation = vi.fn();
    const api = {
      hasOperation: () => true,
      invokeOperation,
    };

    const out = await attachLinkedInvoiceCounts(api as never, [], undefined);

    expect(out).toEqual([]);
    expect(invokeOperation).not.toHaveBeenCalled();
  });

  it("uses a single batched gateway call when invoices.countByClientIds exists", async () => {
    const invokeOperation = vi.fn().mockResolvedValue({
      a: 2,
      b: 0,
    });
    const api = {
      hasOperation: (name: string) => name === "invoices_count_by_client_ids",
      invokeOperation,
    };

    const contacts = [{ id: "a" }, { id: "b" }];
    const out = await attachLinkedInvoiceCounts(
      api as never,
      contacts,
      undefined
    );

    expect(invokeOperation).toHaveBeenCalledTimes(1);
    expect(invokeOperation).toHaveBeenCalledWith(
      "invoices_count_by_client_ids",
      { clientIds: ["a", "b"] },
      { auth: undefined }
    );
    expect(out).toEqual([
      { id: "a", linked_invoices_count: 2 },
      { id: "b", linked_invoices_count: 0 },
    ]);
  });

  it("falls back to per-contact listByClient when batch method is missing", async () => {
    let listByClientCalls = 0;
    const invokeOperation = vi.fn(async (name: string) => {
      if (name === "invoices_list_by_client") {
        listByClientCalls++;
        return [{ id: "inv1" }];
      }
      return [];
    });
    const api = {
      hasOperation: (n: string) => n === "invoices_list_by_client",
      invokeOperation,
    };

    const contacts = [{ id: "x" }, { id: "y" }];
    const out = await attachLinkedInvoiceCounts(
      api as never,
      contacts,
      undefined
    );

    expect(listByClientCalls).toBe(2);
    expect(out).toEqual([
      { id: "x", linked_invoices_count: 1 },
      { id: "y", linked_invoices_count: 1 },
    ]);
  });

  it("falls back to legacy listByClient when the batch call throws", async () => {
    const invokeOperation = vi.fn(async (name: string) => {
      if (name === "invoices_count_by_client_ids") {
        throw new Error("boom");
      }
      if (name === "invoices_list_by_client") {
        return [{ id: "inv1" }, { id: "inv2" }];
      }
      return [];
    });
    const api = {
      hasOperation: (name: string) =>
        name === "invoices_count_by_client_ids" ||
        name === "invoices_list_by_client",
      invokeOperation,
    };

    const out = await attachLinkedInvoiceCounts(
      api as never,
      [{ id: "x" }],
      undefined
    );

    expect(out).toEqual([{ id: "x", linked_invoices_count: 2 }]);
    expect(invokeOperation).toHaveBeenCalledWith(
      "invoices_count_by_client_ids",
      { clientIds: ["x"] },
      { auth: undefined }
    );
    expect(invokeOperation).toHaveBeenCalledWith(
      "invoices_list_by_client",
      { clientId: "x" },
      { auth: undefined }
    );
  });
});
