import { describe, expect, it } from "vitest";
import { createPortalDAL } from "./portal-supabase.js";

const PROJECT_ROW = {
  id: "project-1",
  title: "Portal Project",
  portal_intro_text: null,
  client_id: "contact-1",
  client_name: "Fallback Client GmbH",
  portal_password: null,
  tenant_id: "tenant-1",
  scope_id: "scope-1",
};

/**
 * Records every `.schema().from().select().eq()` a call emits, so a test can
 * assert the tenant boundary rather than the returned rows.
 *
 * `getPublicProjectInfo` resolves a client name out of `module_contacts`, a
 * schema this module does not own. Since Phase A that read runs on a
 * tenant-locked handle (RLS-enforced) AND carries explicit filters; the portal
 * visitor is anonymous, so both are asserted here — the filters, and that the
 * handle was resolved for the project's own tenant rather than the service
 * lane.
 */
function makeRecordingSupabase(rows: Record<string, unknown> = {}) {
  const queries: {
    eq: [string, string][];
    schema: string;
    table: string;
  }[] = [];

  const client = {
    schema: (schema: string) => ({
      from: (table: string) => {
        const entry = { eq: [] as [string, string][], schema, table };
        const row = rows[`${schema}.${table}`] ?? null;
        const builder: Record<string, unknown> = {
          eq: (column: string, value: string) => {
            entry.eq.push([column, value]);
            return builder;
          },
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
          single: () => Promise.resolve({ data: row, error: null }),
        };
        return {
          select: () => {
            queries.push(entry);
            return builder;
          },
        };
      },
    }),
  };

  /** Filters applied to the read of `schema.table`, or null if never read. */
  const filtersFor = (schema: string, table: string) =>
    queries.find((q) => q.schema === schema && q.table === table)?.eq ?? null;

  return { client, filtersFor, queries };
}

function makeDAL(rows: Record<string, unknown>) {
  const recording = makeRecordingSupabase(rows);
  // Every tenantId a tenant-locked handle was requested for. The service
  // client and the tenant handle share one recording fake so the `eq` filters
  // above stay observable either way — this list is what distinguishes them.
  const tenantHandles: string[] = [];
  const dal = createPortalDAL(recording.client, {
    getDb: ({ tenantId }: { tenantId: string }) => {
      tenantHandles.push(tenantId);
      return recording.client as never;
    },
    invokeOperation: () => Promise.resolve(null),
  });
  return { ...recording, dal, tenantHandles };
}

describe("portal client lookup is tenant-scoped", () => {
  it("scopes the module_contacts read to the project's own tenant", async () => {
    const { dal, filtersFor, tenantHandles } = makeDAL({
      "module_projects.projects": PROJECT_ROW,
      "module_contacts.contacts": { display_name: "Contacts GmbH" },
    });

    const info = await dal.getPublicProjectInfo("project-1");

    expect(info?.entity).toEqual({ display_name: "Contacts GmbH" });
    // Resolved a handle for the project's own tenant — not the service lane.
    expect(tenantHandles).toEqual(["tenant-1"]);
    const filters = filtersFor("module_contacts", "contacts");
    expect(filters).toEqual(
      expect.arrayContaining([
        ["tenant_id", "tenant-1"],
        ["scope_id", "scope-1"],
        ["id", "contact-1"],
      ])
    );
  });

  it("falls back to client_name when the contact is outside the tenant", async () => {
    // A scoped read that matches nothing is what a foreign client_id looks
    // like from here — the portal must not leak, and must still render.
    const { dal } = makeDAL({ "module_projects.projects": PROJECT_ROW });

    const info = await dal.getPublicProjectInfo("project-1");

    expect(info?.entity).toEqual({ display_name: "Fallback Client GmbH" });
  });

  it("does not read contacts at all for a project with no client", async () => {
    const { dal, queries } = makeDAL({
      "module_projects.projects": { ...PROJECT_ROW, client_id: null },
    });

    await dal.getPublicProjectInfo("project-1");

    expect(queries.some((q) => q.schema === "module_contacts")).toBe(false);
  });
});
