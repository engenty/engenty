import { afterEach, describe, expect, it, vi } from "vitest";
import { executeEngentyTool } from "../../../../ai/tools/engenty-tools/engenty-tool-execute-tool.js";
import { searchEngentyTools } from "../../../../ai/tools/engenty-tools/engenty-tools-search-tool.js";
import { engentyToolsRunAls } from "../../../../ai/tools/engenty-tools/lib/run-context.js";
import { isToolVisibleInSpace } from "../../../../ai/tools/engenty-tools/lib/space-gate.js";
import { createApiCatalogSearchStore } from "../../../dal/api-catalog/api-catalog-search-store.js";
import type { EngentyToolContract } from "../../core-http-client.js";
import {
  buildCoreBackedMastraTool,
  createCoreBackedModuleOperationInvoker,
} from "../../module-capability-loader.js";

const marketing = {
  allConnectorPrefixes: new Set<string>(),
  connectorPrefixes: new Set<string>(),
  moduleIds: new Set(["projects", "contacts"]),
  readOnlyModuleIds: new Set(["contacts"]),
  spaceId: "019fe8ec-0000-0000-0000-000000000001",
};

const invoicesContract = {
  auth: {
    requiresApproval: false,
    riskLevel: "low" as const,
  },
  description: "List invoices",
  moduleId: "invoices",
  operationId: "invoices_list",
  pluginId: "invoices",
  readOnly: true,
  summary: "List invoices",
  toolId: "invoices_list",
};

const projectsContract = {
  ...invoicesContract,
  description: "List projects",
  moduleId: "projects",
  operationId: "projects_list",
  pluginId: "projects",
  summary: "List projects",
  toolId: "projects_list",
};

function describeResponse(contract: typeof invoicesContract) {
  return Response.json({ ok: true, data: contract });
}

describe("execution-lane space policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("native module tools hide unmounted ops and refuse them at execute", async () => {
    expect(
      isToolVisibleInSpace(
        { moduleId: "invoices", operationId: "invoices_list" },
        marketing
      )
    ).toBe(false);

    const tool = buildCoreBackedMastraTool(invoicesContract);
    const execute = (
      tool as {
        execute?: (input: unknown, context: unknown) => Promise<unknown>;
      }
    ).execute;
    if (!execute) {
      throw new Error("expected execute");
    }
    const result = await engentyToolsRunAls.run({ space: marketing }, () =>
      execute({} as never, {} as never)
    );
    expect(result).toMatchObject({ error: "module_not_in_space", ok: false });
  });

  it("code-mode sandbox execute receives the same Space as chat execute", async () => {
    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(describeResponse(invoicesContract));
    vi.stubGlobal("fetch", fetchMock);

    const result = await engentyToolsRunAls.run(
      { accessToken: "user-token", space: marketing },
      () =>
        executeEngentyTool({ id: "invoices_list", input: {} }, undefined, {
          sandbox: true,
        })
    );
    expect(result).toMatchObject({ error: "module_not_in_space", ok: false });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("code-mode discovery hides unmounted ops in the same Space", async () => {
    const catalog = createApiCatalogSearchStore({
      loadContracts: async () =>
        [invoicesContract, projectsContract] as EngentyToolContract[],
    });
    const result = await engentyToolsRunAls.run(
      { accessToken: "user-token", space: marketing },
      () => searchEngentyTools({ query: "list" }, { apiCatalog: catalog })
    );
    expect(result).toMatchObject({ catalog_only: true, ok: true });
    const matches =
      (result as { matches?: Array<{ name?: string }> }).matches ?? [];
    expect(matches.some((match) => match.name === "invoices_list")).toBe(false);
    expect(matches.some((match) => match.name === "projects_list")).toBe(true);
  });

  it("factory invoker refuses unresolved Space and unmounted ops", async () => {
    const unresolved = await engentyToolsRunAls.run(
      {
        space: {
          claimed_space_id: marketing.spaceId,
          kind: "unresolved",
          reason: "not_found",
        },
      },
      () => createCoreBackedModuleOperationInvoker()("invoices_list", {})
    );
    expect(unresolved).toMatchObject({
      error: "space_context_unresolved",
      ok: false,
    });

    vi.stubEnv("ENGENTY_CORE_BASE_URL", "https://api.engenty.localhost");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(describeResponse(invoicesContract));
    vi.stubGlobal("fetch", fetchMock);
    const refused = await engentyToolsRunAls.run(
      { accessToken: "user-token", space: marketing },
      () => createCoreBackedModuleOperationInvoker()("invoices_list", {})
    );
    expect(refused).toMatchObject({ error: "module_not_in_space", ok: false });
    expect(fetchMock).toHaveBeenCalled();
  });
});
