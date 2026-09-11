/**
 * Contacts in the space Data tree (PLAN-space-data.md D2/D3).
 *
 * The FLAT half of the plan's deliberately varied pair: one contact is one
 * file, `<stem>__<id>.contact.md`, frontmatter above and notes below — the OKF
 * shape, so a contact and a KB article exported side by side are the same
 * kind of object.
 *
 * Every read and write here goes through `ctx.invokeOperation`, which is
 * `contacts_list` / `contacts_get` / `contacts_update` with the CALLER's
 * principal. There is no second data path: an agent that edits
 * `Contacts/People/anna-berger__<id>.contact.md` is calling `contacts_update`,
 * and gets `contacts_update`'s approval card.
 */

import {
  assertSpaceDataVersion,
  dataConflictError,
  notFoundError,
  PluginOperationError,
  parseCsv,
  parseFrontmatter,
  type SpaceDataAdapter,
  type SpaceDataContext,
  type SpaceDataDocument,
  type SpaceDataEntry,
  type SpaceDataImportResult,
  type SpaceDataListing,
  type SpaceDataNodeType,
  type SpaceDataWriteInput,
  serializeCsv,
  serializeFrontmatter,
  spaceDataFieldUnchanged,
  spaceDataNodeName,
  spaceDataNodeRecordId,
} from "@engenty/plugin-sdk";
import type { ContactRecord } from "../schema/zod.js";
import { contactUpdateSchema } from "../schema/zod.js";

export const CONTACT_NODE_EXTENSION = ".contact.md";
export const CONTACTS_COLLECTION_NAME = "contacts.csv";

/**
 * The taxonomy: `type`, and only `type`.
 *
 * Single-valued on purpose. Roles are the other candidate and they are a
 * LABEL set — a contact can hold three — so role folders would file the same
 * record in three places and make "move it to Suppliers" an ambiguous
 * instruction. `type` is exactly one value per contact, so moving a node
 * between these two folders IS `contacts_update { type }`, which is the rule
 * decision 3 asks folders to obey.
 */
const FOLDERS = [
  { name: "People", type: "person" as const },
  { name: "Organisations", type: "organisation" as const },
];

/**
 * The type both taxonomy folders wear, and the type of the root above them.
 *
 * One type for People and Organisations rather than one each: they differ in
 * WHICH contacts they hold, not in what a reader wants to see, and a view per
 * folder would be the same view twice. The root is its own type because it
 * holds the two folders and the collection view, which is a different page.
 */
export const CONTACTS_FOLDER_NODE_TYPE = "contacts.folder";
// The derived all-contacts CSV. No module view registers for it on purpose —
// the generic grid pane IS the right renderer for a spreadsheet — but the id
// is a constant like its siblings so a future view has one name to key on.
export const CONTACTS_COLLECTION_NODE_TYPE = "contacts.collection";
export const CONTACTS_ROOT_NODE_TYPE = "contacts.root";

const CONTACT_NODE_TYPE: SpaceDataNodeType = {
  extension: CONTACT_NODE_EXTENSION,
  id: "contacts.contact",
  kind: "record",
  label: "Contact",
};

/**
 * Fields the file shows but a file write may not change.
 *
 * `roles` is here because it has its own operations (`contacts_add_contact_role`)
 * with their own policy — accepting it silently from frontmatter would route a
 * grant-shaped change through the wrong gate. A writer who changes one of these
 * is TOLD, rather than having the edit quietly dropped.
 */
const READ_ONLY_FIELDS = [
  "id",
  "created_at",
  "updated_at",
  "roles",
  "linked_invoices_count",
] as const;

/** Fields that ride in the frontmatter, in the order a reader wants them. */
const FRONTMATTER_FIELDS = [
  "type",
  "display_name",
  "name_prefix",
  "first_name",
  "middle_name",
  "last_name",
  "name_suffix",
  "legal_name",
  "contact_name",
  "email",
  "billing_email",
  "phone",
  "website_contact",
  "website_impress",
  "address_street",
  "address_zip",
  "address_city",
  "address_country",
  "address_info",
  "vat_id",
  "tax_id",
  "registration_number",
  "court_of_registration",
  "legal_form",
  "reference_id",
] as const;

