import { parseFrontmatter } from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import type { ContactRecord } from "../schema/zod.js";
import {
  contactPatchFromFile,
  createContactsSpaceDataAdapter,
  renderContactFile,
} from "./adapter.js";

function contact(overrides: Partial<ContactRecord> = {}): ContactRecord {
  return {
    address_city: "Wien",
    address_country: "AT",
    address_info: null,
    address_street: "Hauptstraße 1",
    address_zip: "1010",
    billing_email: null,
    contact_name: "",
    court_of_registration: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by: null,
    display_name: "Acme GmbH",
    display_name_override: null,
    email: "office@acme.at",
    first_name: null,
    id: "11111111-2222-3333-4444-555555555555",
    import_id: null,
    last_imported_at: null,
    last_name: null,
    legal_form: null,
    legal_name: "Acme Gesellschaft m.b.H.",
    logo_url: null,
    middle_name: null,
    name_prefix: null,
    name_suffix: null,
    notes: "Long-standing client.",
    phone: "+43 1 234",
    phonetic_name: null,
    birth_name: null,
    reference_id: null,
    registration_number: null,
    roles: ["client"],
    tax_id: null,
    type: "organisation",
    updated_at: "2026-08-14T10:00:00Z",
    vat_id: null,
    website_contact: null,
    website_impress: null,
    ...overrides,
  } as ContactRecord;
}

function ctx(invoke: (op: string, input?: unknown) => Promise<unknown>) {
  return {
    invokeOperation: vi.fn(invoke),
    recordScope: "all" as const,
    spaceId: "space-1",
    tenantId: "tenant-1",
  };
}

describe("the file a contact renders as", () => {
  it("leads with the id, because identity is the record id and never the path", () => {
    const parsed = parseFrontmatter(renderContactFile(contact()));
    expect(parsed.frontmatter.id).toBe("11111111-2222-3333-4444-555555555555");
    expect(parsed.frontmatter.display_name).toBe("Acme GmbH");
    expect(parsed.body).toBe("Long-standing client.");
  });

  it("omits empty fields rather than writing a wall of nulls", () => {
    const text = renderContactFile(contact());
    expect(text).not.toContain("tax_id");
    expect(text).not.toContain("logo_url");
  });
});

describe("an edited file becomes an update patch", () => {
  it("maps frontmatter to fields and the body to notes", () => {
    const current = contact();
    const edited = renderContactFile(current).replace(
      "phone: +43 1 234",
      "phone: +43 1 999"
    );
    const { patch } = contactPatchFromFile({
      current,
      text: `${edited}\nNew note.`,
    });
    expect(patch.phone).toBe("+43 1 999");
    expect(String(patch.notes)).toContain("New note.");
  });

  it("REFUSES a changed read-only field instead of silently dropping it", () => {
    const current = contact();
    const edited = renderContactFile(current).replace(
      current.id,
      "99999999-9999-9999-9999-999999999999"
    );
    expect(() => contactPatchFromFile({ current, text: edited })).toThrow(
      /set by the system/
    );
  });

  it("points a roles edit at the role actions rather than accepting it", () => {
    const current = contact();
    const edited = renderContactFile(current).replace(
      "  - client",
      "  - client\n  - supplier"
    );
    expect(() => contactPatchFromFile({ current, text: edited })).toThrow(
      /role actions/
    );
  });

  it("rejects a file that does not match the contact schema", () => {
    const current = contact();
    const edited = renderContactFile(current).replace(
      "vat_id: null",
      "vat_id: NOPE"
    );
    // vat_id is absent when null, so add one that is invalid.
    const withBadVat = edited.includes("vat_id")
      ? edited
      : edited.replace("---\n\n", "vat_id: NOPE\n---\n\n");
    expect(() => contactPatchFromFile({ current, text: withBadVat })).toThrow(
      /does not match the contact schema/
    );
  });
});

