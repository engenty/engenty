import { describe, expect, it } from "vitest";
import { createProjectRepoSupabase } from "./supabase.js";

/**
 * Minimal fake of the Supabase query surface the projects DAL uses. Enough to
 * exercise the Phase 2 list visibility filter and the members-only × portal
 * guard without a real database.
 */
type Row = Record<string, unknown>;

function makeFakeSupabase(seed: { projects: Row[]; project_team: Row[] }) {
  const tables: Record<string, Row[]> = {
    projects: [...seed.projects],
    project_team: [...seed.project_team],
  };

  function from(table: string) {
    const rows = tables[table] ?? [];
    const filters: Array<(r: Row) => boolean> = [];
    const builder: Record<string, unknown> = {
      select() {
        return builder;
      },
      insert(row: Row | Row[]) {
        const list = Array.isArray(row) ? row : [row];
        tables[table] = [...(tables[table] ?? []), ...list];
        return builder;
      },
      update() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((r) => String(r[column]) === String(value));
        return builder;
      },
      ilike() {
        return builder;
      },
      or(expr: string) {
        // Supports "visibility.eq.tenant,id.in.("a","b")"
        const parts = expr.split(/,(?![^(]*\))/);
        const preds: Array<(r: Row) => boolean> = [];
        for (const part of parts) {
          if (part.startsWith("visibility.eq.")) {
            const v = part.slice("visibility.eq.".length);
            preds.push((r) => r.visibility === v);
          } else if (part.startsWith("id.in.(")) {
            const inner = part.slice("id.in.(".length, -1);
            const ids = inner
              .split(",")
              .map((s) => s.replace(/^"|"$/g, ""))
              .filter(Boolean);
            preds.push((r) => ids.includes(String(r.id)));
          }
        }
        filters.push((r) => preds.some((p) => p(r)));
        return builder;
      },
      order() {
        return builder;
      },
      range() {
        const result = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({
          data: result,
          error: null,
          count: result.length,
        });
      },
      single() {
        const result = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: result[0] ?? null, error: null });
      },
      // Thenable: `await from().select().eq(...)` resolves to the filtered set
      // (used by the team-membership lookup, which has no terminal method).
      // biome-ignore lint/suspicious/noThenProperty: mock of a thenable Supabase query builder
      then(resolve: (v: unknown) => unknown) {
        const result = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({
          data: result,
          error: null,
          count: result.length,
        }).then(resolve);
      },
    };
    return builder;
  }

  return { schema: () => ({ from }) };
}

const deps = { invokeTasks: () => Promise.resolve(null) as never };

describe("project visibility DAL filter", () => {
  const projects = [
    {
      id: "p-tenant",
      tenant_id: "t1",
      scope_id: "s1",
      title: "T",
      visibility: "tenant",
      portal_enabled: false,
    },
    {
      id: "p-members",
      tenant_id: "t1",
      scope_id: "s1",
      title: "M",
      visibility: "members",
      portal_enabled: false,
    },
  ];

  it("hides members-only projects from a non-member", async () => {
    const supabase = makeFakeSupabase({ projects, project_team: [] });
    const repo = createProjectRepoSupabase(supabase, "t1", "s1", {
      ...deps,
      viewer: { userId: "u-outsider", seesAllProjects: false },
    });
    const list = await repo.listPaginated({});
    expect(list.data.map((p) => p.id)).toEqual(["p-tenant"]);
  });

  it("shows members-only projects to a team member", async () => {
    const supabase = makeFakeSupabase({
      projects,
      project_team: [
        {
          project_id: "p-members",
          scope_id: "s1",
          tenant_id: "t1",
          user_id: "u-member",
        },
      ],
    });
    const repo = createProjectRepoSupabase(supabase, "t1", "s1", {
      ...deps,
      viewer: { userId: "u-member", seesAllProjects: false },
    });
    const list = await repo.listPaginated({});
    expect(list.data.map((p) => p.id).sort()).toEqual([
      "p-members",
      "p-tenant",
    ]);
  });

  it("ignores a membership row from another tenant", async () => {
    // user ids are global, so the same person can sit on a project in another
    // tenant. Before project_team carried tenant_id/scope_id this read had no
    // boundary at all and that foreign membership widened visibility here.
    const supabase = makeFakeSupabase({
      projects,
      project_team: [
        {
          project_id: "p-members",
          scope_id: "s1",
          tenant_id: "other-tenant",
          user_id: "u-member",
        },
      ],
    });
    const repo = createProjectRepoSupabase(supabase, "t1", "s1", {
      ...deps,
      viewer: { userId: "u-member", seesAllProjects: false },
    });
    const list = await repo.listPaginated({});
    expect(list.data.map((p) => p.id)).toEqual(["p-tenant"]);
  });

  it("ignores a membership row from another scope", async () => {
    const supabase = makeFakeSupabase({
      projects,
      project_team: [
        {
          project_id: "p-members",
          scope_id: "other-scope",
          tenant_id: "t1",
          user_id: "u-member",
        },
      ],
    });
    const repo = createProjectRepoSupabase(supabase, "t1", "s1", {
      ...deps,
      viewer: { userId: "u-member", seesAllProjects: false },
    });
    const list = await repo.listPaginated({});
    expect(list.data.map((p) => p.id)).toEqual(["p-tenant"]);
  });

  it("shows everything to a caller who sees all projects", async () => {
    const supabase = makeFakeSupabase({ projects, project_team: [] });
    const repo = createProjectRepoSupabase(supabase, "t1", "s1", {
      ...deps,
      viewer: { userId: "admin", seesAllProjects: true },
    });
    const list = await repo.listPaginated({});
    expect(list.data).toHaveLength(2);
  });
});

describe("members-only × portal guard", () => {
  it("rejects creating a members-only project with the portal enabled", async () => {
    const supabase = makeFakeSupabase({ projects: [], project_team: [] });
    const repo = createProjectRepoSupabase(supabase, "t1", "s1", deps);
    await expect(
      repo.create({
        title: "X",
        visibility: "members",
        portal_enabled: true,
      } as never)
    ).rejects.toThrow(/cannot enable the client portal/);
  });

  it("allows a members-only project without the portal", async () => {
    const supabase = makeFakeSupabase({ projects: [], project_team: [] });
    const repo = createProjectRepoSupabase(supabase, "t1", "s1", deps);
    const created = await repo.create({
      title: "X",
      visibility: "members",
      portal_enabled: false,
    } as never);
    expect(created.visibility).toBe("members");
  });
});