interface ContactsListResult {
  data: ContactRecord[];
  page: number;
  pageSize: number;
  total: number;
}

const PAGE_SIZE = 200;

function folderForType(type: string): string {
  return FOLDERS.find((folder) => folder.type === type)?.name ?? "People";
}

function contactTitle(contact: ContactRecord): string {
  return (
    contact.display_name ||
    contact.legal_name ||
    contact.contact_name ||
    contact.email ||
    contact.id
  );
}

function nodeName(contact: ContactRecord): string {
  return spaceDataNodeName({
    extension: CONTACT_NODE_EXTENSION,
    recordId: contact.id,
    title: contactTitle(contact),
  });
}

function nodePath(contact: ContactRecord): string {
  return `${folderForType(contact.type)}/${nodeName(contact)}`;
}

/**
 * The file, rendered.
 *
 * `id` leads the frontmatter because it is the identity — a reader who has the
 * bytes and lost the path can still say which record this is, which is the
 * property that makes rename and move safe.
 */
export function renderContactFile(contact: ContactRecord): string {
  const frontmatter: Record<string, unknown> = { id: contact.id };
  for (const field of FRONTMATTER_FIELDS) {
    const value = (contact as unknown as Record<string, unknown>)[field];
    if (value !== null && value !== undefined && value !== "") {
      frontmatter[field] = value;
    }
  }
  if (contact.roles?.length) {
    frontmatter.roles = contact.roles;
  }
  frontmatter.updated_at = contact.updated_at;
  return serializeFrontmatter(frontmatter, contact.notes ?? "");
}

function entryOf(contact: ContactRecord): SpaceDataEntry {
  return {
    kind: "record",
    name: nodeName(contact),
    nodeType: CONTACT_NODE_TYPE.id,
    path: nodePath(contact),
    recordId: contact.id,
    title: contactTitle(contact),
    version: contact.updated_at,
    ...(contact.updated_at ? { updatedAt: contact.updated_at } : {}),
  };
}

function documentOf(contact: ContactRecord): SpaceDataDocument {
  const name = nodeName(contact);
  return {
    kind: "record",
    members: [
      {
        content: renderContactFile(contact),
        contentType: "text/markdown",
        derived: false,
        editable: true,
        encoding: "utf8",
        name,
      },
    ],
    name,
    nodeType: CONTACT_NODE_TYPE.id,
    path: nodePath(contact),
    recordId: contact.id,
    version: contact.updated_at,
    ...(contact.updated_at ? { updatedAt: contact.updated_at } : {}),
  };
}

async function listContacts(
  ctx: SpaceDataContext,
  input: { page?: number; type?: string }
): Promise<ContactsListResult> {
  const result = (await ctx.invokeOperation("contacts_list", {
    include_linked_invoice_counts: false,
    page: input.page ?? 1,
    pageSize: PAGE_SIZE,
    ...(input.type ? { type: input.type } : {}),
  })) as ContactsListResult | null;
  return (
    result ?? { data: [], page: input.page ?? 1, pageSize: PAGE_SIZE, total: 0 }
  );
}

async function getContact(
  ctx: SpaceDataContext,
  id: string
): Promise<ContactRecord> {
  const contact = (await ctx.invokeOperation("contacts_get", {
    id,
  })) as ContactRecord | null;
  if (!contact) {
    throw notFoundError("contact_not_found", `No contact with id ${id}`);
  }
  return contact;
}

/**
 * Build the update patch from an edited file.
 *
 * Two refusals rather than two silent drops: a changed read-only field, and a
 * field the update schema does not know. Both mean the writer believed
 * something about this file that is not true, and letting the save "succeed"
 * while losing their change is the failure mode this whole design exists to
 * avoid.
 */