describe("the adapter", () => {
  const adapter = createContactsSpaceDataAdapter();

  it("is tenant-wide only — a space-scoped mount has no honest answer", () => {
    expect(adapter.recordScopes).toEqual(["all"]);
  });

  it("offers the two type folders and the collection view at its root", async () => {
    const listing = await adapter.list(
      ctx(() => Promise.resolve(null)),
      ""
    );
    expect(listing.folders.map((folder) => folder.name)).toEqual([
      "People",
      "Organisations",
    ]);
    expect(listing.entries[0]?.name).toBe("contacts.csv");
  });

  it("types its folders and its root, so a module view can claim them", () => {
    // Without a type the pane can only ever list a folder generically — the
    // type IS the key the `spaces.data.folder:<type>` surface is looked up by.
    expect(adapter.rootNodeType).toBe("contacts.root");
  });

  it("declares the folder's type on the row AND on the folder itself", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({ data: [], page: 1, pageSize: 50, total: 0 })
    );
    const root = await adapter.list(ctx(invoke), "");
    expect(
      root.folders.every((folder) => folder.nodeType === "contacts.folder")
    ).toBe(true);
    // `self` is what makes a folder openable by LINK: without it, the type is
    // only knowable to someone who listed the parent first.
    const folder = await adapter.list(ctx(invoke), "People");
    expect(folder.self).toEqual({
      name: "People",
      nodeType: "contacts.folder",
      path: "People",
    });
  });

  it("lists a folder through contacts_list, filtered by the folder's type", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({
        data: [contact()],
        page: 1,
        pageSize: 200,
        total: 1,
      })
    );
    const listing = await adapter.list(
      {
        invokeOperation: invoke,
        recordScope: "all",
        spaceId: "s",
        tenantId: "t",
      },
      "Organisations"
    );
    expect(invoke).toHaveBeenCalledWith(
      "contacts_list",
      expect.objectContaining({ type: "organisation" })
    );
    expect(listing.entries[0]?.path).toContain("Organisations/acme-gmbh__");
    expect(listing.entries[0]?.title).toBe("Acme GmbH");
  });

  it("reads one contact through contacts_get, resolved from the path's id", async () => {
    const invoke = vi.fn(() => Promise.resolve(contact()));
    const document = await adapter.read(
      {
        invokeOperation: invoke,
        recordScope: "all",
        spaceId: "s",
        tenantId: "t",
      },
      "Organisations/acme-gmbh__11111111-2222-3333-4444-555555555555.contact.md"
    );
    expect(invoke).toHaveBeenCalledWith("contacts_get", {
      id: "11111111-2222-3333-4444-555555555555",
    });
    expect(document.version).toBe("2026-08-14T10:00:00Z");
    expect(document.members).toHaveLength(1);
  });

  it("refuses a path that names no record rather than searching for one like it", async () => {
    await expect(
      adapter.read(
        ctx(() => Promise.resolve(null)),
        "Organisations/acme.contact.md"
      )
    ).rejects.toThrow(/not a contact file/);
  });
});

describe("write-through", () => {
  const adapter = createContactsSpaceDataAdapter();
  const path =
    "Organisations/acme-gmbh__11111111-2222-3333-4444-555555555555.contact.md";

  it("refuses a stale write with 409 instead of last-write-wins", async () => {
    const invoke = vi.fn(() => Promise.resolve(contact()));
    await expect(
      adapter.write?.(
        {
          invokeOperation: invoke,
          recordScope: "all",
          spaceId: "s",
          tenantId: "t",
        },
        {
          baseVersion: "2026-08-14T09:00:00Z",
          content: renderContactFile(contact()),
          path,
        }
      )
    ).rejects.toMatchObject({ code: "data_conflict", status: 409 });
    // Read, compared, refused — and crucially NO update was attempted.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("contacts_get", expect.anything());
  });

  it("routes an accepted write to contacts_update — the same op, the same gate", async () => {
    const updated = contact({
      phone: "+43 1 999",
      updated_at: "2026-08-14T11:00:00Z",
    });
    const invoke = vi.fn((operationId: string) =>
      Promise.resolve(operationId === "contacts_update" ? updated : contact())
    );
    const result = await adapter.write?.(
      {
        invokeOperation: invoke,
        recordScope: "all",
        spaceId: "s",
        tenantId: "t",
      },
      {
        baseVersion: "2026-08-14T10:00:00Z",
        content: renderContactFile(contact()).replace(
          "phone: +43 1 234",
          "phone: +43 1 999"
        ),
        path,
      }
    );
    expect(invoke).toHaveBeenCalledWith(
      "contacts_update",
      expect.objectContaining({
        id: "11111111-2222-3333-4444-555555555555",
        patch: expect.objectContaining({ phone: "+43 1 999" }),
      })
    );
    expect(result?.version).toBe("2026-08-14T11:00:00Z");
  });
});

