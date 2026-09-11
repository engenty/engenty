import { describe, expect, it, vi } from "vitest";
import {
  resolveCreateSpaceId,
  type SpaceIdLookupClient,
} from "./resolve-create-space-id.js";

const DEFAULT_SPACE = "00000000-0000-4000-8000-00000000dead";
const TENANT = "00000000-0000-4000-8000-0000000000t1";

/**
 * Minimal stand-in for the PostgREST builder chain this helper walks.
 *
 * `seen` records `schema.table:id` per lookup; the tenant filter is recorded
 * separately in `tenantFilters` so the scoping assertion is explicit rather
 * than smuggled into a key string.
 */
function client(rows: Record<string, { space_id?: string | null }>) {
  const seen: string[] = [];
  const tenantFilters: (string | null)[] = [];
  const impl: SpaceIdLookupClient = {
    schema: (schema) => ({
      from: (table) => ({
        select: () => {
          let key = `${schema}.${table}`;
          let tenant: string | null = null;
          const filter = {
            eq(column: string, value: string) {
              if (column === "tenant_id") {
                tenant = value;
              } else {
                key = `${key}:${value}`;
              }
              return filter;
            },
            maybeSingle() {
              seen.push(key);
              tenantFilters.push(tenant);
              return Promise.resolve({
                data: rows[key] ?? null,
                error: null,
              });
            },
          };
          return filter;
        },
      }),
    }),
  };
  return { impl, seen, tenantFilters };
}

describe("resolveCreateSpaceId", () => {
  it("uses an explicit space and reads nothing", async () => {
    const { impl, seen } = client({});
    const resolveDefault = vi.fn();
    expect(
      await resolveCreateSpaceId({
        client: impl,
        tenantId: TENANT,
        explicit: "explicit-space",
        inheritFrom: [["module_tasks", "tasks", "task-1"]],
        resolveDefault,
      })
    ).toBe("explicit-space");
    expect(seen).toEqual([]);
    expect(resolveDefault).not.toHaveBeenCalled();
  });

  it("inherits the parent task's space rather than the tenant default", async () => {
    // The case that matters: a subtask must land in its parent's space, or the
    // containment chain spans two spaces and the storage prefix disagrees with
    // the parent's.
    const { impl } = client({
      "module_tasks.tasks:task-1": { space_id: "space-of-parent" },
    });
    const resolveDefault = vi.fn(async () => DEFAULT_SPACE);
    expect(
      await resolveCreateSpaceId({
        client: impl,
        tenantId: TENANT,
        inheritFrom: [["module_tasks", "tasks", "task-1"]],
        resolveDefault,
      })
    ).toBe("space-of-parent");
    expect(resolveDefault).not.toHaveBeenCalled();
  });

  it("inherits across the schema boundary, from a project", async () => {
    // createProjectLinkedTask passes `project_id` and nothing else, so this is
    // the only thing standing between a project in a non-default space and
    // every one of its tasks landing in Company.
    const { impl } = client({
      "module_projects.projects:project-4": { space_id: "space-of-project" },
    });
    const resolveDefault = vi.fn(async () => DEFAULT_SPACE);
    expect(
      await resolveCreateSpaceId({
        client: impl,
        tenantId: TENANT,
        inheritFrom: [
          ["module_tasks", "tasks", null],
          ["module_projects", "projects", "project-4"],
        ],
        resolveDefault,
      })
    ).toBe("space-of-project");
    expect(resolveDefault).not.toHaveBeenCalled();
  });

  it("scopes every lookup by tenant", async () => {
    // Module DAL runs service-role, so RLS is not the backstop here. An
    // unscoped read would let a guessed id pull another tenant's space id into
    // a brand-new row — and the projects lookup crosses a schema boundary,
    // where that habit is easiest to lose.
    const { impl, tenantFilters } = client({
      "module_projects.projects:project-4": { space_id: "space-of-project" },
    });
    await resolveCreateSpaceId({
      client: impl,
      tenantId: TENANT,
      inheritFrom: [
        ["module_tasks", "tasks", "task-1"],
        ["module_projects", "projects", "project-4"],
      ],
      resolveDefault: async () => DEFAULT_SPACE,
    });
    expect(tenantFilters).toEqual([TENANT, TENANT]);
  });

  it("walks the inherit list in order and stops at the first hit", async () => {
    const { impl, seen } = client({
      "module_projects.projects:project-4": { space_id: null },
      "module_tasks.tasks:task-9": { space_id: "space-of-parent-task" },
    });
    expect(
      await resolveCreateSpaceId({
        client: impl,
        tenantId: TENANT,
        inheritFrom: [
          ["module_projects", "projects", "project-4"],
          ["module_tasks", "tasks", "task-9"],
        ],
        resolveDefault: async () => DEFAULT_SPACE,
      })
    ).toBe("space-of-parent-task");
    expect(seen).toEqual([
      "module_projects.projects:project-4",
      "module_tasks.tasks:task-9",
    ]);
  });

  it("skips absent parents without querying for them", async () => {
    const { impl, seen } = client({});
    await resolveCreateSpaceId({
      client: impl,
      tenantId: TENANT,
      inheritFrom: [
        ["module_projects", "projects", null],
        ["module_tasks", "tasks", undefined],
      ],
      resolveDefault: async () => DEFAULT_SPACE,
    });
    expect(seen).toEqual([]);
  });

  it("falls back to the tenant default when nothing is inheritable", async () => {
    const { impl } = client({});
    expect(
      await resolveCreateSpaceId({
        client: impl,
        tenantId: TENANT,
        resolveDefault: async () => DEFAULT_SPACE,
      })
    ).toBe(DEFAULT_SPACE);
  });

  it("falls back rather than failing when a parent cannot be read", async () => {
    // Also the projects-module-not-installed case: `module_projects` simply is
    // not there, the read errors, and the next container answers instead.
    const impl: SpaceIdLookupClient = {
      schema: () => ({
        from: () => ({
          select: () => {
            const filter = {
              eq: () => filter,
              maybeSingle: () =>
                Promise.resolve({ data: null, error: { message: "denied" } }),
            };
            return filter;
          },
        }),
      }),
    };
    expect(
      await resolveCreateSpaceId({
        client: impl,
        tenantId: TENANT,
        inheritFrom: [["module_projects", "projects", "project-4"]],
        resolveDefault: async () => DEFAULT_SPACE,
      })
    ).toBe(DEFAULT_SPACE);
  });

  it("treats a blank explicit value as absent", async () => {
    const { impl } = client({});
    expect(
      await resolveCreateSpaceId({
        client: impl,
        tenantId: TENANT,
        explicit: "   ",
        resolveDefault: async () => DEFAULT_SPACE,
      })
    ).toBe(DEFAULT_SPACE);
  });
});
