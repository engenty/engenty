import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseNotReadyError } from "../db-readiness.js";
import { ensureMastraStorageReachable } from "../mastra-storage-preflight.js";

const ENV_KEYS = [
  "SUPABASE_DB_URL",
  "ENGENTY_WORKSPACE_VECTOR_DB_URL",
  "ENGENTY_AI_DB_READY_TIMEOUT_MS",
] as const;

const silentLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

describe("ensureMastraStorageReachable", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("resolves (and never probes) when no storage connection string is configured", async () => {
    const probe = vi.fn();
    await expect(
      ensureMastraStorageReachable({ probe })
    ).resolves.toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });

  it("probes the configured DB and resolves once it is ready", async () => {
    process.env.SUPABASE_DB_URL =
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    const probe = vi.fn().mockResolvedValue(undefined);
    await expect(
      ensureMastraStorageReachable({ logger: silentLogger, probe })
    ).resolves.toBeUndefined();
    expect(probe).toHaveBeenCalledWith(process.env.SUPABASE_DB_URL);
  });

  it("fails loud with a Supabase-start hint when the DB stays unreachable", async () => {
    process.env.SUPABASE_DB_URL =
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
    const probe = vi.fn().mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      })
    );
    let caught: unknown;
    try {
      await ensureMastraStorageReachable({
        intervalMs: 5,
        logger: silentLogger,
        probe,
        timeoutMs: 25,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DatabaseNotReadyError);
    expect((caught as DatabaseNotReadyError).message).toContain(
      "pnpm engenty db up"
    );
  });
});
