/**
 * Offers in the space Data tree — the BUNDLE (PLAN-space-data.md D2/D3).
 *
 * The deep half of the plan's deliberately varied pair. An offer is not one
 * file: it is fields, two pieces of prose, an ordered list of positions and a
 * rendered summary, so it presents the way macOS presents a package — one item
 * to a human, a directory to an agent:
 *
 *   Offers/draft/relaunch__<id>.offer/
 *     offer.json       ← metadata + commercial settings  (editable)
 *     letter.html      ← introduction                     (editable)
 *     closing.html     ← final notes                      (editable)
 *     positions.json   ← the content blocks               (editable)
 *     summary.md       ← DERIVED render, read-only
 *
 * Every member's write maps onto an offers operation that already exists
 * (`offers_update`, `offers_replace_blocks`), which is why editing one raises
 * the same approval card as calling that operation — because it is calling it.
 * `summary.md` maps onto nothing, which is the point of a derived member.
 *
 * `letter.html`/`closing.html` are HTML, not markdown, because that is what
 * the fields hold — the module edits them with a rich-text editor and renders
 * them through `stripHtmlTags`/sanitize. Naming them `.md` (the first cut did)
 * would invite an agent to write markdown into a field that renders as HTML.
 * Same rule as the invoices bundle.
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
import type { Offer, OfferBlock, OfferStatus } from "../schema/types.js";
import { offerUpdateSchema } from "../schema/zod.js";

export const OFFER_BUNDLE_EXTENSION = ".offer";

export const OFFER_MEMBERS = {
  closing: "closing.html",
  letter: "letter.html",
  offer: "offer.json",
  positions: "positions.json",
  summary: "summary.md",
} as const;

/**
 * Folders are the offer's STATUS.
 *
 * Single-valued, like contacts' `type`, and for the same reason: moving a
 * bundle from `draft/` to `ready/` is exactly `offers_set_status`, so the
 * folder structure carries a real transition rather than a filing convention.
 */
const STATUSES: OfferStatus[] = ["draft", "ready", "accepted"];

/**
 * A status folder is a STAGE of the pipeline, and says so.
 *
 * One type across the three, not one per status: `draft` and `accepted` want
 * the same page — the offers in that stage and what they are worth — and the
 * status is already on the folder's own row for a view that wants to differ.
 */
export const OFFERS_STATUS_NODE_TYPE = "offers.status";
export const OFFERS_ROOT_NODE_TYPE = "offers.root";

const OFFER_NODE_TYPE: SpaceDataNodeType = {
  extension: OFFER_BUNDLE_EXTENSION,
  id: "offers.offer",
  kind: "bundle",
  label: "Offer",
  members: [
    {
      contentType: "application/json",
      editable: true,
      name: OFFER_MEMBERS.offer,
    },
    { contentType: "text/html", editable: true, name: OFFER_MEMBERS.letter },
    { contentType: "text/html", editable: true, name: OFFER_MEMBERS.closing },
    {
      contentType: "application/json",
      editable: true,
      name: OFFER_MEMBERS.positions,
    },
    {
      contentType: "text/markdown",
      // A RENDER of the record, not a source of it. Editing it would be
      // meaningless, so it carries no write mapping and the write path refuses
      // it by name rather than accepting the bytes and dropping them.
      derived: true,
      name: OFFER_MEMBERS.summary,
    },
  ],
};

/**
 * The fields `offer.json` exposes for editing.
 *
 * A curated subset, not the whole row: identity, totals-affecting derivations
 * and the audit stamps are the module's to set. `status` is absent on purpose —
 * it is a TRANSITION (`offers_set_status`) with its own rules, and letting a
 * text editor set it to "accepted" would route a business decision through a
 * file save.
 */
const EDITABLE_OFFER_FIELDS = [
  "title",
  "client_id",
  "reference",
  "offer_date",
  "valid_until",
  "currency",
  "recipient_name",
  "recipient_address",
  "recipient_email",
  "recipient_custom_info",
  "show_contact_name",
  "show_contact_email",
  "billing_type",
  "billing_interval",
  "retainer_amount",
  "spillover_rules",
  "allows_fixed_positions",
  "usage_based",
  "default_tax_rate",
  "show_tax_per_item",
  "no_tax_reason",
  "phases_enabled",
  "show_phase_index",
  "phase_index_pattern",
  "show_phase_totals",
  "internal_notes",
  "project_id",
] as const;