describe("the collection view is a bulk operation, never a file save (D5)", () => {
  const adapter = createContactsSpaceDataAdapter();

  it("routes a CSV save to ONE gated import, not one write per row", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({ created: 2, failed: [], updated: 1 })
    );
    const result = await adapter.importCollection?.(
      {
        invokeOperation: invoke,
        recordScope: "all",
        spaceId: "s",
        tenantId: "t",
      },
      {
        content:
          "id,type,display_name,email\n,organisation,New GmbH,new@x.at\n,person,Anna,anna@x.at\n11111111-2222-3333-4444-555555555555,organisation,Acme GmbH,office@acme.at\n",
        path: "contacts.csv",
      }
    );
    // One card, one count, one audit row — routing each row through
    // contacts_create would raise one approval per row.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      "contacts_bulk_import",
      expect.objectContaining({ rows: expect.any(Array) })
    );
    expect(result).toEqual({ created: 2, failed: [], updated: 1 });
  });

  it("drops empty cells so a round trip does not blank fields", async () => {
    let rows: Record<string, unknown>[] = [];
    const invoke = vi.fn((_op: string, input?: unknown) => {
      rows = (input as { rows: Record<string, unknown>[] }).rows;
      return Promise.resolve({ created: 0, failed: [], updated: 1 });
    });
    await adapter.importCollection?.(
      {
        invokeOperation: invoke,
        recordScope: "all",
        spaceId: "s",
        tenantId: "t",
      },
      {
        content: "id,display_name,phone\n42,Acme,\n",
        path: "contacts.csv",
      }
    );
    expect(rows[0]).toEqual({ display_name: "Acme", id: "42" });
    expect(rows[0]).not.toHaveProperty("phone");
  });

  it("drops the roles column rather than half-applying it", async () => {
    let rows: Record<string, unknown>[] = [];
    const invoke = vi.fn((_op: string, input?: unknown) => {
      rows = (input as { rows: Record<string, unknown>[] }).rows;
      return Promise.resolve({ created: 0, failed: [], updated: 1 });
    });
    await adapter.importCollection?.(
      {
        invokeOperation: invoke,
        recordScope: "all",
        spaceId: "s",
        tenantId: "t",
      },
      { content: "id,roles\n42,client; supplier\n", path: "contacts.csv" }
    );
    // Roles have their own operations; reassigning them from a spreadsheet
    // column is a change a person would want to be asked about separately.
    expect(rows[0]).not.toHaveProperty("roles");
  });

  it("names the right door when someone tries to SAVE the collection", async () => {
    // "not a contact file" would be true and useless; the writer needs to know
    // that this one is a bulk import with a count.
    await expect(
      adapter.write?.(
        ctx(() => Promise.resolve(null)),
        { baseVersion: "v", content: "id\n1\n", path: "contacts.csv" }
      )
    ).rejects.toMatchObject({ code: "collection_write", status: 400 });
  });

  it("refuses a path that is not the collection", async () => {
    await expect(
      adapter.importCollection?.(
        ctx(() => Promise.resolve(null)),
        { content: "", path: "People/x.csv" }
      )
    ).rejects.toThrow(/not a contacts collection/);
  });
});
