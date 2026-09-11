import { afterEach, describe, expect, it, vi } from "vitest";

// The runtime store must never issue DDL: Mastra's idempotent CREATE/ALTER
// statements fire `ddl_command_end`, which trips Supabase's `pgrst_ddl_watch`
// and 502s in-flight requests through Kong. See mastra-storage.ts.
const constructed: Record<string, unknown>[] = [];
vi.mock("@mastra/pg", () => ({
  PostgresStore: class {
    constructor(config: Record<string, unknown>) {
      constructed.push(config);
    }
  },
}));

const { createEngentyMastraStorage } = await import("../mastra-storage.js");

afterEach(() => {
  constructed.length = 0;
  process.env.SUPABASE_DB_URL = undefined;
});

describe("createEngentyMastraStorage", () => {
  it("disables init by default", () => {
    process.env.SUPABASE_DB_URL = "postgresql://u:p@localhost:5432/db";
    createEngentyMastraStorage();
    expect(constructed).toHaveLength(1);
    expect(constructed[0]?.disableInit).toBe(true);
    expect(constructed[0]?.schemaName).toBe("ai");
  });

  it("lifts init only for the explicit migration entry point", () => {
    process.env.SUPABASE_DB_URL = "postgresql://u:p@localhost:5432/db";
    createEngentyMastraStorage({ allowInit: true });
    expect(constructed[0]?.disableInit).toBe(false);
  });

  it("returns undefined with no connection configured", () => {
    process.env.SUPABASE_DB_URL = "";
    process.env.ENGENTY_WORKSPACE_VECTOR_DB_URL = "";
    expect(createEngentyMastraStorage()).toBeUndefined();
    expect(constructed).toHaveLength(0);
  });
});
