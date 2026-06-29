import { describe, expect, it, vi } from "vitest";

import {
  DatabaseNotReadyError,
  resolveDbReadyTimeoutMs,
  waitForDatabaseReady,
} from "../db-readiness.js";

const CONN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Deterministic virtual clock: `sleep` advances `now`, so timeout-bounded loops
// terminate without real timers and without flakiness.
function virtualClock() {
  let current = 0;
  return {
    now: () => current,
    sleep: (ms: number) => {
      current += ms;
      return Promise.resolve();
    },
  };
}

const silentLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

describe("waitForDatabaseReady", () => {
  it("resolves on the first successful probe", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    await expect(
      waitForDatabaseReady({
        connectionString: CONN,
        logger: silentLogger,
        probe,
        ...virtualClock(),
      })
    ).resolves.toBeUndefined();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("retries on transient failures, then resolves once the DB answers", async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        })
      )
      .mockRejectedValueOnce(new Error("the database system is starting up"))
      .mockResolvedValue(undefined);
    await expect(
      waitForDatabaseReady({
        connectionString: CONN,
        intervalMs: 10,
        logger: silentLogger,
        probe,
        timeoutMs: 5000,
        ...virtualClock(),
      })
    ).resolves.toBeUndefined();
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("rejects with DatabaseNotReadyError after the timeout elapses", async () => {
    const probe = vi.fn().mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      })
    );
    let caught: unknown;
    try {
      await waitForDatabaseReady({
        connectionString: CONN,
        hint: "start the DB",
        intervalMs: 10,
        logger: silentLogger,
        probe,
        timeoutMs: 50,
        ...virtualClock(),
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DatabaseNotReadyError);
    const error = caught as DatabaseNotReadyError;
    expect(error.timeoutMs).toBe(50);
    expect(error.attempts).toBeGreaterThan(1);
    expect(error.target).toBe("127.0.0.1:54322/postgres");
    expect(error.message).toContain("start the DB");
    // Preserves the underlying probe failure as the cause (fail loud, no mask).
    expect((error.cause as { code?: string })?.code).toBe("ECONNREFUSED");
  });
});

describe("resolveDbReadyTimeoutMs", () => {
  it("defaults to 60s when the env var is unset", () => {
    expect(resolveDbReadyTimeoutMs({})).toBe(60_000);
  });

  it("honors a valid env override", () => {
    expect(
      resolveDbReadyTimeoutMs({ ENGENTY_AI_DB_READY_TIMEOUT_MS: "120000" })
    ).toBe(120_000);
  });

  it("falls back to the default for a non-numeric or non-positive value", () => {
    expect(
      resolveDbReadyTimeoutMs({ ENGENTY_AI_DB_READY_TIMEOUT_MS: "nope" })
    ).toBe(60_000);
    expect(
      resolveDbReadyTimeoutMs({ ENGENTY_AI_DB_READY_TIMEOUT_MS: "0" })
    ).toBe(60_000);
  });
});
