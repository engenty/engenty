import { describe, expect, it, vi } from "vitest";
import {
  type EngentyToolsRunContext,
  engentyToolsRunAls,
} from "../../ai/tools/engenty-tools/lib/run-context.js";
import { registryAgentsListTool } from "../../ai/tools/registry-agents-list-tool.js";

function runWithContext(
  ctx: EngentyToolsRunContext,
  fn: () => Promise<unknown>
) {
  return engentyToolsRunAls.run(ctx, fn);
}

describe("registryAgentsListTool", () => {
  it("returns the tenant registry for an intentional no-Space run", async () => {
    const mockFetch = vi.fn(async (_url?: string, _init?: RequestInit) => ({
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

  it("returns only agents mounted in the resolved Space", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        agents: [
          { id: "sales.researcher", name: "Sales Researcher" },
          { id: "invoices.manager", name: "Invoices Manager" },
        ],
      }),
    }));
    vi.stubGlobal("fetch", mockFetch);
    try {
      const result = await runWithContext(
        {
          coreBaseUrl: "https://api.example.com",
          space: {
            agentIds: new Set(["sales.researcher"]),
            allConnectorPrefixes: new Set(),
            connectorPrefixes: new Set(),
            moduleIds: new Set(),
            readOnlyModuleIds: new Set(),
            spaceId: "space-1",
          },
        },
        () =>
          registryAgentsListTool.execute?.(
            {} as never,
            {} as never
          ) as Promise<unknown>
      );
      expect(result).toEqual({
        agents: [{ id: "sales.researcher", name: "Sales Researcher" }],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns no agents when a resolved Space mounts none", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    try {
      const result = await runWithContext(
        {
          space: {
            agentIds: new Set(),
            allConnectorPrefixes: new Set(),
            connectorPrefixes: new Set(),
            moduleIds: new Set(),
            readOnlyModuleIds: new Set(),
            spaceId: "space-empty",
          },
        },
        () =>
          registryAgentsListTool.execute?.(
            {} as never,
            {} as never
          ) as Promise<unknown>
      );
      expect(result).toEqual({ agents: [] });
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails closed when a claimed Space is unresolved", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    try {
      await expect(
        runWithContext(
          {
            space: {
              claimed_space_id: "space-missing",
              kind: "unresolved",
              reason: "not_found",
            },
          },
          () =>
            registryAgentsListTool.execute?.(
              {} as never,
              {} as never
            ) as Promise<unknown>
        )
      ).rejects.toThrow("refusing tenant-wide fallback");
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
