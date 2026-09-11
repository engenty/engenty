import { describe, expect, it, vi } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import type { SpaceGateSurface } from "../../ai/tools/engenty-tools/lib/space-gate.js";
import { createSpaceSetupTools } from "../../ai/tools/space-setup-tool.js";
import { EngentyCoreHttpError } from "../ai/core-http-client.js";
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

const run = { accessToken: "token", coreBaseUrl: "https://core.test" };

function tools(core: Record<string, unknown>) {
  return createSpaceSetupTools({ coreClientFor: () => core as never });
}

function inSpace<T>(fn: () => T): T {
  return engentyToolsRunAls.run(
    { ...run, space: marketing, tenantId: "tenant-1" },
    fn
  );
}

describe("space_setup", () => {
  it("adds an app and an account in ONE call", async () => {
    const postSpaceSetupAdd = vi.fn().mockResolvedValue({
      added: [],
      ceiling_blocked: [],
      needs_connect: [],
      surface: { connections: [CONNECTION], modules: [] },
    });

    const result = (await inSpace(() =>
      tools({ postSpaceSetupAdd }).space_setup.execute!(
        {
          accounts: [{ access: "write", id: CONNECTION }],
          action: "add",
          modules: [{ id: "inbox" }],
        },
        testToolContext()
      )
    )) as { message: string; ok: boolean };

    expect(postSpaceSetupAdd).toHaveBeenCalledWith(SPACE_ID, [
      { agent_access: "write", resource_key: "inbox", resource_type: "module" },
      {
        agent_access: "write",
        resource_key: CONNECTION,
        resource_type: "connection",
      },
    ]);
    expect(result.ok).toBe(true);
    // The tools are assembled at run start, so this turn cannot use them.
    expect(result.message).toContain("next message");
  });

  it("relays needs_connect instead of reporting a finished job", async () => {
    const postSpaceSetupAdd = vi.fn().mockResolvedValue({
      added: [],
      ceiling_blocked: [],
      needs_connect: [{ capability: "stream", module_id: "inbox" }],
      surface: { connections: [], modules: [] },
    });

    const result = (await inSpace(() =>
      tools({ postSpaceSetupAdd }).space_setup.execute!(
        { action: "add", modules: [{ id: "inbox" }] },
        testToolContext()
      )
    )) as {
      message: string;
      needs_connect?: unknown[];
      ok: boolean;
    };

    expect(result.ok).toBe(true);
    expect(result.needs_connect).toEqual([
      { capability: "stream", module_id: "inbox" },
    ]);
    expect(result.message).toContain("connections_request_connect");
  });

  it("does not call a half-finished binding a success", async () => {
    const postSpaceSetupAdd = vi.fn().mockResolvedValue({
      added: [],
      bound: [
        {
          connection_id: CONNECTION,
          error: "mailbox unreachable",
          module_id: "inbox",
        },
      ],
      ceiling_blocked: [],
      needs_connect: [],
      surface: { connections: [CONNECTION], modules: [] },
    });

    const result = (await inSpace(() =>
      tools({ postSpaceSetupAdd }).space_setup.execute!(
        {
          accounts: [{ id: CONNECTION }],
          action: "add",
          modules: [{ id: "inbox" }],
        },
        testToolContext()
      )
    )) as { bound?: unknown[]; message: string; ok: boolean };

    expect(result.ok).toBe(true);
    // The mounts are right; the mail is not here yet, and the model must say so.
    expect(result.message).toContain("mailbox unreachable");
    expect(result.bound).toHaveLength(1);
  });

  it("carries an account whose owner still has to open it up", async () => {
    const postSpaceSetupAdd = vi.fn().mockResolvedValue({
      added: [],
      ceiling_blocked: [{ connection_id: CONNECTION, reason: "not the owner" }],
      surface: { connections: [CONNECTION], modules: [] },
    });

    const result = (await inSpace(() =>
      tools({ postSpaceSetupAdd }).space_setup.execute!(
        { accounts: [{ id: CONNECTION }], action: "add" },
        testToolContext()
      )
    )) as { ceiling_blocked?: unknown[]; ok: boolean };

    expect(result.ok).toBe(true);
    expect(result.ceiling_blocked).toEqual([
      { connection_id: CONNECTION, reason: "not the owner" },
    ]);
  });

  it("lists what is here and what else could be added", async () => {
    const core = {
      getSpaceSetupCatalog: vi.fn().mockResolvedValue({
        modules: [
          { category: null, description: null, id: "projects", name: "Plan" },
          { category: null, description: "E-Mail", id: "inbox", name: "Inbox" },
        ],
      }),
      getSpaceSurface: vi.fn().mockResolvedValue({
        connections: [CONNECTION],
        modules: [
          {
            agentAccess: "write",
            isRequired: true,
            moduleId: "projects",
            recordScope: null,
          },
        ],
      }),
      invokeTool: vi.fn().mockResolvedValue({
        connectors: [
          {
            capabilities: { stream: true },
            connections: [
              { external_account: "me@example.com", id: CONNECTION },
              { external_account: "other@example.com", id: "conn-2" },
            ],
            id: "google-gmail",
            name: "Gmail",
          },
        ],
      }),
    };

    const result = (await inSpace(() =>
      tools(core).space_setup.execute!({ action: "list" }, testToolContext())
    )) as {
      accounts: Array<{ name: string }>;
      available_accounts: Array<{ account_id: string }>;
      available_modules: Array<{ module_id: string }>;
      modules: Array<{ name: string }>;
    };

    expect(result.accounts).toEqual([
      { account_id: CONNECTION, name: "me@example.com" },
    ]);
    expect(result.available_accounts.map((a) => a.account_id)).toEqual([
      "conn-2",
    ]);
    expect(result.available_modules.map((m) => m.module_id)).toEqual(["inbox"]);
    expect(result.modules[0].name).toBe("Plan");
  });

  it("still lists when the connector catalog is unreachable", async () => {
    const core = {
      getSpaceSetupCatalog: vi.fn().mockResolvedValue({ modules: [] }),
      getSpaceSurface: vi
        .fn()
        .mockResolvedValue({ connections: [CONNECTION], modules: [] }),
      invokeTool: vi.fn().mockRejectedValue(new Error("no connections module")),
    };

    const result = (await inSpace(() =>
      tools(core).space_setup.execute!({ action: "list" }, testToolContext())
    )) as { accounts: Array<{ account_id: string; name: string }> };

    // The id is a poor label and an honest one; losing the account from the
    // list would read as "this space has no mailbox".
    expect(result.accounts).toEqual([
      { account_id: CONNECTION, name: CONNECTION },
    ]);
  });

  it("tells the model a 403 is admin-only and not worth retrying", async () => {
    const postSpaceSetupAdd = vi
      .fn()
      .mockRejectedValue(
        new EngentyCoreHttpError("Forbidden", 403, "forbidden")
      );

    const result = (await inSpace(() =>
      tools({ postSpaceSetupAdd }).space_setup.execute!(
        { action: "add", modules: [{ id: "inbox" }] },
        testToolContext()
      )
    )) as { code: string; message: string; ok: boolean };

    expect(result.ok).toBe(false);
    expect(result.code).toBe("forbidden");
    expect(result.message).toContain("Do not retry");
  });

  it("refuses to remove without confirmation", async () => {
    const deleteSpaceMount = vi.fn();

    const result = (await inSpace(() =>
      tools({ deleteSpaceMount }).space_setup.execute!(
        { action: "remove", remove: { id: "inbox", kind: "module" } },
        testToolContext()
      )
    )) as { code: string; ok: boolean };

    expect(deleteSpaceMount).not.toHaveBeenCalled();
    expect(result.code).toBe("confirmation_required");
  });

  it("removes an account once confirmed, and says records are hidden", async () => {
    const deleteSpaceMount = vi.fn().mockResolvedValue({ removed: true });

    const result = (await inSpace(() =>
      tools({ deleteSpaceMount }).space_setup.execute!(
        {
          action: "remove",
          confirmed: true,
          remove: { id: CONNECTION, kind: "account" },
        },
        testToolContext()
      )
    )) as { message: string; ok: boolean };

    expect(deleteSpaceMount).toHaveBeenCalledWith(
      SPACE_ID,
      "connection",
      CONNECTION
    );
    expect(result.ok).toBe(true);
    expect(result.message).toContain("not deleted");
  });

  it("refuses a run with no Space instead of picking one", async () => {
    const postSpaceSetupAdd = vi.fn();

    const result = (await engentyToolsRunAls.run(
      { ...run, tenantId: "tenant-1" },
      () =>
        tools({ postSpaceSetupAdd }).space_setup.execute!(
          { action: "add", modules: [{ id: "inbox" }] },
          testToolContext()
        )
    )) as { code: string; ok: boolean };

    expect(postSpaceSetupAdd).not.toHaveBeenCalled();
    expect(result.code).toBe("no_space");
  });

  it("refuses an unresolved Space claim rather than widening", async () => {
    const postSpaceSetupAdd = vi.fn();

    const result = (await engentyToolsRunAls.run(
      {
        ...run,
        space: {
          claimed_space_id: SPACE_ID,
          kind: "unresolved",
          reason: "forbidden",
        },
        tenantId: "tenant-1",
      },
      () =>
        tools({ postSpaceSetupAdd }).space_setup.execute!(
          { action: "add", modules: [{ id: "inbox" }] },
          testToolContext()
        )
    )) as { code: string; ok: boolean };

    expect(postSpaceSetupAdd).not.toHaveBeenCalled();
    expect(result.code).toBe("space_context_unresolved");
  });
});
