import { describe, expect, it, vi } from "vitest";
import type { Invoice, InvoiceBlock } from "../schema/types.js";
import {
  createInvoicesSpaceDataAdapter,
  INVOICE_MEMBERS,
  invoiceBlocksFromJson,
  invoicePatchFromJson,
  parseInvoiceBundlePath,
  renderInvoiceSummary,
} from "./adapter.js";

const INVOICE_ID = "11111111-2222-3333-4444-555555555555";
const BUNDLE = `draft/website-relaunch__${INVOICE_ID}.invoice`;

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    allowsFixedPositions: true,
    billingInterval: null,
    billingType: "fixed_price",
    correctsInvoiceId: null,
    createdAt: "2026-01-01T00:00:00Z",
    currency: "EUR",
    date: "2026-08-01",
    defaultTaxRate: 20,
    dueDate: "2026-08-15",
    finalNotes: "<p>Payable within 14 days.</p>",
    id: INVOICE_ID,
    introduction: "<p>Thank you for your business.</p>",
    issuedAt: null,
    number: "RE-2026-0042",
    phaseIndexPattern: "1.",
    phasesEnabled: false,
    recipientName: "Müller GmbH",
    reference: null,
    retainerAmount: null,
    showContactEmail: true,
    showContactName: true,
    showPhaseIndex: false,
    showPhaseTotals: false,
    showTaxPerItem: false,
    status: "draft",
    sumBrutto: 1440,
    sumNetto: 1200,
    tax: 240,
    title: "Website Relaunch",
    updatedAt: "2026-08-14T10:00:00Z",
    usageBased: false,
    ...overrides,
  } as Invoice;
}

