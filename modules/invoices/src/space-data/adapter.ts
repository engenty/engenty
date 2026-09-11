/**
 * Invoices in the space Data tree — a BUNDLE with a legal boundary
 * (PLAN-space-data.md D2/D3, D7d).
 *
 * Shaped like the offer bundle, because an invoice is the same kind of thing —
 * fields, two pieces of prose, an ordered list of positions and a rendered
 * summary — presented the way macOS presents a package: one item to a human, a
 * directory to an agent:
 *
 *   Invoices/draft/relaunch__<id>.invoice/
 *     invoice.json     ← metadata + commercial settings  (editable, DRAFTS ONLY)
 *     letter.html      ← introduction                     (editable, DRAFTS ONLY)
 *     closing.html     ← final notes                      (editable, DRAFTS ONLY)
 *     positions.json   ← the content blocks               (editable, DRAFTS ONLY)
 *     summary.md       ← DERIVED render, read-only
 *
 * **The one thing that makes invoices different from offers: Festschreibung.**
 * Once an invoice is issued it is a legal document — the module refuses every
 * write to it (`InvoiceFinalizedError`), and this adapter refuses first, with a
 * message that says why. A file protocol that let an editor "save" over an
 * issued invoice would be handing out a way around that rule, which is exactly
 * the failure mode files-as-protocol exists to avoid.
 *
 * `letter.html`/`closing.html` are HTML, not markdown, because that is what the
 * fields hold — the module edits them with a rich-text editor and renders them
 * through `sanitizeHtml`. Naming them `.md` would invite an agent to write
 * markdown into a field that renders as HTML.
 */

import {
  assertSpaceDataMemberEditable,
  assertSpaceDataVersion,
  dataConflictError,
  notFoundError,
  PluginOperationError,
  type SpaceDataAdapter,
  type SpaceDataContext,
  type SpaceDataDocument,
  type SpaceDataEntry,
  type SpaceDataListing,
  type SpaceDataMember,
  type SpaceDataNodeType,
  type SpaceDataWriteInput,
  spaceDataFieldUnchanged,
  spaceDataNodeName,
  spaceDataNodeRecordId,
} from "@engenty/plugin-sdk";
import type { Invoice, InvoiceBlock, InvoiceStatus } from "../schema/types.js";
import { invoiceUpdateSchema } from "../schema/zod.js";

export const INVOICE_BUNDLE_EXTENSION = ".invoice";

export const INVOICE_MEMBERS = {
  closing: "closing.html",
  invoice: "invoice.json",
  letter: "letter.html",
  positions: "positions.json",
  summary: "summary.md",
} as const;

/**
 * Folders are the invoice's STATUS — the legal lifecycle, not a filing scheme.
 *
 * Unlike offers, moving between them is NOT a rename: `draft → issued` is
 * `invoices_issue` (Festschreibung, owner-approved), `issued → sent/paid` is
 * `invoices_set_status`, and `cancelled` is reached only by a Storno document.
 * The tree shows where an invoice IS; it does not offer to move it.
 */
const STATUSES: InvoiceStatus[] = [
  "draft",
  "issued",
  "sent",
  "paid",
  "cancelled",
];

/**
 * A status folder is a point in the invoice's LEGAL lifecycle, and says so.
 *
 * Distinct from `offers.status` even though both are "a status folder": an
 * offer's stages are a pipeline you push through, and an invoice's are a record
 * of Festschreibung — `issued` is not a stage, it is a document that can no
 * longer change. A view of one is not a view of the other.
 */
export const INVOICES_STATUS_NODE_TYPE = "invoices.status";
export const INVOICES_ROOT_NODE_TYPE = "invoices.root";

const INVOICE_NODE_TYPE: SpaceDataNodeType = {
  extension: INVOICE_BUNDLE_EXTENSION,
  id: "invoices.invoice",
  kind: "bundle",
  label: "Invoice",
  members: [
    {
      contentType: "application/json",
      editable: true,
      name: INVOICE_MEMBERS.invoice,
    },
    { contentType: "text/html", editable: true, name: INVOICE_MEMBERS.letter },
    { contentType: "text/html", editable: true, name: INVOICE_MEMBERS.closing },
    {
      contentType: "application/json",
      editable: true,
      name: INVOICE_MEMBERS.positions,
    },
    {
      contentType: "text/markdown",
      // A RENDER of the record, not a source of it.
      derived: true,
      name: INVOICE_MEMBERS.summary,
    },
  ],
};

