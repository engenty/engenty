import { describe, expect, it, vi } from "vitest";
import {
  EngentyCoreClient,
  EngentyCoreHttpError,
} from "../ai/core-http-client.js";

describe("EngentyCoreClient", () => {
  it("forwards the bearer token and unwraps Engenty envelopes", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ok: true,
        data: [{ toolId: "contacts_list" }],
      })
    );
    const client = new EngentyCoreClient({
      coreBaseUrl: "http://core.local",
      fetchImpl,
      accessToken: "user-token",
    });

    await expect(client.listToolContracts()).resolves.toEqual([
      { toolId: "contacts_list" },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://core.local/api/tools/contracts"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer user-token",
        }),
      })
    );
  });

  it("normalizes bearer-prefixed access tokens before forwarding to core", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ok: true,
        data: [],
      })
    );
    const client = new EngentyCoreClient({
      coreBaseUrl: "http://core.local",
      fetchImpl,
      accessToken: "Bearer Bearer user-token",
    });

    await client.listToolContracts();
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://core.local/api/tools/contracts"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
        }),
      })
    );
  });

  it("resolves the current workspace context through core", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ok: true,
        data: {
          onboarded: true,
          userId: "00000000-0000-4000-8000-000000000002",
          isSuperAdmin: false,
          currentTenant: {
            id: "00000000-0000-4000-8000-000000000001",
            slug: "default",
            name: "Default",
          },
        },
      })
    );
    const client = new EngentyCoreClient({
      coreBaseUrl: "http://core.local",
      fetchImpl,
      accessToken: "user-token",
    });

    await expect(client.getWorkspaceContext()).resolves.toMatchObject({
      userId: "00000000-0000-4000-8000-000000000002",
      currentTenant: { id: "00000000-0000-4000-8000-000000000001" },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://core.local/api/users/setup/context"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
        }),
      })
    );
  });

  it("preserves core API error codes and details", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          ok: false,
          error: {
            code: "approval_required",
            message: "Approval required",
            details: { approvalRequestId: "apr_1" },
          },
        },
        { status: 202 }
      )
    );
    const client = new EngentyCoreClient({
      coreBaseUrl: "http://core.local",
      fetchImpl,
      accessToken: "user-token",
    });

    await expect(
      client.invokeTool("contacts_delete", {})
    ).rejects.toMatchObject({
      code: "approval_required",
      details: { approvalRequestId: "apr_1" },
      status: 202,
    });
  });

  it("aborts hung core requests after the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(
              new DOMException("The operation was aborted.", "AbortError")
            );
          });
        })
    );
    const client = new EngentyCoreClient({
      coreBaseUrl: "http://core.local",
      fetchImpl,
      requestTimeoutMs: 50,
      accessToken: "user-token",
    });

    const pending = client.listToolContracts();
    const assertion = expect(pending).rejects.toMatchObject({
      code: "network_error",
      message: "Core request timed out",
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    vi.useRealTimers();
  });

  it("rejects model-supplied absolute URLs", async () => {
    const client = new EngentyCoreClient({
      coreBaseUrl: "http://core.local",
      fetchImpl: vi.fn(),
      accessToken: "user-token",
    });

    await expect(
      client.request("https://evil.example/api")
    ).rejects.toBeInstanceOf(EngentyCoreHttpError);
  });
});