function block(overrides: Partial<InvoiceBlock> = {}): InvoiceBlock {
  return {
    content_json: {
      amount: 10,
      cost_per_item: 120,
      title: "Design",
      unit: "h",
    },
    created_at: "2026-01-01T00:00:00Z",
    id: "block-1",
    invoice_id: INVOICE_ID,
    order_index: 0,
    scope_id: "default",
    tenant_id: "tenant-1",
    type: "line_item",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as InvoiceBlock;
}

function ctxWith(handlers: Record<string, unknown>) {
  const invokeOperation = vi.fn((operationId: string) =>
    Promise.resolve(handlers[operationId] ?? null)
  );
  return {
    ctx: {
      invokeOperation,
      recordScope: "all" as const,
      spaceId: "space-1",
      tenantId: "tenant-1",
    },
    invokeOperation,
  };
}

describe("bundle paths", () => {
  it("finds the record id and the member inside a bundle path", () => {
    expect(
      parseInvoiceBundlePath(`${BUNDLE}/${INVOICE_MEMBERS.letter}`)
    ).toEqual({ member: INVOICE_MEMBERS.letter, recordId: INVOICE_ID });
    expect(parseInvoiceBundlePath(BUNDLE)).toEqual({
      member: null,
      recordId: INVOICE_ID,
    });
  });

  it("answers null for a path that is not an invoice", () => {
    expect(parseInvoiceBundlePath("draft/notes.md")).toBeNull();
  });
});

describe("the folders are the legal lifecycle", () => {
  it("lists one folder per status and nothing at the root", async () => {
    const { ctx } = ctxWith({});
    const listing = await createInvoicesSpaceDataAdapter().list(ctx, "");
    expect(listing.entries).toEqual([]);
    expect(listing.folders.map((folder) => folder.name)).toEqual([
      "draft",
      "issued",
      "sent",
      "paid",
      "cancelled",
    ]);
    // Typed as invoice statuses, NOT as offer statuses: an offer's stages are a
    // pipeline, an invoice's are Festschreibung, and one view is not the other.
    expect(
      listing.folders.every((folder) => folder.nodeType === "invoices.status")
    ).toBe(true);
    expect(createInvoicesSpaceDataAdapter().rootNodeType).toBe("invoices.root");
  });

  it("puts each invoice in the folder its status names", async () => {
    const { ctx, invokeOperation } = ctxWith({
      invoices_list: [
        invoice(),
        invoice({ id: "other", number: "RE-2026-0001", status: "paid" }),
      ],
    });
    const adapter = createInvoicesSpaceDataAdapter();
    const drafts = await adapter.list(ctx, "draft");
    expect(drafts.entries.map((entry) => entry.recordId)).toEqual([INVOICE_ID]);
    const paid = await adapter.list(ctx, "paid");
    expect(paid.entries.map((entry) => entry.recordId)).toEqual(["other"]);
    // `invoices_list` takes an OBJECT: calling it with nothing fails schema
    // validation before the handler runs, and the folder comes back empty with
    // a 400 nobody reads. Found by the smoke test, pinned here.
    expect(invokeOperation).toHaveBeenCalledWith("invoices_list", {});
  });
});

describe("the bundle a human sees as one item and an agent as a directory", () => {
  it("reads all five members, with the summary marked derived", async () => {
    const { ctx } = ctxWith({
      invoices_get: invoice(),
      invoices_get_blocks: [block()],
    });
    const document = await createInvoicesSpaceDataAdapter().read(ctx, BUNDLE);
    expect(document.kind).toBe("bundle");
    expect(document.members.map((member) => member.name)).toEqual([
      INVOICE_MEMBERS.invoice,
      INVOICE_MEMBERS.letter,
      INVOICE_MEMBERS.closing,
      INVOICE_MEMBERS.positions,
      INVOICE_MEMBERS.summary,
    ]);
    const summary = document.members.at(-1);
    expect(summary?.derived).toBe(true);
    expect(summary?.editable).toBe(false);
  });

  it("carries the prose as HTML, which is what the fields hold", async () => {
    const { ctx } = ctxWith({
      invoices_get: invoice(),
      invoices_get_blocks: [],
    });
    const document = await createInvoicesSpaceDataAdapter().read(ctx, BUNDLE);
    const letter = document.members.find(
      (member) => member.name === INVOICE_MEMBERS.letter
    );
    expect(letter?.contentType).toBe("text/html");
  });

  it("presents an ISSUED invoice as read-only — the document says so, the UI does not guess", async () => {
    const { ctx } = ctxWith({
      invoices_get: invoice({
        issuedAt: "2026-08-10T09:00:00Z",
        status: "issued",
      }),
      invoices_get_blocks: [block()],
    });
    const document = await createInvoicesSpaceDataAdapter().read(
      ctx,
      `issued/website-relaunch__${INVOICE_ID}.invoice`
    );
    expect(document.members.every((member) => !member.editable)).toBe(true);
  });

  it("narrows to one member for a member read, keeping the record's version", async () => {
    const { ctx } = ctxWith({
      invoices_get: invoice(),
      invoices_get_blocks: [block()],
    });
    const document = await createInvoicesSpaceDataAdapter().read(
      ctx,
      `${BUNDLE}/${INVOICE_MEMBERS.letter}`
    );
    expect(document.members).toHaveLength(1);
    // The version is the RECORD's, so a write after a member read is still
    // checked against the whole invoice.
    expect(document.version).toBe("2026-08-14T10:00:00Z");
  });
});

describe("the derived summary", () => {
  it("reports the RECORD's totals, not a recomputation of them", () => {
    const text = renderInvoiceSummary({
      blocks: [block()],
      invoice: invoice(),
    });
    expect(text).toContain("Gross total: 1440.00 EUR");
    expect(text).toContain("read-only");
  });

  it("says an issued invoice cannot be edited at all", () => {
    const text = renderInvoiceSummary({
      blocks: [],
      invoice: invoice({ status: "issued" }),
    });
    expect(text).toContain("legal document");
  });
});

describe("write-through", () => {
  const adapter = createInvoicesSpaceDataAdapter();

  it("refuses the derived member BEFORE any read — no round trip to be told no", async () => {
    const { ctx, invokeOperation } = ctxWith({ invoices_get: invoice() });
    await expect(
      adapter.write?.(ctx, {
        baseVersion: "2026-08-14T10:00:00Z",
        content: "# mine now",
        path: `${BUNDLE}/${INVOICE_MEMBERS.summary}`,
      })
    ).rejects.toMatchObject({ code: "member_not_editable", status: 400 });
    expect(invokeOperation).not.toHaveBeenCalled();
  });

  it("refuses ANY write to an issued invoice — Festschreibung, before the version check", async () => {
    const { ctx, invokeOperation } = ctxWith({
      invoices_get: invoice({ status: "issued" }),
    });
    await expect(
      adapter.write?.(ctx, {
        baseVersion: "2026-08-14T10:00:00Z",
        content: "<p>New intro.</p>",
        path: `issued/website-relaunch__${INVOICE_ID}.invoice/${INVOICE_MEMBERS.letter}`,
      })
    ).rejects.toMatchObject({ code: "invoice_finalized", status: 409 });
    // Read once to learn the status; never attempted the update.
    expect(invokeOperation).toHaveBeenCalledTimes(1);
  });

  it("refuses a stale write with 409 and attempts no update", async () => {
    const { ctx, invokeOperation } = ctxWith({ invoices_get: invoice() });
    await expect(
      adapter.write?.(ctx, {
        baseVersion: "2026-08-14T09:00:00Z",
        content: "<p>New intro.</p>",
        path: `${BUNDLE}/${INVOICE_MEMBERS.letter}`,
      })
    ).rejects.toMatchObject({ code: "data_conflict", status: 409 });
    expect(invokeOperation).toHaveBeenCalledTimes(1);
  });

  it("routes the letter to invoices_update", async () => {
    const { ctx, invokeOperation } = ctxWith({
      invoices_get: invoice(),
      invoices_get_blocks: [],
      invoices_update: invoice({ introduction: "<p>New intro.</p>" }),
    });
    await adapter.write?.(ctx, {
      baseVersion: "2026-08-14T10:00:00Z",
      content: "<p>New intro.</p>\n",
      path: `${BUNDLE}/${INVOICE_MEMBERS.letter}`,
    });
    expect(invokeOperation).toHaveBeenCalledWith("invoices_update", {
      id: INVOICE_ID,
      patch: { introduction: "<p>New intro.</p>" },
    });
  });

  it("routes positions.json to invoices_replace_blocks, ordered by the array", async () => {
    const { ctx, invokeOperation } = ctxWith({
      invoices_get: invoice(),
      invoices_get_blocks: [block()],
      invoices_replace_blocks: [block()],
    });
    await adapter.write?.(ctx, {
      baseVersion: "2026-08-14T10:00:00Z",
      content: JSON.stringify([
        { content_json: { title: "Build" }, type: "headline" },
      ]),
      path: `${BUNDLE}/${INVOICE_MEMBERS.positions}`,
    });
    expect(invokeOperation).toHaveBeenCalledWith("invoices_replace_blocks", {
      blocks: [
        { content_json: { title: "Build" }, order_index: 0, type: "headline" },
      ],
      id: INVOICE_ID,
    });
  });
});

describe("invoice.json is a curated surface, not the row", () => {
  it("will not let a file save become a lifecycle transition", () => {
    expect(() =>
      invoicePatchFromJson({
        current: invoice(),
        text: JSON.stringify({ status: "issued" }),
      })
    ).toThrow(/lifecycle transition/);
  });

  it("refuses the totals — they are computed from the positions", () => {
    expect(() =>
      invoicePatchFromJson({
        current: invoice(),
        text: JSON.stringify({ sumBrutto: 1 }),
      })
    ).toThrow(/computed from the positions/);
  });

  it("refuses a hand-edited invoice number", () => {
    expect(() =>
      invoicePatchFromJson({
        current: invoice(),
        text: JSON.stringify({ number: "RE-2026-9999" }),
      })
    ).toThrow(/numbering sequence/);
  });

  it("refuses a field an invoice does not have", () => {
    expect(() =>
      invoicePatchFromJson({
        current: invoice(),
        text: JSON.stringify({ discount: 10 }),
      })
    ).toThrow(/not a field of an invoice/);
  });

  it("passes a read-only field back UNCHANGED without complaining", () => {
    // The file always carries them; only a real edit is an error.
    expect(
      invoicePatchFromJson({
        current: invoice(),
        text: JSON.stringify({ number: "RE-2026-0042", title: "Relaunch II" }),
      })
    ).toEqual({ title: "Relaunch II" });
  });
});

describe("positions.json", () => {
  it("takes order from the array, not from the file's own index", () => {
    expect(
      invoiceBlocksFromJson(
        JSON.stringify([
          { content_json: { title: "B" }, order_index: 99, type: "headline" },
          { content_json: { title: "A" }, order_index: 0, type: "headline" },
        ])
      )
    ).toEqual([
      { content_json: { title: "B" }, order_index: 0, type: "headline" },
      { content_json: { title: "A" }, order_index: 1, type: "headline" },
    ]);
  });

  it("refuses something that is not a list of blocks", () => {
    expect(() => invoiceBlocksFromJson('{"nope": true}')).toThrow(
      /must be a JSON array/
    );
  });
});
