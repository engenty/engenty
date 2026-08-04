import { describe, expect, it, vi } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { registryAgentsListTool } from "../../ai/tools/registry-agents-list-tool.js";

function runWithContext(
  ctx: { coreBaseUrl?: string; accessToken?: string },
  fn: () => Promise<unknown>
) {
  return engentyToolsRunAls.run(ctx, fn);
}

describe("registryAgentsListTool", () => {
  it("returns agents from the registry endpoint", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        agents: [
          { id: "engenty.copilot", name: "Copilot" },
          {
            id: "knowledge-base.manager",
            name: "KB Manager",
            description: "Manages KB",
          },
        ],
      }),
    }));

    vi.stubGlobal("fetch", mockFetch);
    try {
      const result = await runWithContext(
        { coreBaseUrl: "https://api.example.com", accessToken: "tok-123" },
        () =>
          registryAgentsListTool.execute?.(
            {} as never,
            {} as never
          ) as Promise<unknown>
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/ai/registry/agents",
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: "Bearer tok-123" }),
        })
      );
      expect(result).toEqual({
        agents: [
          { id: "engenty.copilot", name: "Copilot" },
          {
            id: "knowledge-base.manager",
            name: "KB Manager",
            description: "Manages KB",
          },
        ],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("throws when coreBaseUrl is not set", async () => {
    await expect(
      runWithContext(
        {},
        () =>
          registryAgentsListTool.execute?.(
            {} as never,
            {} as never
          ) as Promise<unknown>
      )
    ).rejects.toThrow("coreBaseUrl is not set");
  });

  it("throws on non-ok HTTP response", async () => {
    const mockFetch = vi.fn(async () => ({ ok: false, status: 503 }));
    vi.stubGlobal("fetch", mockFetch);
    try {
      await expect(
        runWithContext(
          { coreBaseUrl: "https://api.example.com" },
          () =>
            registryAgentsListTool.execute?.(
              {} as never,
              {} as never
            ) as Promise<unknown>
        )
      ).rejects.toThrow("HTTP 503");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("omits Authorization header when no access token is set", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ agents: [] }),
    }));
    vi.stubGlobal("fetch", mockFetch);
    try {
      await runWithContext(
        { coreBaseUrl: "https://api.example.com" },
        () =>
          registryAgentsListTool.execute?.(
            {} as never,
            {} as never
          ) as Promise<unknown>
      );
      const headers = mockFetch.mock.calls[0]?.[1]?.headers as Record<
        string,
        string
      >;
      expect(headers).not.toHaveProperty("authorization");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