export function contactPatchFromFile(input: {
  current: ContactRecord;
  text: string;
}): { notes: string; patch: Record<string, unknown> } {
  const { body, frontmatter } = parseFrontmatter(input.text);
  const patch: Record<string, unknown> = {};
  const currentRow = input.current as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(frontmatter)) {
    if ((READ_ONLY_FIELDS as readonly string[]).includes(key)) {
      // Compared through the SDK helper, not by string: a file carrying
      // `updated_at` as `…439Z` against a record reporting `…439+00:00` looks
      // edited when nobody touched it, and the writer is then refused for a
      // change they did not make.
      if (!spaceDataFieldUnchanged(currentRow[key], value)) {
        throw new PluginOperationError(
          "read_only_field",
          key === "roles"
            ? "Roles are changed with the contact's role actions, not by editing this file."
            : `"${key}" is set by the system and cannot be edited here.`,
          { details: { field: key }, status: 400 }
        );
      }
      continue;
    }
    patch[key] = value;
  }
  patch.notes = body;
  const parsed = contactUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    throw new PluginOperationError(
      "invalid_contact",
      `This contact file does not match the contact schema: ${parsed.error.issues
        .map(
          (issue) => `${issue.path.join(".") || "(root)"} — ${issue.message}`
        )
        .join("; ")}`,
      { details: { issues: parsed.error.issues }, status: 400 }
    );
  }
  return { notes: body, patch: parsed.data as Record<string, unknown> };
}

/** Columns of the `contacts.csv` collection view (D5). */
export const CONTACT_CSV_COLUMNS = [
  "id",
  "type",
  "display_name",
  "legal_name",
  "email",
  "phone",
  "address_street",
  "address_zip",
  "address_city",
  "address_country",
  "vat_id",
  "roles",
] as const;

export function createContactsSpaceDataAdapter(): SpaceDataAdapter {
  return {
    label: "Contacts",
    moduleId: "contacts",
    nodeTypes: [CONTACT_NODE_TYPE],
    /**
     * `all` only. Contacts are ONE address book per tenant (PLAN-spaces
     * §1b-bis) — the rows carry no `space_id`, so there is no honest way to
     * answer a `space`-scoped mount, and core hides the root rather than
     * pretending the narrowing happened.
     */
    recordScopes: ["all"],
    root: "Contacts",
    rootNodeType: CONTACTS_ROOT_NODE_TYPE,

    /**
     * Saving `contacts.csv` is a BULK operation, never a file save (D5).
     *
     * One `contacts_bulk_import` call: one approval card, one count, one audit
     * row. The `roles` column is dropped rather than half-applied — roles have
     * their own operations, and quietly reassigning them from a spreadsheet
     * column is the kind of change a person would want to be asked about
     * separately.
     */
    async importCollection(ctx, input) {
      if (input.path !== CONTACTS_COLLECTION_NAME) {
        throw notFoundError(
          "collection_not_found",
          `"${input.path}" is not a contacts collection.`
        );
      }
      const rows = parseCsv(input.content).map((row) => {
        const { roles: _roles, ...fields } = row;
        const clean: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          // An empty cell means "not given", not "set to empty string" — a CSV
          // round-trip must not blank every field the exporter left out.
          if (value !== "") {
            clean[key] = value;
          }
        }
        return clean;
      });
      return (await ctx.invokeOperation("contacts_bulk_import", {
        rows,
      })) as SpaceDataImportResult;
    },

    async list(ctx, path): Promise<SpaceDataListing> {
      if (!path) {
        return {
          entries: [
            {
              kind: "record",
              name: CONTACTS_COLLECTION_NAME,
              nodeType: CONTACTS_COLLECTION_NODE_TYPE,
              path: CONTACTS_COLLECTION_NAME,
              recordId: "collection",
              version: "",
            },
          ],
          folders: FOLDERS.map((folder) => ({
            name: folder.name,
            nodeType: CONTACTS_FOLDER_NODE_TYPE,
            path: folder.name,
          })),
        };
      }
      const folder = FOLDERS.find((entry) => entry.name === path);
      if (!folder) {
        throw notFoundError(
          "folder_not_found",
          `No contacts folder "${path}" — the tree has ${FOLDERS.map(
            (entry) => entry.name
          ).join(" and ")}.`
        );
      }
      const result = await listContacts(ctx, { type: folder.type });
      return {
        entries: result.data.map(entryOf),
        folders: [],
        // Its own row, so opening this folder directly — from a link, without
        // having listed the root first — still knows what kind of folder it is.
        self: {
          name: folder.name,
          nodeType: CONTACTS_FOLDER_NODE_TYPE,
          path: folder.name,
        },
        ...(result.total > result.data.length ? { truncated: true } : {}),
      };
    },

    async read(ctx, path): Promise<SpaceDataDocument> {
      if (path === CONTACTS_COLLECTION_NAME) {
        return readCollection(ctx);
      }
      const segments = path.split("/");
      const name = segments.at(-1) ?? "";
      const recordId = spaceDataNodeRecordId(name, CONTACT_NODE_EXTENSION);
      if (!recordId) {
        throw notFoundError(
          "contact_not_found",
          `"${path}" is not a contact file.`
        );
      }
      return documentOf(await getContact(ctx, recordId));
    },

    async write(ctx, input: SpaceDataWriteInput): Promise<SpaceDataDocument> {
      const segments = input.path.split("/");
      const name = segments.at(-1) ?? "";
      if (name === CONTACTS_COLLECTION_NAME) {
        // Saving the whole address book can mean hundreds of record writes, so
        // it is never a file save. Say which door to use rather than answering
        // "not a contact file", which is true and useless.
        throw new PluginOperationError(
          "collection_write",
          `${CONTACTS_COLLECTION_NAME} is the whole address book — saving it is a bulk import, not a file save. Use the import action so the change is reviewed with a count.`,
          { status: 400 }
        );
      }
      const recordId = spaceDataNodeRecordId(name, CONTACT_NODE_EXTENSION);
      if (!recordId) {
        throw notFoundError(
          "contact_not_found",
          `"${input.path}" is not a contact file.`
        );
      }
      if (input.member && input.member !== name) {
        throw notFoundError(
          "member_not_found",
          "A contact is a single file and has no members."
        );
      }
      if (input.encoding === "base64") {
        throw new PluginOperationError(
          "unsupported_encoding",
          "A contact file is text; send it as utf8.",
          { status: 400 }
        );
      }
      const current = await getContact(ctx, recordId);
      // Read-then-compare, before any write: the version the editor read has
      // to still be the record's, or somebody else's edit is about to vanish.
      assertSpaceDataVersion(current.updated_at, input.baseVersion, {
        recordId,
      });
      const { patch } = contactPatchFromFile({ current, text: input.content });
      const updated = (await ctx.invokeOperation("contacts_update", {
        id: recordId,
        patch,
      })) as ContactRecord | null;
      if (!updated) {
        throw dataConflictError(
          "The contact could not be updated — it may have been deleted since you opened it.",
          { recordId }
        );
      }
      return documentOf(updated);
    },
  };
}

