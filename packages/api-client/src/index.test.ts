import { ENGENTY_SERVICE_ERROR_CODES } from "@engenty/api-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientResponseError,
  clearApiClient,
  requestApiJson,
} from "./index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  clearApiClient();
});

describe("requestApiJson", () => {
  it("unwraps API success envelopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          ok: true,
          data: { name: "Ada" },
        })
      )
    );

    await expect(
      requestApiJson<{ name: string }>("/api/example", {
        baseUrl: "https://engenty.localhost",
      })
    ).resolves.toEqual({ name: "Ada" });
  });

  it("preserves structured API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            ok: false,
            error: {
              code: "validation_error",
              message: "Name is required.",
            },
          },
          { status: 400 }
        )
      )
    );

    await expect(
      requestApiJson("/api/example", {
        baseUrl: "https://engenty.localhost",
      })
    ).rejects.toMatchObject({
      code: "validation_error",
      message: "Name is required.",
      status: 400,
    });
  });

  it("does not expose proxy HTML when the backend is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          "<!DOCTYPE html><html><body>404 - Not Found</body></html>",
          {
            headers: { "content-type": "text/html; charset=utf-8" },
            status: 404,
            statusText: "Not Found",
          }
        )
      )
    );

    await expect(
      requestApiJson("/api/team", {
        baseUrl: "https://engenty.localhost",
      })
    ).rejects.toMatchObject({
      code: ENGENTY_SERVICE_ERROR_CODES.API_UNREACHABLE,
      message:
        "Backend is unavailable. It may be restarting or still starting up; retry in a moment.",
      status: 404,
      details: { reason: "backend_unavailable" },
    });
  });

  it("wraps fetch failures as API unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    );

    await expect(
      requestApiJson("/api/team", {
        baseUrl: "https://engenty.localhost",
      })
    ).rejects.toMatchObject({
      code: ENGENTY_SERVICE_ERROR_CODES.API_UNREACHABLE,
      message:
        "Lost connection to the backend. Check that the API is reachable, then retry.",
      status: 0,
      details: { cause: "fetch failed", reason: "connection_lost" },
    });
  });

  it("leaves aborts as cancellation errors", async () => {
    const abortError = new DOMException(
      "The operation was aborted.",
      "AbortError"
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(
      requestApiJson("/api/team", {
        baseUrl: "https://engenty.localhost",
      })
    ).rejects.toBe(abortError);
  });

  it("uses ApiClientResponseError for connection failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    );

    await expect(
      requestApiJson("/api/team", {
        baseUrl: "https://engenty.localhost",
      })
    ).rejects.toBeInstanceOf(ApiClientResponseError);
  });
});