/** Shown in `offer.json` so a reader has the context, refused on write. */
const READ_ONLY_OFFER_FIELDS = [
  "id",
  "offer_number",
  "status",
  "version_number",
  "created_at",
  "updated_at",
] as const;

interface OffersListResult {
  data: Offer[];
  page: number;
  pageSize: number;
  total: number;
}

const PAGE_SIZE = 200;

function bundleName(offer: Offer): string {
  return spaceDataNodeName({
    extension: OFFER_BUNDLE_EXTENSION,
    recordId: offer.id,
    title: offer.title || offer.offer_number,
  });
}

function bundlePath(offer: Offer): string {
  return `${offer.status}/${bundleName(offer)}`;
}

function offerJson(offer: Offer): string {
  const row = offer as unknown as Record<string, unknown>;
  const readOnly: Record<string, unknown> = {};
  for (const field of READ_ONLY_OFFER_FIELDS) {
    readOnly[field] = row[field];
  }
  const editable: Record<string, unknown> = {};
  for (const field of EDITABLE_OFFER_FIELDS) {
    editable[field] = row[field];
  }
  return `${JSON.stringify({ ...readOnly, ...editable }, null, 2)}\n`;
}

function positionsJson(blocks: OfferBlock[]): string {
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
 * The derived summary: what this offer says, in one readable page.
 *
 * Genuinely computed — line-item totals are added up here — which is what makes
 * it worth having: an agent asking "what is this offer worth" reads a number
 * instead of doing arithmetic over `positions.json` and getting it subtly
 * wrong.
 */
export function renderOfferSummary(input: {
  blocks: OfferBlock[];
  offer: Offer;
}): string {
  const { blocks, offer } = input;
  const lines: string[] = [
    `# ${offer.title}`,
    "",
    `**${offer.offer_number}** · ${offer.status}`,
    "",
  ];
  if (offer.recipient_name) {
    lines.push(`Recipient: ${offer.recipient_name}`, "");
  }
  if (offer.valid_until) {
    lines.push(`Valid until: ${offer.valid_until}`, "");
  }
  let net = 0;
  const items: string[] = [];
  for (const block of blocks) {
    const content = block.content_json as Record<string, unknown>;
    if (block.type === "line_item") {
      const quantity = Number(content.amount ?? 0);
      const unitPrice = Number(content.cost_per_item ?? 0);
      const total = quantity * unitPrice;
      net += total;
      items.push(
        `| ${String(content.title ?? "")} | ${quantity} ${String(
          content.unit ?? ""
        )} | ${money(unitPrice, offer.currency)} | ${money(
          total,
          offer.currency
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
      "",
      `**Net total: ${money(net, offer.currency)}**`,
      ""
    );
  }
  lines.push(
    "_Derived from the offer record — read-only. Edit `offer.json`, `letter.html`, `closing.html` or `positions.json` instead._",
    ""
  );
  return lines.join("\n");
}

function memberOf(
  name: string,
  content: string,
  contentType: string,
  derived = false
): SpaceDataMember {
  return {
    content,
    contentType,
    derived,
    editable: !derived,
    encoding: "utf8",
    name,
  };
}

function entryOf(offer: Offer): SpaceDataEntry {
  return {
    kind: "bundle",
    name: bundleName(offer),
    nodeType: OFFER_NODE_TYPE.id,
    path: bundlePath(offer),
    recordId: offer.id,
    version: offer.updated_at,
    ...(offer.updated_at ? { updatedAt: offer.updated_at } : {}),
  };
}

async function getOffer(ctx: SpaceDataContext, id: string): Promise<Offer> {
  const offer = (await ctx.invokeOperation("offers_get", {
    id,
  })) as Offer | null;
  if (!offer) {
    throw notFoundError("offer_not_found", `No offer with id ${id}`);
  }
  return offer;
}

async function getBlocks(
  ctx: SpaceDataContext,
  id: string
): Promise<OfferBlock[]> {
  return ((await ctx.invokeOperation("offers_get_blocks", { id })) ??
    []) as OfferBlock[];
}

async function documentOf(
  ctx: SpaceDataContext,
  offer: Offer
): Promise<SpaceDataDocument> {
  const blocks = await getBlocks(ctx, offer.id);
  return {
    kind: "bundle",
    members: [
      memberOf(OFFER_MEMBERS.offer, offerJson(offer), "application/json"),
      memberOf(
        OFFER_MEMBERS.letter,
        `${(offer.introduction ?? "").trimEnd()}\n`,
        "text/html"
      ),
      memberOf(
        OFFER_MEMBERS.closing,
        `${(offer.final_notes ?? "").trimEnd()}\n`,
        "text/html"
      ),
      memberOf(
        OFFER_MEMBERS.positions,
        positionsJson(blocks),
        "application/json"
      ),
      memberOf(
        OFFER_MEMBERS.summary,
        renderOfferSummary({ blocks, offer }),
        "text/markdown",
        true
      ),
    ],
    name: bundleName(offer),
    nodeType: OFFER_NODE_TYPE.id,
    path: bundlePath(offer),
    recordId: offer.id,
    version: offer.updated_at,
    ...(offer.updated_at ? { updatedAt: offer.updated_at } : {}),
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
 * Turn an edited `offer.json` into an `offers_update` patch.
 *
 * Read-only fields are refused rather than dropped, for the reason the whole
 * design exists: a save that "succeeds" while silently discarding what the
 * writer changed is the failure mode a file protocol makes easy and this one
 * must not have.
 */
export function offerPatchFromJson(input: {
  current: Offer;
  text: string;
}): Record<string, unknown> {
  const parsed = parseJsonMember(OFFER_MEMBERS.offer, input.text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PluginOperationError(
      "invalid_json",
      `${OFFER_MEMBERS.offer} must be a JSON object.`,
      { status: 400 }
    );
  }
  const row = input.current as unknown as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>
  )) {
    if ((READ_ONLY_OFFER_FIELDS as readonly string[]).includes(key)) {
      // Through the SDK helper for the same reason contacts does: `created_at`
      // and `updated_at` reach the file and the record in two serialisations,
      // and a raw comparison refuses the writer for a change nobody made.
      if (!spaceDataFieldUnchanged(row[key], value)) {
        throw new PluginOperationError(
          "read_only_field",
          key === "status"
            ? "An offer's status is a transition, not a field — use the offer's status action."
            : `"${key}" is set by the system and cannot be edited here.`,
          { details: { field: key }, status: 400 }
        );
      }
      continue;
    }
    if (!(EDITABLE_OFFER_FIELDS as readonly string[]).includes(key)) {
      throw new PluginOperationError(
        "unknown_field",
        `"${key}" is not a field of an offer.`,
        { details: { field: key }, status: 400 }
      );
    }
    patch[key] = value;
  }
  const validated = offerUpdateSchema.safeParse(patch);
  if (!validated.success) {
    throw new PluginOperationError(
      "invalid_offer",
      `${OFFER_MEMBERS.offer} does not match the offer schema: ${validated.error.issues
        .map(
          (issue) => `${issue.path.join(".") || "(root)"} — ${issue.message}`
        )
        .join("; ")}`,
      { details: { issues: validated.error.issues }, status: 400 }
    );
  }
  return validated.data as Record<string, unknown>;
}

/** `positions.json` back into the block list `offers_replace_blocks` takes. */
export function offerBlocksFromJson(text: string): unknown[] {
  const parsed = parseJsonMember(OFFER_MEMBERS.positions, text);
  if (!Array.isArray(parsed)) {
    throw new PluginOperationError(
      "invalid_json",
      `${OFFER_MEMBERS.positions} must be a JSON array of blocks.`,
      { status: 400 }
    );
  }
  return parsed.map((block, index) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      throw new PluginOperationError(
        "invalid_json",
        `Block ${index} in ${OFFER_MEMBERS.positions} must be an object.`,
        { status: 400 }
      );
    }
    const row = block as Record<string, unknown>;
    return {
      content_json: row.content_json ?? {},
      // The ARRAY's order is the positions' order — that is what makes editing
      // `positions.json` in a text editor work at all, since reordering there
      // is moving lines. `offers_replace_blocks` requires the index, and taking
      // it from the file rather than from the array would let a hand-edited
      // file disagree with itself about what comes first.
      order_index: index,
      type: row.type,
      ...(typeof row.id === "string" ? { id: row.id } : {}),
    };
  });
}

/** `<status>/<stem>__<id>.offer[/member]` → the record and the member asked for. */
export function parseOfferBundlePath(path: string): {
  member: string | null;
  recordId: string;
} | null {
  const segments = path.split("/").filter(Boolean);
  const bundleIndex = segments.findIndex((segment) =>
    segment.endsWith(OFFER_BUNDLE_EXTENSION)
  );
  if (bundleIndex === -1) {
    return null;
  }
  const recordId = spaceDataNodeRecordId(
    segments[bundleIndex] ?? "",
    OFFER_BUNDLE_EXTENSION
  );
  if (!recordId) {
    return null;
  }
  const rest = segments.slice(bundleIndex + 1).join("/");
  return { member: rest || null, recordId };
}

export function createOffersSpaceDataAdapter(): SpaceDataAdapter {
  return {
    label: "Offers",
    moduleId: "offers",
    nodeTypes: [OFFER_NODE_TYPE],
    /** Tenant-wide, like contacts: offers carry no `space_id` (PLAN-spaces §1b-bis). */
    recordScopes: ["all"],
    root: "Offers",
    rootNodeType: OFFERS_ROOT_NODE_TYPE,

    async list(ctx, path): Promise<SpaceDataListing> {
      if (!path) {
        return {
          entries: [],
          folders: STATUSES.map((status) => ({
            name: status,
            nodeType: OFFERS_STATUS_NODE_TYPE,
            path: status,
          })),
        };
      }
      const status = STATUSES.find((entry) => entry === path);
      if (!status) {
        throw notFoundError(
          "folder_not_found",
          `No offers folder "${path}" — the tree has ${STATUSES.join(", ")}.`
        );
      }
      const result = ((await ctx.invokeOperation("offers_list", {
        page: 1,
        pageSize: PAGE_SIZE,
        status,
      })) ?? {
        data: [],
        page: 1,
        pageSize: PAGE_SIZE,
        total: 0,
      }) as OffersListResult;
      return {
        entries: result.data.map(entryOf),
        folders: [],
        self: {
          name: status,
          nodeType: OFFERS_STATUS_NODE_TYPE,
          path: status,
        },
        ...(result.total > result.data.length ? { truncated: true } : {}),
      };
    },

    async read(ctx, path): Promise<SpaceDataDocument> {
      const target = parseOfferBundlePath(path);
      if (!target) {
        throw notFoundError("offer_not_found", `"${path}" is not an offer.`);
      }
      const document = await documentOf(
        ctx,
        await getOffer(ctx, target.recordId)
      );
      if (!target.member) {
        return document;
      }
      // A member read is the bundle narrowed to one file — the shape an agent's
      // `read_file` on `…/letter.html` needs, with the SAME version, so a write
      // that follows it is checked against the whole record.
      const member = document.members.find(
        (entry) => entry.name === target.member
      );
      if (!member) {
        throw notFoundError(
          "member_not_found",
          `An offer has no "${target.member}".`
        );
      }
      return { ...document, members: [member] };
    },

    async write(ctx, input: SpaceDataWriteInput): Promise<SpaceDataDocument> {
      const target = parseOfferBundlePath(input.path);
      if (!target) {
        throw notFoundError(
          "offer_not_found",
          `"${input.path}" is not an offer.`
        );
      }
      const memberName = input.member ?? target.member;
      if (!memberName) {
        throw new PluginOperationError(
          "member_required",
          "An offer is a bundle — name the member to write (offer.json, letter.html, closing.html or positions.json).",
          { status: 400 }
        );
      }
      if (input.encoding === "base64") {
        throw new PluginOperationError(
          "unsupported_encoding",
          "Offer members are text; send them as utf8.",
          { status: 400 }
        );
      }
      // Refuses derived and unknown members BEFORE any read, so `summary.md`
      // never costs a round trip to be told no.
      assertSpaceDataMemberEditable(OFFER_NODE_TYPE, memberName);
      const current = await getOffer(ctx, target.recordId);
      assertSpaceDataVersion(current.updated_at, input.baseVersion, {
        recordId: target.recordId,
      });
      if (memberName === OFFER_MEMBERS.positions) {
        await ctx.invokeOperation("offers_replace_blocks", {
          blocks: offerBlocksFromJson(input.content),
          id: target.recordId,
        });
        return documentOf(ctx, await getOffer(ctx, target.recordId));
      }
      const patch =
        memberName === OFFER_MEMBERS.offer
          ? offerPatchFromJson({ current, text: input.content })
          : memberName === OFFER_MEMBERS.letter
            ? { introduction: input.content.trimEnd() }
            : { final_notes: input.content.trimEnd() };
      const updated = (await ctx.invokeOperation("offers_update", {
        id: target.recordId,
        patch,
      })) as Offer | null;
      if (!updated) {
        throw dataConflictError(
          "The offer could not be updated — it may have been deleted since you opened it.",
          { recordId: target.recordId }
        );
      }
      return documentOf(ctx, updated);
    },
  };
}
