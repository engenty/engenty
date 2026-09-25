import { describe, expect, it, vi } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import type { SpaceGateSurface } from "../../ai/tools/engenty-tools/lib/space-gate.js";
import { createSpaceSetupTools } from "../../ai/tools/space-setup-tool.js";
import { testToolContext } from "./helpers/tool-context.js";

const SPACE_ID = "019fe8ec-0000-0000-0000-0000000000ab";
const CONNECTION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const marketing: SpaceGateSurface = {
  allConnectorPrefixes: new Set(),
  connectorPrefixes: new Set(),
  moduleIds: new Set(["projects"]),
  readOnlyModuleIds: new Set(),
  spaceId: SPACE_ID,
};

function tools(core: Record<string, unknown>) {
  return createSpaceSetupTools({ coreClientFor: () => core as never });
}

function inSpace<T>(fn: () => T): T {
  return engentyToolsRunAls.run(
    {
      accessToken: "token",
      coreBaseUrl: "https://core.test",
      space: marketing,
      tenantId: "tenant-1",
    },
    fn
  );
}

describe("space_setup", () => {
  it("adds apps to the run's own Space", async () => {
    const postSpaceSetupAdd = vi.fn().mockResolvedValue({
      added: [],
      needs_connect: [],
    });

    const result = (await inSpace(() =>
      tools({ postSpaceSetupAdd }).space_setup.execute!(
        { action: "add", modules: [{ id: "inbox" }] },
        testToolContext()
      )
    )) as { ok: boolean };

    expect(result.ok).toBe(true);
    expect(postSpaceSetupAdd).toHaveBeenCalledWith(SPACE_ID, [
      expect.objectContaining({
        resource_key: "inbox",
        resource_type: "module",
      }),
    ]);
  });

  it("lists only the accounts this Space owns", async () => {
    const core = {
      getSpaceSetupCatalog: vi.fn().mockResolvedValue({ modules: [] }),
      getSpaceSurface: vi
        .fn()
        .mockResolvedValue({ connections: [CONNECTION], modules: [] }),
      invokeTool: vi.fn().mockResolvedValue({
        connectors: [
          {
            connections: [
              { external_account: "me@example.com", id: CONNECTION },
              { external_account: "other@example.com", id: "conn-2" },
            ],
            id: "google-gmail",
          },
        ],
      }),
    };

    const result = (await inSpace(() =>
      tools(core).space_setup.execute!({ action: "list" }, testToolContext())
    )) as { accounts: Array<{ account_id: string }> };

    expect(result.accounts.map((account) => account.account_id)).toEqual([
      CONNECTION,
    ]);
  });

  it("refuses to remove without confirmation", async () => {
    const deleteSpaceMount = vi.fn();

    const result = (await inSpace(() =>
      tools({ deleteSpaceMount }).space_setup.execute!(
        { action: "remove", remove: { id: "inbox" } },
        testToolContext()
      )
    )) as { code: string; ok: boolean };

    expect(deleteSpaceMount).not.toHaveBeenCalled();
    expect(result.code).toBe("confirmation_required");
  });
});