/**
 * The fields `invoice.json` exposes for editing.
 *
 * A curated subset. Absent on purpose: `number` (the numbering sequence is the
 * module's, and a hand-edited duplicate would break the legal series),
 * `status` (a transition with approval gates, not a field), and the totals,
 * which are COMPUTED from the positions — letting a text editor set them would
 * let an invoice claim a sum its own line items do not add up to.
 */
const EDITABLE_INVOICE_FIELDS = [
  "title",
  "reference",
  "clientId",
  "date",
  "dueDate",
  "currency",
  "recipientName",
  "recipientAddress",
  "recipientEmail",
  "recipientCustomInfo",
  "showContactName",
  "showContactEmail",
  "billingType",
  "billingInterval",
  "retainerAmount",
  "spilloverRules",
  "allowsFixedPositions",
  "usageBased",
  "defaultTaxRate",
  "showTaxPerItem",
  "noTaxReason",
  "phasesEnabled",
  "showPhaseIndex",
  "phaseIndexPattern",
  "showPhaseTotals",
  "templateId",
] as const;

/** Shown in `invoice.json` so a reader has the context, refused on write. */
const READ_ONLY_INVOICE_FIELDS = [
  "id",
  "number",
  "status",
  "issuedAt",
  "correctsInvoiceId",
  "sumNetto",
  "tax",
  "sumBrutto",
  "createdAt",
  "updatedAt",
] as const;

function bundleName(invoice: Invoice): string {
  return spaceDataNodeName({
    extension: INVOICE_BUNDLE_EXTENSION,
    recordId: invoice.id,
    title: invoice.title || invoice.number,
  });
}

function bundlePath(invoice: Invoice): string {
  return `${invoice.status}/${bundleName(invoice)}`;
}

function invoiceJson(invoice: Invoice): string {
  const row = invoice as unknown as Record<string, unknown>;
  const readOnly: Record<string, unknown> = {};
  for (const field of READ_ONLY_INVOICE_FIELDS) {
    readOnly[field] = row[field];
  }
  const editable: Record<string, unknown> = {};
  for (const field of EDITABLE_INVOICE_FIELDS) {
    editable[field] = row[field];
  }
  return `${JSON.stringify({ ...readOnly, ...editable }, null, 2)}\n`;
}

function positionsJson(blocks: InvoiceBlock[]): string {
  return `${JSON.stringify(
    blocks.map((block) => ({
      content_json: block.content_json,
      id: block.id,
      type: block.type,
    })),
    null,
    2
  )}\n`;
}

