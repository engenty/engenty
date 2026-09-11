import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngentySpaceSurface } from "../core-http-client.js";
import type { RunSpace, RunSpaceResolution } from "./run-space.js";
import { buildRuntimeContextInstructions } from "./runtime-context.js";
import { UNRESOLVED_SPACE_MODULE_WORK_RULE } from "./runtime-space-block.js";
import type { AiSessionScope } from "./types.js";

const SPACE_ID = "019fe8ec-0000-0000-0000-00000000000a";

const baseScope: AiSessionScope = {
  tenantId: "tenant-1",
  userId: "user-1",
  credential: { kind: "user", token: "token-runtime-context" },
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

function workspacePayload() {
  return {
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
    tenantSupportedLocales: ["en", "de"],
    tenants: [{ id: "tenant-1", name: "Acme", slug: "acme" }],
    userId: "user-1",
  };
}

function stubCoreFetch(input?: {
  agents?: unknown[];
  plugins?: unknown[];
  spaces?: unknown[];
  token?: string;
}) {
  const token = input?.token ?? `token-${Math.random().toString(36).slice(2)}`;
  vi.stubEnv("ENGENTY_CORE_BASE_URL", "http://core.local");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (rawUrl: URL | string) => {
      const url = new URL(String(rawUrl));
      if (url.pathname === "/ai/registry/agents") {
        // The registry route answers raw `{agents}`, not the core `{ok,data}`
        // envelope.
        return Response.json({ agents: input?.agents ?? [] });
      }
      if (url.pathname === "/api/users/setup/context") {
        return Response.json({ ok: true, data: workspacePayload() });
      }
      if (url.pathname === "/api/plugins") {
        return Response.json({
          ok: true,
          data: input?.plugins ?? [
            modulePlugin("projects", "Projects"),
            modulePlugin("contacts", "Contacts"),
            modulePlugin("offers", "Offers"),
          ],
        });
      }
      if (url.pathname === "/api/spaces") {
        return Response.json({
          ok: true,
          data: input?.spaces ?? [
            {
              id: SPACE_ID,
              key: "marketing",
              name: "Marketing",
            },
          ],
        });
      }
      return Response.json({ ok: true, data: [] });
    })
  );
  return { ...baseScope, credential: { kind: "user" as const, token } };
}

function runSpaceFromSurface(
  surface: EngentySpaceSurface,
  extras?: { allConnectorPrefixes?: string[] }
): RunSpace {
  const moduleIds = new Set<string>();
  const readOnlyModuleIds = new Set<string>();
  for (const mount of surface.modules) {
    if (mount.agentAccess === "none") {
      continue;
    }
    moduleIds.add(mount.moduleId);
    if (mount.agentAccess === "read") {
      readOnlyModuleIds.add(mount.moduleId);
    }
  }
  return {
    agentIds: new Set(surface.agents),
    allConnectorPrefixes: new Set(extras?.allConnectorPrefixes ?? ["gmail"]),
    browser: null,
    connectorPrefixes: new Set(surface.connectors?.length ? ["gmail"] : []),
    mountedConnectionIds: new Set(surface.connections),
    moduleIds,
    readOnlyModuleIds,
    spaceId: surface.spaceId,
    surface,
    topLevelAgentIds: new Set(),
  };
}

function surfaceFixture(
  overrides: Partial<EngentySpaceSurface> = {}
): EngentySpaceSurface {
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
      {
        agentAccess: "read",
        isRequired: false,
        moduleId: "contacts",
        recordScope: "all",
      },
    ],
    skills: ["projects-management"],
    spaceId: SPACE_ID,
    ...overrides,
  };
}

function resolved(surface?: EngentySpaceSurface): RunSpaceResolution {
  const next = surface ?? surfaceFixture();
  return { kind: "resolved", space: runSpaceFromSurface(next) };
}