/**
 * The whole address book as one CSV — a READ projection of `contacts_list`.
 *
 * Version is the empty string deliberately: a collection has no single
 * `updated_at`, and the write path for one is the bulk import, which reports
 * counts rather than pretending to be a file save.
 */
async function readCollection(
  ctx: SpaceDataContext
): Promise<SpaceDataDocument> {
  const rows: ContactRecord[] = [];
  let page = 1;
  // Bounded: ten pages is 2000 contacts, which is a CSV nobody opens in a
  // browser anyway. A truncated view that says so beats an unbounded scan.
  while (page <= 10) {
    const result = await listContacts(ctx, { page });
    rows.push(...result.data);
    if (rows.length >= result.total || result.data.length === 0) {
      break;
    }
    page += 1;
  }
  return {
    kind: "record",
    members: [
      {
        content: serializeCsv(
          CONTACT_CSV_COLUMNS,
          rows.map((contact) => ({
            ...(contact as unknown as Record<string, unknown>),
            roles: contact.roles ?? [],
          }))
        ),
        contentType: "text/csv",
        derived: true,
        editable: false,
        encoding: "utf8",
        name: CONTACTS_COLLECTION_NAME,
      },
    ],
    name: CONTACTS_COLLECTION_NAME,
    nodeType: CONTACTS_COLLECTION_NODE_TYPE,
    path: CONTACTS_COLLECTION_NAME,
    recordId: "collection",
    version: "",
  };
}
