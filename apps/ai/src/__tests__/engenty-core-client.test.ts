import { describe, expect, it, vi } from "vitest";
import {
  EngentyCoreClient,
  EngentyCoreHttpError,
} from "../ai/core-http-client.js";

describe("EngentyCoreClient", () => {
  it("forwards a normalized bearer token and unwraps Engenty envelopes", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        ok: true,
        data: [{ toolId: "contacts_list" }],
      })
    );
    const client = new EngentyCoreClient({
      coreBaseUrl: "http://core.local",
      fetchImpl,
      accessToken: "Bearer user-token",
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
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    vi.useRealTimers();
  });

  it("re-mints and retries exactly once when core answers 401 and a refresh seam exists", async () => {
    // A headless run's short-lived service token can expire mid-run; later
    // requests must ride the fresh token without another 401 round-trip.
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

    await expect(client.listToolContracts()).resolves.toEqual({
      invoked: true,
    });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry when the refresh seam returns the token that just failed", async () => {
    // A 401 not caused by expiry (revoked credential) must not loop.
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

  it("rejects model-supplied absolute URLs", async () => {
    // The bearer token must never be sent to a host other than core.
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
