/** @vitest-environment happy-dom */
import { ApiClientResponseError } from "@engenty/api-client";
import { MASTRA_STUDIO_CONFIG_STORAGE_KEY } from "@engenty/environment";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runStudioActivate, studioPageUrl } from "./studio-activate.js";

vi.mock("@engenty/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@engenty/api-client")>();
  return {
    ...actual,
    requestApiJson: vi.fn(),
  };
});

import { requestApiJson } from "@engenty/api-client";

const requestApiJsonMock = vi.mocked(requestApiJson);

afterEach(() => {
  window.localStorage.removeItem(MASTRA_STUDIO_CONFIG_STORAGE_KEY);
  vi.clearAllMocks();
});

describe("studioPageUrl", () => {
  it("appends /studio to the origin", () => {
    expect(studioPageUrl("https://spaces.engenty.localhost")).toBe(
      "https://spaces.engenty.localhost/studio"
    );
  });
});

describe("runStudioActivate", () => {
  it("seeds config, POSTs activate, and opens Studio", async () => {
    requestApiJsonMock.mockResolvedValue({
      enabled: true,
      tenantId: "00000000-0000-4000-8000-00000000000a",
      agentIds: ["mail-collector"],
    });
    const open = vi.fn();
    const result = await runStudioActivate({
      accessToken: "tok",
      gatewayBaseUrl: "https://spaces.engenty.localhost",
      origin: "https://spaces.engenty.localhost",
      open,
    });
    expect(result.ok).toBe(true);
    expect(requestApiJsonMock).toHaveBeenCalledWith(
      "/ai/studio/activate",
      expect.objectContaining({
        authToken: "tok",
        method: "POST",
      })
    );
    expect(open).toHaveBeenCalledWith(
      "https://spaces.engenty.localhost/studio"
    );
    const stored = JSON.parse(
      window.localStorage.getItem(MASTRA_STUDIO_CONFIG_STORAGE_KEY) ?? "{}"
    ) as { headers: { Authorization: string } };
    expect(stored.headers.Authorization).toBe("Bearer tok");
  });

  it("returns 404 when Studio is off", async () => {
    requestApiJsonMock.mockRejectedValue(
      new ApiClientResponseError({
        status: 404,
        message: "Not Found",
        code: "studio.disabled",
      })
    );
    const open = vi.fn();
    const result = await runStudioActivate({
      accessToken: "tok",
      gatewayBaseUrl: "https://spaces.engenty.localhost",
      origin: "https://spaces.engenty.localhost",
      open,
    });
    expect(result).toEqual({ ok: false, status: 404 });
    expect(open).not.toHaveBeenCalled();
  });
});