/** Money as a reader would write it, not as the database stores it. */
function money(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

/**
 * The derived summary: what this invoice says, in one readable page.
 *
 * The totals come from the RECORD, not from re-adding the positions here: an
 * invoice's stored sums are what was billed, and a summary that recomputed them
 * would quietly disagree with the document the customer received.
 */
export function renderInvoiceSummary(input: {
  blocks: InvoiceBlock[];
  invoice: Invoice;
}): string {
  const { blocks, invoice } = input;
  const currency = invoice.currency || "EUR";
  const lines: string[] = [
    `# ${invoice.title || invoice.number}`,
    "",
    `**${invoice.number}** · ${invoice.status}`,
    "",
  ];
  if (invoice.recipientName) {
    lines.push(`Recipient: ${invoice.recipientName}`, "");
  }
  lines.push(`Date: ${invoice.date} · Due: ${invoice.dueDate}`, "");
  if (invoice.issuedAt) {
    lines.push(`Issued: ${invoice.issuedAt}`, "");
  }
  const items: string[] = [];
  for (const block of blocks) {
    const content = block.content_json;
    if (block.type === "line_item") {
      const quantity = Number(content.amount ?? 0);
      const unitPrice = Number(content.cost_per_item ?? 0);
      items.push(
        `| ${String(content.title ?? "")} | ${quantity} ${String(
          content.unit ?? ""
        )} | ${money(unitPrice, currency)} | ${money(
          quantity * unitPrice,
          currency
        )} |`
      );
      continue;
    }
    if (typeof content.title === "string" && content.title) {
      items.push(`| **${content.title}** | | | |`);
    }
  }
  if (items.length > 0) {
    lines.push(
      "| Position | Amount | Unit price | Total |",
      "| --- | --- | --- | --- |",
      ...items,
      ""
    );
  }
  lines.push(
    `Net: ${money(invoice.sumNetto, currency)} · Tax: ${money(
      invoice.tax,
      currency
    )}`,
    "",
    `**Gross total: ${money(invoice.sumBrutto, currency)}**`,
    "",
    invoice.status === "draft"
      ? `_Derived from the invoice record — read-only. Edit \`${INVOICE_MEMBERS.invoice}\`, \`${INVOICE_MEMBERS.letter}\`, \`${INVOICE_MEMBERS.closing}\` or \`${INVOICE_MEMBERS.positions}\` instead._`
      : "_This invoice is issued — it is a legal document and no member of it can be edited._",
    ""
  );
  return lines.join("\n");
}

function memberOf(
  name: string,
  content: string,
  contentType: string,
  options: { derived?: boolean; editable: boolean }
): SpaceDataMember {
  const derived = options.derived ?? false;
  return {
    content,
    contentType,
    derived,
    editable: options.editable && !derived,
    encoding: "utf8",
    name,
  };
}

function entryOf(invoice: Invoice): SpaceDataEntry {
  return {
    kind: "bundle",
    name: bundleName(invoice),
    nodeType: INVOICE_NODE_TYPE.id,
    path: bundlePath(invoice),
    recordId: invoice.id,
    version: invoice.updatedAt,
    updatedAt: invoice.updatedAt,
  };
}

async function getInvoice(ctx: SpaceDataContext, id: string): Promise<Invoice> {
  const invoice = (await ctx.invokeOperation("invoices_get", {
    idOrNumber: id,
  })) as Invoice | null;
  if (!invoice) {
    throw notFoundError("invoice_not_found", `No invoice with id ${id}`);
  }
  return invoice;
}

async function getBlocks(
  ctx: SpaceDataContext,
  id: string
): Promise<InvoiceBlock[]> {
  return ((await ctx.invokeOperation("invoices_get_blocks", { id })) ??
    []) as InvoiceBlock[];
}

async function documentOf(
  ctx: SpaceDataContext,
  invoice: Invoice
): Promise<SpaceDataDocument> {
  const blocks = await getBlocks(ctx, invoice.id);
  // Only a draft is editable, and the DOCUMENT says so rather than the UI
  // discovering it by having a save refused: an issued invoice is presented
  // read-only, which is what it is.
  const editable = invoice.status === "draft";
  return {
    kind: "bundle",
    members: [
      memberOf(
        INVOICE_MEMBERS.invoice,
        invoiceJson(invoice),
        "application/json",
        {
          editable,
        }
      ),
      memberOf(
        INVOICE_MEMBERS.letter,
        `${(invoice.introduction ?? "").trimEnd()}\n`,
        "text/html",
        { editable }
      ),
      memberOf(
        INVOICE_MEMBERS.closing,
        `${(invoice.finalNotes ?? "").trimEnd()}\n`,
        "text/html",
        { editable }
      ),
      memberOf(
        INVOICE_MEMBERS.positions,
        positionsJson(blocks),
        "application/json",
        { editable }
      ),
      memberOf(
        INVOICE_MEMBERS.summary,
        renderInvoiceSummary({ blocks, invoice }),
        "text/markdown",
        { derived: true, editable: false }
      ),
    ],
    name: bundleName(invoice),
    nodeType: INVOICE_NODE_TYPE.id,
    path: bundlePath(invoice),
    recordId: invoice.id,
    updatedAt: invoice.updatedAt,
    version: invoice.updatedAt,
  };
}

function parseJsonMember(name: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new PluginOperationError(
      "invalid_json",
      `${name} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { status: 400 }
    );
  }
}

/**
 * Turn an edited `invoice.json` into an `invoices_update` patch.
 *
 * Read-only fields are refused rather than dropped: a save that "succeeds"
 * while silently discarding what the writer changed is the failure mode a file
 * protocol makes easy and this one must not have.
 */
export function invoicePatchFromJson(input: {
  current: Invoice;
  text: string;
}): Record<string, unknown> {
  const parsed = parseJsonMember(INVOICE_MEMBERS.invoice, input.text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PluginOperationError(
      "invalid_json",
      `${INVOICE_MEMBERS.invoice} must be a JSON object.`,
      { status: 400 }
    );
  }
  const row = input.current as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>
  )) {
    if ((READ_ONLY_INVOICE_FIELDS as readonly string[]).includes(key)) {
      // Through the SDK helper: `createdAt`/`updatedAt` reach the file and the
      // record in two serialisations, and a raw comparison would refuse the
      // writer for a change nobody made.
      if (!spaceDataFieldUnchanged(row[key], value)) {
        throw new PluginOperationError("read_only_field", readOnlyReason(key), {
          details: { field: key },
          status: 400,
        });
      }
      continue;
    }
    if (!(EDITABLE_INVOICE_FIELDS as readonly string[]).includes(key)) {
      throw new PluginOperationError(
        "unknown_field",
        `"${key}" is not a field of an invoice.`,
        { details: { field: key }, status: 400 }
      );
    }
    patch[key] = value;
  }
  const validated = invoiceUpdateSchema.safeParse(patch);
  if (!validated.success) {
    throw new PluginOperationError(
      "invalid_invoice",
      `${INVOICE_MEMBERS.invoice} does not match the invoice schema: ${validated.error.issues
        .map(
          (issue) => `${issue.path.join(".") || "(root)"} — ${issue.message}`
        )
        .join("; ")}`,
      { details: { issues: validated.error.issues }, status: 400 }
    );
  }
  return validated.data as Record<string, unknown>;
}

function readOnlyReason(key: string): string {
  if (key === "status") {
    return "An invoice's status is a lifecycle transition with its own approval — issue, send, mark paid or cancel it, do not set the field.";
  }
  if (key === "number") {
    return "An invoice number comes from the numbering sequence and cannot be edited here.";
  }
  if (key === "sumNetto" || key === "tax" || key === "sumBrutto") {
    return `"${key}" is computed from the positions — edit ${INVOICE_MEMBERS.positions} instead.`;
  }
  return `"${key}" is set by the system and cannot be edited here.`;
}

/** `positions.json` back into the block list `invoices_replace_blocks` takes. */
export function invoiceBlocksFromJson(text: string): unknown[] {
  const parsed = parseJsonMember(INVOICE_MEMBERS.positions, text);
  if (!Array.isArray(parsed)) {
    throw new PluginOperationError(
      "invalid_json",
      `${INVOICE_MEMBERS.positions} must be a JSON array of blocks.`,
      { status: 400 }
    );
  }
  return parsed.map((block, index) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      throw new PluginOperationError(
        "invalid_json",
        `Block ${index} in ${INVOICE_MEMBERS.positions} must be an object.`,
        { status: 400 }
      );
    }
    const row = block as Record<string, unknown>;
    return {
      content_json: row.content_json ?? {},
      // The ARRAY's order is the positions' order — reordering in a text editor
      // is moving lines, so taking the index from the file instead would let a
      // hand-edited file disagree with itself about what comes first.
      order_index: index,
      type: row.type,
      ...(typeof row.id === "string" ? { id: row.id } : {}),
    };
  });
}

/** `<status>/<stem>__<id>.invoice[/member]` → the record and member asked for. */
export function parseInvoiceBundlePath(path: string): {
  member: string | null;
  recordId: string;
} | null {
  const segments = path.split("/").filter(Boolean);
  const bundleIndex = segments.findIndex((segment) =>
    segment.endsWith(INVOICE_BUNDLE_EXTENSION)
  );
  if (bundleIndex === -1) {
    return null;
  }
  const recordId = spaceDataNodeRecordId(
    segments[bundleIndex] ?? "",
    INVOICE_BUNDLE_EXTENSION
  );
  if (!recordId) {
    return null;
  }
  const rest = segments.slice(bundleIndex + 1).join("/");
  return { member: rest || null, recordId };
}

/** The legal boundary, refused HERE so the caller gets a reason, not a stack. */
function assertDraft(invoice: Invoice): void {
  if (invoice.status === "draft") {
    return;
  }
  throw new PluginOperationError(
    "invoice_finalized",
    `Invoice ${invoice.number} is ${invoice.status} — an issued invoice is a legal document and cannot be edited. Cancel it with a Storno and issue a new one.`,
    { details: { recordId: invoice.id, status: invoice.status }, status: 409 }
  );
}

export function createInvoicesSpaceDataAdapter(): SpaceDataAdapter {
  return {
    label: "Invoices",
    moduleId: "invoices",
    nodeTypes: [INVOICE_NODE_TYPE],
    /** Tenant-wide, like contacts and offers: invoices carry no `space_id`. */
    recordScopes: ["all"],
    root: "Invoices",
    rootNodeType: INVOICES_ROOT_NODE_TYPE,

    async list(ctx, path): Promise<SpaceDataListing> {
      if (!path) {
        return {
          entries: [],
          folders: STATUSES.map((status) => ({
            name: status,
            nodeType: INVOICES_STATUS_NODE_TYPE,
            path: status,
          })),
        };
      }
      const status = STATUSES.find((entry) => entry === path);
      if (!status) {
        throw notFoundError(
          "folder_not_found",
          `No invoices folder "${path}" — the tree has ${STATUSES.join(", ")}.`
        );
      }
      // `invoices_list` has no status filter and no paging: it returns the
      // tenant's invoices, and the folder is applied here. The `{}` is not
      // optional — the operation's input schema is an object, and calling it
      // with nothing fails validation before the handler ever runs.
      const invoices = ((await ctx.invokeOperation("invoices_list", {})) ??
        []) as Invoice[];
      return {
        entries: invoices
          .filter((invoice) => invoice.status === status)
          .map(entryOf),
        folders: [],
        self: {
          name: status,
          nodeType: INVOICES_STATUS_NODE_TYPE,
          path: status,
        },
      };
    },

    async read(ctx, path): Promise<SpaceDataDocument> {
      const target = parseInvoiceBundlePath(path);
      if (!target) {
        throw notFoundError(
          "invoice_not_found",
          `"${path}" is not an invoice.`
        );
      }
      const document = await documentOf(
        ctx,
        await getInvoice(ctx, target.recordId)
      );
      if (!target.member) {
        return document;
      }
      // A member read is the bundle narrowed to one file — the shape an agent's
      // `read_file` needs, with the SAME version, so a write that follows is
      // checked against the whole record.
      const member = document.members.find(
        (entry) => entry.name === target.member
      );
      if (!member) {
        throw notFoundError(
          "member_not_found",
          `An invoice has no "${target.member}".`
        );
      }
      return { ...document, members: [member] };
    },

    async write(ctx, input: SpaceDataWriteInput): Promise<SpaceDataDocument> {
      const target = parseInvoiceBundlePath(input.path);
      if (!target) {
        throw notFoundError(
          "invoice_not_found",
          `"${input.path}" is not an invoice.`
        );
      }
      const memberName = input.member ?? target.member;
      if (!memberName) {
        throw new PluginOperationError(
          "member_required",
          `An invoice is a bundle — name the member to write (${INVOICE_MEMBERS.invoice}, ${INVOICE_MEMBERS.letter}, ${INVOICE_MEMBERS.closing} or ${INVOICE_MEMBERS.positions}).`,
          { status: 400 }
        );
      }
      if (input.encoding === "base64") {
        throw new PluginOperationError(
          "unsupported_encoding",
          "Invoice members are text; send them as utf8.",
          { status: 400 }
        );
      }
      // Refuses derived and unknown members BEFORE any read, so `summary.md`
      // never costs a round trip to be told no.
      assertSpaceDataMemberEditable(INVOICE_NODE_TYPE, memberName);
      const current = await getInvoice(ctx, target.recordId);
      assertDraft(current);
      assertSpaceDataVersion(current.updatedAt, input.baseVersion, {
        recordId: target.recordId,
      });
      if (memberName === INVOICE_MEMBERS.positions) {
        await ctx.invokeOperation("invoices_replace_blocks", {
          blocks: invoiceBlocksFromJson(input.content),
          id: target.recordId,
        });
        return documentOf(ctx, await getInvoice(ctx, target.recordId));
      }
      const patch =
        memberName === INVOICE_MEMBERS.invoice
          ? invoicePatchFromJson({ current, text: input.content })
          : memberName === INVOICE_MEMBERS.letter
            ? { introduction: input.content.trimEnd() }
            : { finalNotes: input.content.trimEnd() };
      const updated = (await ctx.invokeOperation("invoices_update", {
        id: target.recordId,
        patch,
      })) as Invoice | null;
      if (!updated) {
        throw dataConflictError(
          "The invoice could not be updated — it may have been deleted since you opened it.",
          { recordId: target.recordId }
        );
      }
      return documentOf(ctx, updated);
    },
  };
}