describe("buildRuntimeContextInstructions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("includes the authenticated user's profile from workspace context", async () => {
    const scope = stubCoreFetch();
    const result = await buildRuntimeContextInstructions({
      scope,
      threadId: "session-1",
    });

    expect(result).toContain(
      "- current_user: name=Ada Lovelace, email=ada@example.com, initials=AL, role=admin, id=user-1"
    );
  });

  it("emits the mounted surface for a resolved Space and does not present tenant plugins as active_modules", async () => {
    const scope = stubCoreFetch();
    const result = await buildRuntimeContextInstructions({
      scope,
      spaceResolution: resolved(),
      threadId: "session-1",
    });

    expect(result).toContain(
      `- current_space: Marketing (marketing, ${SPACE_ID})`
    );
    expect(result).toContain("- space_mounted_modules:");
    expect(result).toContain("  - projects: access=write, records=space");
    expect(result).toContain(
      "  - contacts: access=read, records=tenant_shared"
    );
    expect(result).toContain("- space_mounted_agents: tasks.assist");
  });

  it("renders the Engenty roster with names when the registry answers", async () => {
    const scope = stubCoreFetch({
      agents: [
        {
          description: "Responds to every ping with a joke.",
          id: "fun.hello-world",
          name: "Hello World Joker",
        },
        { id: "tasks.assist", name: "Tasks Assist" },
        { id: "not.mounted", name: "Elsewhere" },
      ],
    });
    const result = await buildRuntimeContextInstructions({
      scope,
      spaceResolution: resolved(
        surfaceFixture({ agents: ["tasks.assist", "fun.hello-world"] })
      ),
      threadId: "session-1",
    });

    expect(result).toContain("- space_mounted_agents (address by id):");
    expect(result).toContain(
      "  - fun.hello-world — Hello World Joker: Responds to every ping with a joke."
    );
    expect(result).toContain("  - tasks.assist — Tasks Assist");
    expect(result).not.toContain("not.mounted");
    expect(result).toContain("- space_mounted_connections: 1");
    expect(result).toContain("- space_mounted_skills: projects-management");
    expect(result).toContain(
      "- tenant_has_other_modules: true (not mounted here; do not treat as missing globally)"
    );
    expect(result).toContain("- tenant_installed_modules:");
    expect(result).toContain("not callable from this Space");
    expect(result).toContain("offers");
    expect(result).not.toContain("active_modules");
    expect(result).not.toContain("  - offers:");
    expect(result).not.toContain("conn-gmail");
  });

  it("emits current_space: unresolved and the do-not-perform-module-work rule", async () => {
    const scope = stubCoreFetch();
    const result = await buildRuntimeContextInstructions({
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
    expect(result).toContain("Do not perform module work");
    expect(result).not.toContain("space_mounted_modules:");
    expect(result).not.toContain("active_modules");
    expect(result).not.toContain("callable in this tenant-global run");
  });

  it("emits current_space: global and treats tenant-installed modules as callable", async () => {
    const scope = stubCoreFetch();
    const result = await buildRuntimeContextInstructions({
      scope,
      spaceResolution: { kind: "global" },
      threadId: "session-1",
    });

    expect(result).toContain("- current_space: global");
    expect(result).toContain(
      "- This run has no Space by design (tenant-global)."
    );
    expect(result).toContain("callable in this tenant-global run");
    expect(result).toContain("contacts");
    expect(result).toContain("projects");
    expect(result).not.toContain("space_mounted_modules:");
    expect(result).not.toContain("active_modules");
    expect(result).not.toContain("not callable from this Space");
  });

  it("labels a mounted read-only module as access=read", async () => {
    const scope = stubCoreFetch({
      plugins: [modulePlugin("contacts", "Contacts")],
    });
    const result = await buildRuntimeContextInstructions({
      scope,
      spaceResolution: resolved(
        surfaceFixture({
          agents: [],
          connections: [],
          connectors: [],
          modules: [
            {
              agentAccess: "read",
              isRequired: false,
              moduleId: "contacts",
              recordScope: "all",
            },
          ],
          skills: [],
        })
      ),
      threadId: "session-1",
    });

    expect(result).toContain(
      "  - contacts: access=read, records=tenant_shared"
    );
    expect(result).not.toContain("access=write");
    expect(result).toContain(
      "- tenant_has_other_modules: false (not mounted here; do not treat as missing globally)"
    );
  });

  it("keeps an unmounted tenant module out of space_mounted_modules", async () => {
    const scope = stubCoreFetch();
    const result = await buildRuntimeContextInstructions({
      scope,
      spaceResolution: resolved(
        surfaceFixture({
          modules: [
            {
              agentAccess: "write",
              isRequired: false,
              moduleId: "projects",
              recordScope: "space",
            },
          ],
        })
      ),
      threadId: "session-1",
    });

    expect(result).toContain("  - projects: access=write, records=space");
    expect(result).not.toContain("  - contacts:");
    expect(result).not.toContain("  - offers:");
    expect(result).toContain(
      "- tenant_has_other_modules: true (not mounted here; do not treat as missing globally)"
    );
    expect(result).toMatch(
      /tenant_installed_modules: contacts, offers, projects \(not callable from this Space/
    );
  });
});
