import { describe, expect, it } from "vitest";
import { foreignSelect } from "./foreign-schema.js";

/** Records every call so a test can assert the emitted PostgREST query. */
function createClientSpy() {
  const calls: { eq: [string, string][]; select: string[] } = {
    eq: [],
    select: [],
  };
  const builder = {
    eq(column: string, value: string) {
      calls.eq.push([column, value]);
      return builder;
    },
  };
  const client = {
    schema(name: string) {
      return {
        from(table: string) {
          return {
            select(columns: string) {
              calls.select.push(`${name}.${table}:${columns}`);
              return builder;
            },
          };
        },
      };
    },
  };
  return { builder, calls, client };
}

const SCOPE = { scopeId: "global", tenantId: "tenant-1" };
const PROJECTS = {
  columns: "id, title",
  schema: "module_projects",
  table: "projects",
};

describe("foreignSelect", () => {
  it("applies both tenant filters to the foreign table", () => {
    const { calls, client } = createClientSpy();

    foreignSelect(client, SCOPE, PROJECTS);

    expect(calls.select).toEqual(["module_projects.projects:id, title"]);
    expect(calls.eq).toEqual([
      ["tenant_id", "tenant-1"],
      ["scope_id", "global"],
    ]);
  });

  it("returns the filter builder so callers can chain further predicates", () => {
    const { builder, calls, client } = createClientSpy();

    const query = foreignSelect(client, SCOPE, PROJECTS).eq("id", "p-1");

    expect(query).toBe(builder);
    expect(calls.eq.at(-1)).toEqual(["id", "p-1"]);
  });

  it.each([
    ["tenantId", { scopeId: "global", tenantId: "" }],
    ["scopeId", { scopeId: "", tenantId: "tenant-1" }],
  ])("refuses to build a query with an empty %s", (field, scope) => {
    const { calls, client } = createClientSpy();

    expect(() => foreignSelect(client, scope, PROJECTS)).toThrow(field);
    // Nothing was emitted — an unscoped query never reaches the database.
    expect(calls.select).toEqual([]);
  });
});
