import type { ConnectionSummary } from "@engenty/connections-sdk";
import { describe, expect, it, vi } from "vitest";
import { LOCAL_FILES_ERROR } from "../protocol.js";
import type { BridgeRequestRow, LocalFilesRepo } from "../repo.js";
import { runBridgeAction } from "./server.js";

const connection = {
  external_account: "Docs — Chrome",
  id: "conn-1",
  tenant_id: "tenant-1",
} as unknown as ConnectionSummary;

function baseRepo(overrides: Partial<LocalFilesRepo> = {}): LocalFilesRepo {
  return {
    getDirectoryByConnection: vi.fn(async () => ({
      connection_id: "conn-1",
      directory_name: "Docs",
      installation_id: "inst-1",
      tenant_id: "tenant-1",
    })),
    getInstallation: vi.fn(async () => ({
      device_label: "Chrome",
      installation_id: "inst-1",
      last_seen_at: new Date().toISOString(),
      tenant_id: "tenant-1",
      user_id: "user-1",
    })),
    insertRequest: vi.fn(async () => ({ id: "req-1", status: "pending" }) as BridgeRequestRow),
    getRequest: vi.fn(),
    expireRequest: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as LocalFilesRepo;
}

const fast = { pollIntervalMs: 2, timeoutMs: 40 };

describe("runBridgeAction", () => {
  it("fails fast when the browser installation is offline", async () => {
    const repo = baseRepo({
      getInstallation: vi.fn(async () => ({
        device_label: null,
        installation_id: "inst-1",
        last_seen_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        tenant_id: "tenant-1",
        user_id: "user-1",
      })),
    });
    await expect(
      runBridgeAction({ action: "list", connection, input: {}, repo, ...fast })
    ).rejects.toThrow(LOCAL_FILES_ERROR.browserOffline);
    expect(repo.insertRequest).not.toHaveBeenCalled();
  });

  it("returns the browser response on completion", async () => {
    const repo = baseRepo({
      getRequest: vi.fn(async () => ({
        id: "req-1",
        response: { entries: [], truncated: false },
        status: "completed",
      }) as unknown as BridgeRequestRow),
    });
    const out = await runBridgeAction({
      action: "list",
      connection,
      input: {},
      repo,
      ...fast,
    });
    expect(out).toEqual({ entries: [], truncated: false });
  });

  it("maps a browser error back to its code", async () => {
    const repo = baseRepo({
      getRequest: vi.fn(async () => ({
        error: "gone",
        error_code: LOCAL_FILES_ERROR.notFound,
        id: "req-1",
        status: "error",
      }) as unknown as BridgeRequestRow),
    });
    await expect(
      runBridgeAction({ action: "read", connection, input: {}, repo, ...fast })
    ).rejects.toThrow(LOCAL_FILES_ERROR.notFound);
  });

  it("times out and expires the request when the browser never answers", async () => {
    const repo = baseRepo({
      getRequest: vi.fn(async () => ({ id: "req-1", status: "pending" }) as BridgeRequestRow),
    });
    await expect(
      runBridgeAction({ action: "stat", connection, input: {}, repo, ...fast })
    ).rejects.toThrow(LOCAL_FILES_ERROR.timeout);
    expect(repo.expireRequest).toHaveBeenCalledWith("req-1");
  });
});
