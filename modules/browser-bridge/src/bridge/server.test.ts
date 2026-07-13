import type { ConnectionSummary } from "@engenty/connections-sdk";
import { describe, expect, it, vi } from "vitest";
import { BROWSER_BRIDGE_ERROR } from "../protocol.js";
import type { BridgeRequestRow, BrowserBridgeRepo } from "../repo.js";
import { runBridgeAction } from "./server.js";

const connection = {
  external_account: "Chrome — MacBook · 0a1b2c3d",
  id: "conn-1",
  tenant_id: "tenant-1",
} as unknown as ConnectionSummary;

function baseRepo(
  overrides: Partial<BrowserBridgeRepo> = {}
): BrowserBridgeRepo {
  return {
    getInstallationByConnection: vi.fn(async () => ({
      allowed_origins: [],
      connection_id: "conn-1",
      device_label: "Chrome — MacBook",
      installation_id: "inst-1",
      last_seen_at: new Date().toISOString(),
      tenant_id: "tenant-1",
      user_id: "user-1",
    })),
    insertRequest: vi.fn(
      async () => ({ id: "req-1", status: "pending" }) as BridgeRequestRow
    ),
    getRequest: vi.fn(),
    expireRequest: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as BrowserBridgeRepo;
}

const fast = { pollIntervalMs: 2, timeoutMs: 40 };

describe("runBridgeAction", () => {
  it("fails fast when no installation is linked to the connection", async () => {
    const repo = baseRepo({
      getInstallationByConnection: vi.fn(async () => null),
    });
    await expect(
      runBridgeAction({ action: "tabs", connection, input: {}, repo, ...fast })
    ).rejects.toThrow(BROWSER_BRIDGE_ERROR.browserOffline);
    expect(repo.insertRequest).not.toHaveBeenCalled();
  });

  it("fails fast when the installation heartbeat is stale", async () => {
    const repo = baseRepo({
      getInstallationByConnection: vi.fn(async () => ({
        allowed_origins: [],
        connection_id: "conn-1",
        device_label: "Chrome — MacBook",
        installation_id: "inst-1",
        last_seen_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        tenant_id: "tenant-1",
        user_id: "user-1",
      })),
    });
    await expect(
      runBridgeAction({ action: "tabs", connection, input: {}, repo, ...fast })
    ).rejects.toThrow(BROWSER_BRIDGE_ERROR.browserOffline);
    expect(repo.insertRequest).not.toHaveBeenCalled();
  });

  it("returns the extension response on completion", async () => {
    const repo = baseRepo({
      getRequest: vi.fn(
        async () =>
          ({
            id: "req-1",
            response: { tabs: [] },
            status: "completed",
          }) as unknown as BridgeRequestRow
      ),
    });
    const out = await runBridgeAction({
      action: "tabs",
      connection,
      input: {},
      repo,
      ...fast,
    });
    expect(out).toEqual({ tabs: [] });
  });

  it("keeps waiting while the request is merely claimed", async () => {
    const getRequest = vi
      .fn()
      .mockResolvedValueOnce({
        id: "req-1",
        status: "claimed",
      } as BridgeRequestRow)
      .mockResolvedValue({
        id: "req-1",
        response: { ok: true },
        status: "completed",
      } as unknown as BridgeRequestRow);
    const repo = baseRepo({ getRequest });
    const out = await runBridgeAction({
      action: "click",
      connection,
      input: { ref: 1 },
      repo,
      ...fast,
    });
    expect(out).toEqual({ ok: true });
    expect(getRequest.mock.calls.length).toBeGreaterThan(1);
  });

  it("maps an extension error back to its code", async () => {
    const repo = baseRepo({
      getRequest: vi.fn(
        async () =>
          ({
            error: "snapshot is stale, re-observe",
            error_code: BROWSER_BRIDGE_ERROR.refStale,
            id: "req-1",
            status: "error",
          }) as unknown as BridgeRequestRow
      ),
    });
    await expect(
      runBridgeAction({
        action: "click",
        connection,
        input: { ref: 1 },
        repo,
        ...fast,
      })
    ).rejects.toThrow(BROWSER_BRIDGE_ERROR.refStale);
  });

  it("times out and expires the request when the extension never answers", async () => {
    const repo = baseRepo({
      getRequest: vi.fn(
        async () => ({ id: "req-1", status: "claimed" }) as BridgeRequestRow
      ),
    });
    await expect(
      runBridgeAction({
        action: "observe",
        connection,
        input: {},
        repo,
        ...fast,
      })
    ).rejects.toThrow(BROWSER_BRIDGE_ERROR.timeout);
    expect(repo.expireRequest).toHaveBeenCalledWith("req-1");
  });
});
