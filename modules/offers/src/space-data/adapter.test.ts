import { describe, expect, it, vi } from "vitest";
import type { Offer, OfferBlock } from "../schema/types.js";
import {
  createOffersSpaceDataAdapter,
  OFFER_MEMBERS,
  offerBlocksFromJson,
  offerPatchFromJson,
  parseOfferBundlePath,
  renderOfferSummary,
} from "./adapter.js";

const OFFER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const BUNDLE = `draft/website-relaunch__${OFFER_ID}.offer`;

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    accepted_at: null,
    allows_fixed_positions: true,
    approved_at: null,
    approved_by_name: null,
    billing_interval: null,
    billing_plan: null,
    billing_type: "fixed_price",
    client_id: null,
    contract_file_path: null,
    contract_notes: null,
    contract_signed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by: null,
    currency: "EUR",
    default_tax_rate: 20,
    final_notes: "Looking forward to it.",
    id: OFFER_ID,
    internal_notes: null,
    introduction: "Thank you for your interest.",
    lead_id: null,
    metadata_json: {},
    no_tax_reason: null,
    offer_date: "2026-08-01",
    offer_number: "2026-014",
    parent_offer_id: null,
    phase_index_pattern: "1.",
    phases_enabled: false,
    project_id: null,
    recipient_address: null,
    recipient_custom_info: null,
    recipient_email: null,
    recipient_name: "Müller GmbH",
    reference: null,
    retainer_amount: null,
    scope_id: "default",
    sent_at: null,
    settings_json: {},
    show_contact_email: true,
    show_contact_name: true,
    show_phase_index: true,
    show_phase_totals: true,
    show_tax_per_item: false,
    spillover_rules: null,
    status: "draft",
    tenant_id: "tenant-1",
    title: "Website Relaunch",
    updated_at: "2026-08-14T10:00:00Z",
    usage_based: false,
    valid_until: "2026-09-01",
    version_number: 1,
  } as Offer;
}

