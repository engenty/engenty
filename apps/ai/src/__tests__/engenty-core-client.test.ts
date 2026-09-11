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

  it("re-mints and retries exactly once when core answers 401 and a refresh seam exists", async () => {
    // The ENG-34 shape: a headless run's 15-minute service token expires
    // mid-run. The first call 401s, the refresh seam mints a fresh token, the
    // retry succeeds — and every LATER request rides the fresh token without
    // another 401 round-trip.
    const fetchImpl = vi.fn(
      async (_url: URL | RequestInfo, init?: RequestInit) => {
        const auth = (init?.headers as Record<string, string>).Authorization;
        if (auth !== "Bearer fresh-token") {
          return Response.json(
            {
              ok: false,
              error: { code: "unauthorized", message: "jwt expired" },
            },
            { status: 401 }
          );
        }
        return Response.json({ ok: true, data: { invoked: true } });
      }
    );
    const refreshAccessToken = vi.fn(async () => "fresh-token");
    const client = new EngentyCoreClient({
      coreBaseUrl: "http://core.local",
      fetchImpl,
      accessToken: "expired-token",
      refreshAccessToken,
    });

    await expect(client.invokeTool("kb_article_create", {})).resolves.toEqual({
      invoked: true,
    });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // The client keeps the fresh token: no further 401, no further refresh.
    await expect(client.listToolContracts()).resolves.toEqual({
      invoked: true,
    });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry when the refresh seam returns the token that just failed", async () => {
    // A 401 that is NOT about expiry (revoked credential, wrong tenant) must
    // not loop: the mint returning the same still-cached token means retrying
    // would fail identically, so the original 401 surfaces.
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { ok: false, error: { code: "unauthorized", message: "nope" } },
        { status: 401 }
      )
    );
    const refreshAccessToken = vi.fn(async () => "same-token");
    const client = new EngentyCoreClient({
      coreBaseUrl: "http://core.local",
      fetchImpl,
      accessToken: "same-token",
      refreshAccessToken,
    });

    await expect(client.listToolContracts()).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("surfaces a 401 unchanged when the refresh seam itself fails", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { ok: false, error: { code: "unauthorized", message: "jwt expired" } },
        { status: 401 }
      )
    );
    const client = new EngentyCoreClient({
      coreBaseUrl: "http://core.local",
      fetchImpl,
      accessToken: "expired-token",
      refreshAccessToken: async () => {
        throw new Error("core is down");
      },
    });

    await expect(client.listToolContracts()).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
