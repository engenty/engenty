import { describe, expect, it, vi } from "vitest";
import {
  ensureMastraSchemaApplied,
  MastraSchemaMissingError,
} from "../mastra-schema-readiness.js";

const CONN = "postgresql://user:pw@localhost:5432/db";

describe("ensureMastraSchemaApplied", () => {
  it("passes when nothing is missing", async () => {
    await expect(
      ensureMastraSchemaApplied({
        connectionString: CONN,
        probe: async () => [],
      })
    ).resolves.toBeUndefined();
  });

  it("names the missing tables and the command that applies them", async () => {
    const error = await ensureMastraSchemaApplied({
      connectionString: CONN,
      probe: async () => ["mastra_threads"],
    }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(MastraSchemaMissingError);
    expect((error as MastraSchemaMissingError).missing).toEqual([
      "mastra_threads",
    ]);
    expect((error as Error).message).toContain("mastra_threads");
    expect((error as Error).message).toContain("engenty db mastra-init");
  });

  // Reachability is the previous gate's job. Reporting a connection blip as an
  // un-run migration sends someone to fix the wrong thing.
  it("propagates a probe failure instead of reporting it as missing", async () => {
    const boom = new Error("connection refused");
    await expect(
      ensureMastraSchemaApplied({
        connectionString: CONN,
        probe: () => Promise.reject(boom),
      })
    ).rejects.toBe(boom);
  });

  it("uses the injected probe rather than opening a connection", async () => {
    const probe = vi.fn(async () => []);
    await ensureMastraSchemaApplied({ connectionString: CONN, probe });
    expect(probe).toHaveBeenCalledWith(CONN);
  });
});