function block(overrides: Partial<OfferBlock> = {}): OfferBlock {
  return {
    content_json: {
      amount: 10,
      cost_per_item: 120,
      title: "Design",
      unit: "h",
    },
    created_at: "2026-01-01T00:00:00Z",
    id: "block-1",
    offer_id: OFFER_ID,
    order_index: 0,
    scope_id: "default",
    tenant_id: "tenant-1",
    type: "line_item",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as OfferBlock;
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

describe("the folders are the pipeline, and they say so", () => {
  it("types every status folder and the root above them", async () => {
    const { ctx } = ctxWith({});
    const adapter = createOffersSpaceDataAdapter();
    const listing = await adapter.list(ctx, "");
    expect(listing.folders.map((folder) => folder.name)).toEqual([
      "draft",
      "ready",
      "accepted",
    ]);
    // The type is what the pane looks the module's own view up by — the offers
    // module registers `spaces.data.folder:offers.status`.
    expect(
      listing.folders.every((folder) => folder.nodeType === "offers.status")
    ).toBe(true);
    expect(adapter.rootNodeType).toBe("offers.root");
  });

  it("describes the folder it just listed, so a link into one still knows its type", async () => {
    const { ctx } = ctxWith({
      offers_list: { data: [], page: 1, pageSize: 200, total: 0 },
    });
    const listing = await createOffersSpaceDataAdapter().list(ctx, "ready");
    expect(listing.self).toEqual({
      name: "ready",
      nodeType: "offers.status",
      path: "ready",
    });
  });
});

describe("bundle paths", () => {
  it("finds the record id and the member inside a bundle path", () => {
    expect(parseOfferBundlePath(`${BUNDLE}/letter.html`)).toEqual({
      member: "letter.html",
      recordId: OFFER_ID,
    });
    expect(parseOfferBundlePath(BUNDLE)).toEqual({
      member: null,
      recordId: OFFER_ID,
    });
  });

  it("answers null for a path that is not an offer", () => {
    expect(parseOfferBundlePath("draft/notes.md")).toBeNull();
  });
});

describe("the bundle a human sees as one item and an agent as a directory", () => {
  it("reads all five members, with the summary marked derived", async () => {
    const { ctx } = ctxWith({
      offers_get: offer(),
      offers_get_blocks: [block()],
    });
    const adapter = createOffersSpaceDataAdapter();
    const document = await adapter.read(ctx, BUNDLE);
    expect(document.kind).toBe("bundle");
    expect(document.members.map((member) => member.name)).toEqual([
      OFFER_MEMBERS.offer,
      OFFER_MEMBERS.letter,
      OFFER_MEMBERS.closing,
      OFFER_MEMBERS.positions,
      OFFER_MEMBERS.summary,
    ]);
    const summary = document.members.at(-1);
    expect(summary?.derived).toBe(true);
    expect(summary?.editable).toBe(false);
  });

  it("narrows to one member for a member read, keeping the record's version", async () => {
    const { ctx } = ctxWith({
      offers_get: offer(),
      offers_get_blocks: [block()],
    });
    const document = await createOffersSpaceDataAdapter().read(
      ctx,
      `${BUNDLE}/letter.html`
    );
    expect(document.members).toHaveLength(1);
    expect(document.members[0]?.content.trim()).toBe(
      "Thank you for your interest."
    );
    // The version is the RECORD's, so a write after a member read is still
    // checked against the whole offer.
    expect(document.version).toBe("2026-08-14T10:00:00Z");
  });
});

describe("the derived summary is computed, not copied", () => {
  it("adds the line items up", () => {
    const text = renderOfferSummary({
      blocks: [block(), block({ id: "b2" })],
      offer: offer(),
    });
    expect(text).toContain("Net total: 2400.00 EUR");
    expect(text).toContain("read-only");
  });
});

describe("write-through", () => {
  const adapter = createOffersSpaceDataAdapter();

  it("refuses the derived member BEFORE any read — no round trip to be told no", async () => {
    const { ctx, invokeOperation } = ctxWith({ offers_get: offer() });
    await expect(
      adapter.write?.(ctx, {
        baseVersion: "2026-08-14T10:00:00Z",
        content: "# mine now",
        path: `${BUNDLE}/${OFFER_MEMBERS.summary}`,
      })
    ).rejects.toMatchObject({ code: "member_not_editable", status: 400 });
    expect(invokeOperation).not.toHaveBeenCalled();
  });

  it("refuses a stale write with 409 and attempts no update", async () => {
    const { ctx, invokeOperation } = ctxWith({ offers_get: offer() });
    await expect(
      adapter.write?.(ctx, {
        baseVersion: "2026-08-14T09:00:00Z",
        content: "New intro.",
        path: `${BUNDLE}/${OFFER_MEMBERS.letter}`,
      })
    ).rejects.toMatchObject({ code: "data_conflict", status: 409 });
    expect(invokeOperation).toHaveBeenCalledTimes(1);
  });

  it("routes letter.html to offers_update", async () => {
    const { ctx, invokeOperation } = ctxWith({
      offers_get: offer(),
      offers_get_blocks: [],
      offers_update: offer({ introduction: "New intro." }),
    });
    await adapter.write?.(ctx, {
      baseVersion: "2026-08-14T10:00:00Z",
      content: "New intro.\n",
      path: `${BUNDLE}/${OFFER_MEMBERS.letter}`,
    });
    expect(invokeOperation).toHaveBeenCalledWith("offers_update", {
      id: OFFER_ID,
      patch: { introduction: "New intro." },
    });
  });

  it("routes positions.json to offers_replace_blocks", async () => {
    const { ctx, invokeOperation } = ctxWith({
      offers_get: offer(),
      offers_get_blocks: [block()],
      offers_replace_blocks: [block()],
    });
    await adapter.write?.(ctx, {
      baseVersion: "2026-08-14T10:00:00Z",
      content: JSON.stringify([
        { content_json: { title: "Build" }, type: "headline" },
      ]),
      path: `${BUNDLE}/${OFFER_MEMBERS.positions}`,
    });
    // `order_index` comes from the ARRAY's position, which is what makes
    // reordering lines in a text editor mean reordering positions.
    expect(invokeOperation).toHaveBeenCalledWith("offers_replace_blocks", {
      blocks: [
        { content_json: { title: "Build" }, order_index: 0, type: "headline" },
      ],
      id: OFFER_ID,
    });
  });

  it("will not let a file save become a status transition", () => {
    expect(() =>
      offerPatchFromJson({
        current: offer(),
        text: JSON.stringify({ status: "accepted" }),
      })
    ).toThrow(/transition/);
  });

  it("refuses a field an offer does not have", () => {
    expect(() =>
      offerPatchFromJson({
        current: offer(),
        text: JSON.stringify({ discount: 10 }),
      })
    ).toThrow(/not a field of an offer/);
  });

  it("accepts an edit to an editable field", () => {
    expect(
      offerPatchFromJson({
        current: offer(),
        text: JSON.stringify({ id: OFFER_ID, title: "Relaunch, phase 2" }),
      })
    ).toEqual({ title: "Relaunch, phase 2" });
  });

  it("numbers the positions from the array, so a hand-edited file cannot disagree with itself", () => {
    expect(
      offerBlocksFromJson(
        JSON.stringify([
          { content_json: { title: "A" }, type: "headline" },
          { content_json: { title: "B" }, type: "headline" },
        ])
      )
    ).toEqual([
      { content_json: { title: "A" }, order_index: 0, type: "headline" },
      { content_json: { title: "B" }, order_index: 1, type: "headline" },
    ]);
  });

  it("reports invalid JSON as the caller's error, not a crash", () => {
    expect(() => offerBlocksFromJson("{")).toThrow(/not valid JSON/);
    expect(() => offerBlocksFromJson('{"a":1}')).toThrow(
      /must be a JSON array/
    );
  });
});
