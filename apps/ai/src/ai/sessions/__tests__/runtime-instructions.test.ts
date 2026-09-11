import { SPACE_CONTRACT_PROMPT } from "@engenty/ai-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngentySpaceSurface } from "../../core-http-client.js";
import type { RunSpace, RunSpaceResolution } from "../run-space.js";
import { buildSessionRuntimeInstructions } from "../runtime-instructions.js";
import { UNRESOLVED_SPACE_MODULE_WORK_RULE } from "../runtime-space-block.js";
import type { AiSessionScope } from "../types.js";

const SPACE_ID = "019fe8ec-0000-0000-0000-00000000000a";
const ROUTE_SPACE_ID = "019fe8ec-0000-0000-0000-00000000000b";

const baseScope: AiSessionScope = {
  tenantId: "tenant-1",
  userId: "user-1",
  credential: { kind: "user", token: "token-runtime-instructions" },
  isSuperAdmin: false,
  isTenantAdmin: true,
  tenantRole: "admin",
};

function modulePlugin(id: string, name: string) {
  return {
    id,
    name,
    kind: "module",
    description: `${name} module`,
    enabled: true,
    loaded: true,
    tenantEnabled: true,
    effectiveState: {
      allowed: true,
      globallyEnabled: true,
      tenantEnabled: true,
    },
  };
}

function stubCoreFetch() {
  const token = `token-${Math.random().toString(36).slice(2)}`;
  vi.stubEnv("ENGENTY_CORE_BASE_URL", "http://core.local");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => {
      if (url.pathname === "/api/users/setup/context") {
        return Response.json({
          ok: true,
          data: {
            canSwitchTenant: false,
            currentTenant: { id: "tenant-1", name: "Acme", slug: "acme" },
            currentUser: {
              id: "user-1",
              email: "ada@example.com",
              display_name: "Ada Lovelace",
              initials: "AL",
              role: "admin",
            },
            isSuperAdmin: false,
            isTenantAdmin: true,
            onboarded: true,
            tenantRole: "admin",
            tenantSupportedLocales: ["en"],
            tenants: [{ id: "tenant-1", name: "Acme", slug: "acme" }],
            userId: "user-1",
          },
        });
      }
      if (url.pathname === "/api/plugins") {
        return Response.json({
          ok: true,
          data: [
            modulePlugin("projects", "Projects"),
            modulePlugin("contacts", "Contacts"),
            modulePlugin("offers", "Offers"),
          ],
        });
      }
      if (url.pathname === "/api/spaces") {
        return Response.json({
          ok: true,
          data: [
            { id: SPACE_ID, key: "marketing", name: "Marketing" },
            { id: ROUTE_SPACE_ID, key: "sales", name: "Sales" },
          ],
        });
      }
      return Response.json({ ok: true, data: [] });
    })
  );
  return { ...baseScope, credential: { kind: "user" as const, token } };
}

function surfaceFixture(): EngentySpaceSurface {
  return {
    agents: ["tasks.assist"],
    capabilities: [],
    connections: ["conn-gmail"],
    connectors: ["google-gmail"],
    modules: [
      {
        agentAccess: "write",
        isRequired: false,
        moduleId: "projects",
        recordScope: "space",
      },
    ],
    skills: ["projects-management"],
    spaceId: SPACE_ID,
  };
}

function resolved(): RunSpaceResolution {
  const surface = surfaceFixture();
  const space: RunSpace = {
    agentIds: new Set(surface.agents),
    allConnectorPrefixes: new Set(["gmail"]),
    browser: null,
    connectorPrefixes: new Set(["gmail"]),
    mountedConnectionIds: new Set(surface.connections),
    moduleIds: new Set(["projects"]),
    readOnlyModuleIds: new Set(),
    spaceId: surface.spaceId,
    surface,
    topLevelAgentIds: new Set(),
  };
  return { kind: "resolved", space };
}

const routeContextWithOtherSpace = {
  scope: { space_id: ROUTE_SPACE_ID },
};

describe("buildSessionRuntimeInstructions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards a resolved Space surface into the combined prompt", async () => {
    const scope = stubCoreFetch();
    const result = await buildSessionRuntimeInstructions({
      agentId: "engenty.copilot",
      routeContext: routeContextWithOtherSpace,
      scope,
      spaceResolution: resolved(),
      threadId: "session-1",
    });

    expect(result).toContain(SPACE_CONTRACT_PROMPT);
    expect(result).toContain(
      `- current_space: Marketing (marketing, ${SPACE_ID})`
    );
    expect(result).toContain("  - projects: access=write, records=space");
    expect(result).not.toContain("Sales");
    expect(result).not.toContain(ROUTE_SPACE_ID);
    expect(result).not.toContain("active_modules");
  });

  it("keeps unresolved fail-closed even when route context names a Space", async () => {
    const scope = stubCoreFetch();
    const result = await buildSessionRuntimeInstructions({
      agentId: "engenty.copilot",
      routeContext: routeContextWithOtherSpace,
      scope,
      spaceResolution: {
        kind: "unresolved",
        claimed_space_id: SPACE_ID,
        reason: "not_found",
      },
      threadId: "session-1",
    });

    expect(result).toContain("- current_space: unresolved");
    expect(result).toContain(UNRESOLVED_SPACE_MODULE_WORK_RULE);
    expect(result).not.toContain("space_mounted_modules:");
    expect(result).not.toContain("Sales");
    expect(result).not.toContain(ROUTE_SPACE_ID);
  });
});
