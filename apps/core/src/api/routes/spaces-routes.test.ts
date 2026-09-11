import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Space } from "../../dal/spaces.js";

const dal = vi.hoisted(() => ({
  addSpaceMember: vi.fn(),
  applySpaceSetup: vi.fn(),
  claimOrphanedSpace: vi.fn(),
  createSpace: vi.fn(),
  findAccessibleSpace: vi.fn(),
  findSpaceIdForRecord: vi.fn(),
  getSpaceById: vi.fn(),
  getSpaceByKey: vi.fn(),
  isAuthUserAdmin: vi.fn(async () => false),
  listAccessibleSpaces: vi.fn(),
  listMarkedDeletedSpaces: vi.fn(),
  listSpaceMembers: vi.fn(),
  listSpaceMounts: vi.fn(),
  listSpacesForUser: vi.fn(),
  markSpaceDeleted: vi.fn(),
  removeSpaceMember: vi.fn(),
  removeSpaceMount: vi.fn(),
  resolveConnectionFacts: vi.fn(async () => new Map()),
  resolveSpaceResourceSurface: vi.fn(),
  restoreSpace: vi.fn(),
  updateSpace: vi.fn(),
  upsertSpaceMount: vi.fn(),
}));

vi.mock("../../dal/core-users.js", () => ({
  createCoreUsersDal: () => ({
    isAuthUserAdmin: dal.isAuthUserAdmin,
  }),
}));

vi.mock("../../dal/space-membership.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../dal/space-membership.js")>();
  return {
    ...actual,
    addSpaceMember: dal.addSpaceMember,
    claimOrphanedSpace: dal.claimOrphanedSpace,
    findAccessibleSpace: dal.findAccessibleSpace,
    listAccessibleSpaces: dal.listAccessibleSpaces,
    listSpaceMembers: dal.listSpaceMembers,
    listSpacesForUser: dal.listSpacesForUser,
    removeSpaceMember: dal.removeSpaceMember,
  };
});

vi.mock("../../dal/space-mounts.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../dal/space-mounts.js")>();
  return {
    ...actual,
    listSpaceMounts: dal.listSpaceMounts,
    removeSpaceMount: dal.removeSpaceMount,
    resolveSpaceResourceSurface: dal.resolveSpaceResourceSurface,
    upsertSpaceMount: dal.upsertSpaceMount,
  };
});

vi.mock("../../dal/space-setup.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../dal/space-setup.js")>();
  return {
    ...actual,
    applySpaceSetup: dal.applySpaceSetup,
  };
});

vi.mock("../../dal/spaces.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../dal/spaces.js")>();
  return {
    ...actual,
    createSpace: dal.createSpace,
    getSpaceById: dal.getSpaceById,
    getSpaceByKey: dal.getSpaceByKey,
    listMarkedDeletedSpaces: dal.listMarkedDeletedSpaces,
    markSpaceDeleted: dal.markSpaceDeleted,
    restoreSpace: dal.restoreSpace,
    updateSpace: dal.updateSpace,
  };
});

vi.mock("../../dal/space-connection-lookup.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../dal/space-connection-lookup.js")
    >();
  return {
    ...actual,
    resolveConnectionFacts: dal.resolveConnectionFacts,
  };
});

vi.mock("../../dal/space-record-lookup.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../dal/space-record-lookup.js")>();
  return {
    ...actual,
    findSpaceIdForRecord: dal.findSpaceIdForRecord,
  };
});

import { SPACE_BASELINE_MOUNTS } from "@engenty/plugin-sdk";
import { registerSpacesRoutes } from "./spaces-routes.js";

const SECRET = "test-security-secret";
const TENANT = "11111111-1111-4111-8111-111111111111";
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function space(partial: Partial<Space> & Pick<Space, "id" | "key">): Space {
  return {
    agentApprovalMode: null,
    computerNetworkTier: null,
    color: null,
    createdAt: "2026-08-21T00:00:00.000Z",
    deletedAt: null,
    description: null,
    icon: null,
    isDefault: false,
    name: partial.key,
    ownerUserId: null,
    purgeAfter: null,
    tenantId: TENANT,
    visibility: "open",
    ...partial,
  };
}

const COMPANY = space({
  id: "s-company",
  isDefault: true,
  key: "company",
  name: "Company",
});
const VAULT = space({
  id: "s-vault",
  key: "vault",
  name: "Vault",
  visibility: "private",
  ownerUserId: BOB,
});

async function token(params: {
  capabilities?: string[];
  role?: "user" | "agent" | "service";
  subject?: string;
}) {
  return await new SignJWT({
    tenant_id: TENANT,
    role: params.role ?? "user",
    capabilities: params.capabilities ?? ["module.read"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.subject ?? ALICE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(SECRET));
}

function createApp(options: { callOperation?: CallOperation } = {}) {
  const app = new OpenAPIHono();
  registerSpacesRoutes({
    app,
    ...(options.callOperation ? { callOperation: options.callOperation } : {}),
    config: { securityJwtSecret: SECRET },
    getTenantDb: () => {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        eq: chain,
        insert: () => Promise.resolve({ error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        select: chain,
      });
      return {
        schema: () => ({ from: () => builder }),
      } as never;
    },
    registry: {
      plugins: [
        {
          id: "engenty-copilot",
          enabled: true,
          kind: "module",
          ui: {},
          name: "Copilot",
        },
        { id: "tasks", enabled: true, kind: "module", ui: {}, name: "Tasks" },
        {
          id: "inbox",
          connections: [
            {
              bindOperation: "inbox_account_bind",
              capability: "stream" as const,
            },
          ],
          enabled: true,
          kind: "module",
          mountOperation: "inbox_space_mount",
          name: "Inbox",
          ui: {},
        },
        {
          id: "knowledge-base",
          enabled: true,
          kind: "module",
          mountOperation: "kb_space_mount",
          name: "Knowledge Base",
          placement: "space",
          ui: {},
        },
        {
          id: "files",
          enabled: true,
          kind: "module",
          ui: {},
          name: "Files",
        },
        {
          id: "connections",
          enabled: true,
          kind: "module",
          ui: {},
          name: "Connections",
        },
        {
          id: "projects",
          enabled: true,
          kind: "module",
          ui: {},
          name: "Projects",
        },
        {
          id: "commercial-settings",
          enabled: true,
          kind: "module",
          name: "Commercial Settings",
          placement: "settings",
          ui: {},
        },
        {
          id: "pdf-templates",
          enabled: true,
          kind: "module",
          name: "PDF Templates",
          placement: "settings",
          ui: {},
        },
        {
          id: "connections-external",
          enabled: true,
          kind: "module",
          name: "Connections — External",
          rootDir: "/repo/modules/connections/providers/external",
          ui: {},
        },
        {
          id: "browser-bridge",
          enabled: true,
          kind: "module",
          name: "Browser Bridge",
          placement: "settings",
          ui: {},
        },
      ],
    },
  });
  return app;
}

type CallOperation = (input: {
  auth: unknown;
  input: unknown;
  operationId: string;
}) => Promise<unknown>;

async function json(res: Response) {
  return (await res.json()) as {
    data?: unknown;
    error?: { message?: string; code?: string };
    ok?: boolean;
  };
}

beforeEach(() => {
  for (const fn of Object.values(dal)) {
    fn.mockReset();
  }
  dal.isAuthUserAdmin.mockResolvedValue(false);
  dal.resolveConnectionFacts.mockResolvedValue(new Map());
});

describe("spaces HTTP routes", () => {
  it("lists only membership-filtered spaces", async () => {
    dal.listAccessibleSpaces.mockResolvedValue([COMPANY]);
    const app = createApp();
    const res = await app.request("/api/spaces", {
      headers: { authorization: `Bearer ${await token({})}` },
    });
    expect(res.status).toBe(200);
    expect(dal.listAccessibleSpaces).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      ALICE
    );
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([COMPANY]);
  });

  it("refuses include_deleted unless the caller is a tenant admin", async () => {
    dal.listAccessibleSpaces.mockResolvedValue([COMPANY]);
    const app = createApp();
    const res = await app.request("/api/spaces?include_deleted=1", {
      headers: { authorization: `Bearer ${await token({})}` },
    });
    expect(res.status).toBe(403);
    expect(dal.listMarkedDeletedSpaces).not.toHaveBeenCalled();
  });

  it("merges marked-deleted spaces onto the admin list", async () => {
    const pending = space({
      deletedAt: "2026-09-07T12:00:00.000Z",
      id: "s-old",
      key: "old",
      name: "Old",
      purgeAfter: "2026-09-14T12:00:00.000Z",
    });
    dal.isAuthUserAdmin.mockResolvedValue(true);
    dal.listAccessibleSpaces.mockResolvedValue([COMPANY]);
    dal.listMarkedDeletedSpaces.mockResolvedValue([pending]);
    const app = createApp();
    const res = await app.request("/api/spaces?include_deleted=1", {
      headers: { authorization: `Bearer ${await token({})}` },
    });
    expect(res.status).toBe(200);
    expect(dal.listMarkedDeletedSpaces).toHaveBeenCalled();
    expect((await json(res)).data).toEqual([COMPANY, pending]);
  });

  it("omits settings-placement and nested provider modules from the setup catalog", async () => {
    const app = createApp();
    const res = await app.request("/api/spaces/setup-catalog", {
      headers: { authorization: `Bearer ${await token({})}` },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    const modules = (body.data as { modules: Array<{ id: string }> }).modules;
    expect(modules.map((module) => module.id)).toEqual([
      "engenty-copilot",
      "tasks",
      "inbox",
      "knowledge-base",
      "files",
      "connections",
      "projects",
    ]);
  });

  it("returns 404, never 403, for a private Space the caller cannot enter", async () => {
    dal.findAccessibleSpace.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request("/api/spaces/vault/mounts", {
      headers: { authorization: `Bearer ${await token({})}` },
    });
    expect(res.status).toBe(404);
    expect((await json(res)).error?.message).toBe("Space not found");
  });

  it("refuses Space create unless the caller is a tenant admin", async () => {
    const app = createApp();
    const res = await app.request("/api/spaces", {
      body: JSON.stringify({ key: "marketing", name: "Marketing" }),
      headers: {
        authorization: `Bearer ${await token({})}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(res.status).toBe(403);
    expect(dal.createSpace).not.toHaveBeenCalled();
  });

  it("creates a Space for a tenant admin and returns 201", async () => {
    dal.getSpaceByKey.mockResolvedValue(null);
    dal.createSpace.mockResolvedValue(COMPANY);
    const app = createApp();
    const res = await app.request("/api/spaces", {
      body: JSON.stringify({ key: "company", name: "Company" }),
      headers: {
        authorization: `Bearer ${await token({ capabilities: ["*"] })}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(res.status).toBe(201);
    expect(dal.createSpace).toHaveBeenCalled();
    expect((await json(res)).data).toEqual(COMPANY);
  });

  it("puts the creator on the new Space's roster", async () => {
    dal.getSpaceByKey.mockResolvedValue(null);
    dal.createSpace.mockResolvedValue(COMPANY);
    const app = createApp();
    const res = await app.request("/api/spaces", {
      body: JSON.stringify({ key: "company", name: "Company" }),
      headers: {
        authorization: `Bearer ${await token({ capabilities: ["*"] })}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(res.status).toBe(201);
    expect(dal.addSpaceMember).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      COMPANY.id,
      ALICE,
      "owner"
    );
  });

  it("still creates the Space when the creator's member row fails", async () => {
    dal.getSpaceByKey.mockResolvedValue(null);
    dal.createSpace.mockResolvedValue(COMPANY);
    dal.addSpaceMember.mockRejectedValue(new Error("member_add_failed"));
    const app = createApp();
    const res = await app.request("/api/spaces", {
      body: JSON.stringify({ key: "company", name: "Company" }),
      headers: {
        authorization: `Bearer ${await token({ capabilities: ["*"] })}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(res.status).toBe(201);
  });

  it("applies setup mounts on create when the payload includes them", async () => {
    dal.getSpaceByKey.mockResolvedValue(null);
    dal.createSpace.mockResolvedValue(COMPANY);
    dal.applySpaceSetup.mockResolvedValue({
      plan: { protectedRemovals: [], remove: [], unchanged: [], upsert: [] },
      surface: {
        agents: ["engenty.copilot"],
        modules: [],
        spaceId: COMPANY.id,
      },
    });
    const app = createApp();
    const mounts = SPACE_BASELINE_MOUNTS.map((mount) => ({
      resource_key: mount.resourceKey,
      resource_type: mount.resourceType,
      ...(mount.agentAccess ? { agent_access: mount.agentAccess } : {}),
    }));
    const res = await app.request("/api/spaces", {
      body: JSON.stringify({ key: "company", mounts, name: "Company" }),
      headers: {
        authorization: `Bearer ${await token({ capabilities: ["*"] })}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(res.status).toBe(201);
    expect(dal.applySpaceSetup).toHaveBeenCalled();
  });

  it("runs a module's own setup when the wizard mounts it", async () => {
    dal.getSpaceByKey.mockResolvedValue(null);
    dal.createSpace.mockResolvedValue(COMPANY);
    dal.applySpaceSetup.mockResolvedValue({
      plan: {
        protectedRemovals: [],
        remove: [],
        unchanged: [],
        upsert: [
          {
            agentAccess: "write",
            recordScope: null,
            resourceKey: "knowledge-base",
            resourceType: "module",
          },
        ],
      },
      surface: {
        agents: ["engenty.copilot"],
        modules: [{ moduleId: "knowledge-base" }],
        spaceId: COMPANY.id,
      },
    });
    const callOperation = vi.fn(async () => ({ needs: [], ready: true }));
    const app = createApp({ callOperation });
    const mounts = [
      ...SPACE_BASELINE_MOUNTS.map((mount) => ({
        resource_key: mount.resourceKey,
        resource_type: mount.resourceType,
        ...(mount.agentAccess ? { agent_access: mount.agentAccess } : {}),
      })),
      {
        agent_access: "write",
        resource_key: "knowledge-base",
        resource_type: "module",
      },
    ];
    const res = await app.request("/api/spaces", {
      body: JSON.stringify({ key: "company", mounts, name: "Company" }),
      headers: {
        authorization: `Bearer ${await token({ capabilities: ["*"] })}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(res.status).toBe(201);
    // The same first-use setup the setup dialog and `space_setup` run: one
    // door cannot skip what the others do.
    expect(callOperation).toHaveBeenCalledWith({
      auth: expect.anything(),
      input: { space_id: COMPANY.id },
      operationId: "kb_space_mount",
    });
    const data = (await json(res)).data as {
      mounted: Array<{ module_id: string; needs: string[]; ready: boolean }>;
    };
    expect(data.mounted).toEqual([
      { module_id: "knowledge-base", needs: [], ready: true },
    ]);
  });

  it("returns 404 for setup/member writes on a private Space the caller cannot enter", async () => {
    dal.findAccessibleSpace.mockResolvedValue(null);
    const app = createApp();
    const headers = {
      authorization: `Bearer ${await token({ capabilities: ["*"] })}`,
      "content-type": "application/json",
    };
    const setup = await app.request("/api/spaces/vault/setup", {
      body: JSON.stringify({ mounts: [] }),
      headers,
      method: "PUT",
    });
    const member = await app.request(`/api/spaces/vault/members/${BOB}`, {
      body: JSON.stringify({ role: "member" }),
      headers,
      method: "PUT",
    });
    expect(setup.status).toBe(404);
    expect(member.status).toBe(404);
  });

  it("refuses mount writes for a member who is not the owner or an admin", async () => {
    dal.findAccessibleSpace.mockResolvedValue(COMPANY);
    const app = createApp();
    const res = await app.request("/api/spaces/company/mounts", {
      body: JSON.stringify({
        resource_key: "projects",
        resource_type: "module",
        agent_access: "write",
      }),
      headers: {
        authorization: `Bearer ${await token({})}`,
        "content-type": "application/json",
      },
      method: "PUT",
    });
    expect(res.status).toBe(403);
    expect(dal.upsertSpaceMount).not.toHaveBeenCalled();
  });

  // PLAN-connections-ux.md B2/C1/C3 — apps and accounts in ONE additive call.
  describe("POST /setup/add", () => {
    const CONNECTION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    function addBody(mounts: unknown[]) {
      return {
        body: JSON.stringify({ mounts }),
        headers: { "content-type": "application/json" },
        method: "POST",
      };
    }

    async function headers() {
      return { authorization: `Bearer ${await token({})}` };
    }

    beforeEach(() => {
      dal.findAccessibleSpace.mockResolvedValue(COMPANY);
      dal.listSpaceMounts.mockResolvedValue([]);
      dal.applySpaceSetup.mockResolvedValue({
        plan: { protectedRemovals: [], remove: [], unchanged: [], upsert: [] },
        surface: { connections: [], modules: [] },
      });
    });

    it("lets a member place an account they OWN without being an admin", async () => {
      dal.resolveConnectionFacts.mockResolvedValue(
        new Map([
          [
            CONNECTION,
            {
              autonomousMode: "off",
              connectorId: "google-gmail",
              ownerUserId: ALICE,
              sharing: "personal",
            },
          ],
        ])
      );
      const callOperation = vi.fn().mockResolvedValue({});
      const app = createApp({ callOperation });
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: CONNECTION,
            resource_type: "connection",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      // The account is theirs and the space is one they are in — nothing here
      // hands out reach the placer did not already have.
      expect(dal.isAuthUserAdmin).not.toHaveBeenCalled();
      // C1 — the level is worthless while the account's own ceiling says off.
      expect(callOperation).toHaveBeenCalledWith({
        auth: expect.anything(),
        input: { autonomous_mode: "full", connection_id: CONNECTION },
        operationId: "connections_update_settings",
      });
    });

    it("refuses a member placing someone ELSE's account", async () => {
      dal.resolveConnectionFacts.mockResolvedValue(
        new Map([
          [
            CONNECTION,
            {
              autonomousMode: "off",
              connectorId: "google-gmail",
              ownerUserId: BOB,
              sharing: "personal",
            },
          ],
        ])
      );
      const app = createApp();
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([{ resource_key: CONNECTION, resource_type: "connection" }]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      expect(res.status).toBe(403);
      expect(dal.applySpaceSetup).not.toHaveBeenCalled();
    });

    it("adds to what the space has instead of replacing it", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.listSpaceMounts.mockResolvedValue([
        {
          agentAccess: "write",
          createdAt: "2026-08-10T00:00:00Z",
          isRequired: true,
          recordScope: null,
          resourceKey: "tasks",
          resourceType: "module",
          spaceId: COMPANY.id,
          tenantId: TENANT,
        },
      ]);
      const app = createApp();
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: "inbox",
            resource_type: "module",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      // The baseline mount the caller never mentioned must survive — that is
      // the whole reason this route is not the dialog's replace.
      const desired = dal.applySpaceSetup.mock.calls[0][3] as Array<{
        resourceKey: string;
      }>;
      expect(desired.map((mount) => mount.resourceKey).sort()).toEqual([
        "inbox",
        "tasks",
      ]);
    });

    it("names an app that is here with no account to work with", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      const callOperation = vi.fn(async ({ operationId }) =>
        operationId === "connections_catalog" ? { connectors: [] } : {}
      );
      const app = createApp({ callOperation });
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: "inbox",
            resource_type: "module",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      const data = (await json(res)).data as {
        needs_connect?: Array<{ capability: string; module_id: string }>;
      };
      // Not a refusal: mounting the app before its mailbox is the normal order.
      expect(data.needs_connect).toEqual([
        { capability: "stream", module_id: "inbox" },
      ]);
    });

    // PLAN-connections-ux.md B3b — placing a mailbox has to END at "the mail is
    // here", not at "two rows exist".
    it("binds the app to the account it can now use", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.applySpaceSetup.mockResolvedValue({
        plan: { protectedRemovals: [], remove: [], unchanged: [], upsert: [] },
        surface: {
          connections: [CONNECTION],
          modules: [{ moduleId: "inbox" }],
        },
      });
      const callOperation = vi.fn(async ({ operationId }) =>
        operationId === "connections_catalog"
          ? {
              connectors: [
                {
                  capabilities: { stream: true },
                  connections: [{ id: CONNECTION }],
                },
              ],
            }
          : { bound: true }
      );
      const app = createApp({ callOperation });
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: CONNECTION,
            resource_type: "connection",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      expect(callOperation).toHaveBeenCalledWith({
        auth: expect.anything(),
        // The space rides along: a drive's binding is per space, a mailbox's
        // is tenant-wide, and one call shape serves both.
        input: { connection_id: CONNECTION, space_id: COMPANY.id },
        operationId: "inbox_account_bind",
      });
      const data = (await json(res)).data as {
        bound: Array<{ connection_id: string; module_id: string }>;
      };
      expect(data.bound).toEqual([
        { connection_id: CONNECTION, module_id: "inbox" },
      ]);
    });

    it("keeps the placement when the binding fails, and says which app", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.applySpaceSetup.mockResolvedValue({
        plan: { protectedRemovals: [], remove: [], unchanged: [], upsert: [] },
        surface: {
          connections: [CONNECTION],
          modules: [{ moduleId: "inbox" }],
        },
      });
      const callOperation = vi.fn(async ({ operationId }) => {
        if (operationId === "connections_catalog") {
          return {
            connectors: [
              {
                capabilities: { stream: true },
                connections: [{ id: CONNECTION }],
              },
            ],
          };
        }
        if (operationId === "inbox_account_bind") {
          throw new Error("mailbox unreachable");
        }
        return {};
      });
      const app = createApp({ callOperation });
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: CONNECTION,
            resource_type: "connection",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      // Undoing a placement the user asked for is the worse answer.
      expect(res.status).toBe(200);
      const data = (await json(res)).data as {
        bound: Array<{ error?: string; module_id: string }>;
      };
      expect(data.bound).toEqual([
        {
          connection_id: CONNECTION,
          error: "mailbox unreachable",
          module_id: "inbox",
        },
      ]);
    });

    it("lets an app with its own setup bind its accounts there, not twice", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.applySpaceSetup.mockResolvedValue({
        plan: { protectedRemovals: [], remove: [], unchanged: [], upsert: [] },
        surface: {
          connections: [CONNECTION],
          modules: [{ moduleId: "inbox" }],
        },
      });
      const callOperation = vi.fn(async ({ operationId }) => {
        if (operationId === "connections_catalog") {
          return {
            connectors: [
              {
                capabilities: { stream: true },
                connections: [{ id: CONNECTION }],
              },
            ],
          };
        }
        if (operationId === "inbox_space_mount") {
          return {
            bound: [{ connection_id: CONNECTION }],
            needs: [],
            ready: true,
          };
        }
        return {};
      });
      const app = createApp({ callOperation });
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: "inbox",
            resource_type: "module",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      // Mounting Inbox binds the space's mailboxes inside inbox_space_mount;
      // the pair binding on top would pull every mailbox twice.
      expect(callOperation).toHaveBeenCalledWith(
        expect.objectContaining({ operationId: "inbox_space_mount" })
      );
      expect(callOperation).not.toHaveBeenCalledWith(
        expect.objectContaining({ operationId: "inbox_account_bind" })
      );
      const data = (await json(res)).data as {
        bound: unknown[];
        mounted: unknown[];
      };
      expect(data.bound).toEqual([]);
      expect(data.mounted).toEqual([
        { module_id: "inbox", needs: [], ready: true },
      ]);
    });

    it("runs the module's own setup for an app it mounts", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      const callOperation = vi.fn(async ({ operationId }) =>
        operationId === "kb_space_mount" ? { needs: [], ready: true } : {}
      );
      const app = createApp({ callOperation });
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: "knowledge-base",
            resource_type: "module",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      expect(callOperation).toHaveBeenCalledWith({
        auth: expect.anything(),
        input: { space_id: COMPANY.id },
        operationId: "kb_space_mount",
      });
      const data = (await json(res)).data as {
        mounted: Array<{ module_id: string; needs: string[]; ready: boolean }>;
      };
      expect(data.mounted).toEqual([
        { module_id: "knowledge-base", needs: [], ready: true },
      ]);
    });

    it("keeps the mount when its setup fails, and says which app", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      const callOperation = vi.fn(async ({ operationId }) => {
        if (operationId === "kb_space_mount") {
          throw new Error("Space does not exist in this tenant");
        }
        return {};
      });
      const app = createApp({ callOperation });
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: "knowledge-base",
            resource_type: "module",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      // The placement stands; the answer names what is not ready.
      expect(res.status).toBe(200);
      const data = (await json(res)).data as {
        mounted: Array<{ error?: string; module_id: string; ready: boolean }>;
      };
      expect(data.mounted).toEqual([
        {
          error: "Space does not exist in this tenant",
          module_id: "knowledge-base",
          needs: [],
          ready: false,
        },
      ]);
    });

    it("reports what a mounted app still needs, without refusing the mount", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      const callOperation = vi.fn(async ({ operationId }) =>
        operationId === "kb_space_mount"
          ? { needs: ["ai_gateway"], ready: false }
          : {}
      );
      const app = createApp({ callOperation });
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: "knowledge-base",
            resource_type: "module",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      const data = (await json(res)).data as { mounted: unknown[] };
      expect(data.mounted).toEqual([
        { module_id: "knowledge-base", needs: ["ai_gateway"], ready: false },
      ]);
    });

    it("does not re-bind pairs this call did not touch", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.applySpaceSetup.mockResolvedValue({
        plan: { protectedRemovals: [], remove: [], unchanged: [], upsert: [] },
        surface: {
          connections: [CONNECTION],
          modules: [{ moduleId: "inbox" }],
        },
      });
      const callOperation = vi.fn(async ({ operationId }) =>
        operationId === "connections_catalog"
          ? {
              connectors: [
                {
                  capabilities: { stream: true },
                  connections: [{ id: CONNECTION }],
                },
              ],
            }
          : {}
      );
      const app = createApp({ callOperation });
      // Adding an unrelated app must not re-pull a mailbox that was already
      // bound — a rename would otherwise re-sync every account in the space.
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: "tasks",
            resource_type: "module",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      expect(callOperation).not.toHaveBeenCalledWith(
        expect.objectContaining({ operationId: "inbox_account_bind" })
      );
    });

    it("says nothing is missing once a mailbox is placed here", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.applySpaceSetup.mockResolvedValue({
        plan: { protectedRemovals: [], remove: [], unchanged: [], upsert: [] },
        surface: { connections: [CONNECTION], modules: [] },
      });
      const callOperation = vi.fn(async ({ operationId }) =>
        operationId === "connections_catalog"
          ? {
              connectors: [
                {
                  capabilities: { files: false, storage: false, stream: true },
                  connections: [{ id: CONNECTION }],
                },
              ],
            }
          : {}
      );
      const app = createApp({ callOperation });
      const res = await app.request("/api/spaces/company/setup/add", {
        ...addBody([
          {
            agent_access: "write",
            resource_key: "inbox",
            resource_type: "module",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      const data = (await json(res)).data as { needs_connect?: unknown[] };
      expect(data.needs_connect).toEqual([]);
    });
  });

  it("refuses a single mount whose module is not installed", async () => {
    dal.findAccessibleSpace.mockResolvedValue(COMPANY);
    dal.isAuthUserAdmin.mockResolvedValue(true);
    const app = createApp();
    const res = await app.request("/api/spaces/company/mounts", {
      body: JSON.stringify({
        agent_access: "write",
        resource_key: "inbxo",
        resource_type: "module",
      }),
      headers: {
        authorization: `Bearer ${await token({})}`,
        "content-type": "application/json",
      },
      method: "PUT",
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error?.message).toContain("inbxo");
    expect(dal.upsertSpaceMount).not.toHaveBeenCalled();
  });

  it("lets a member read mounts and members of a Space they can enter", async () => {
    dal.findAccessibleSpace.mockResolvedValue(COMPANY);
    dal.listSpaceMounts.mockResolvedValue([
      {
        agentAccess: "write",
        isRequired: true,
        recordScope: "space",
        resourceKey: "projects",
        resourceType: "module",
        spaceId: COMPANY.id,
        tenantId: TENANT,
      },
    ]);
    dal.listSpaceMembers.mockResolvedValue([
      { role: "owner", spaceId: COMPANY.id, userId: ALICE },
    ]);
    const app = createApp();
    const auth = { authorization: `Bearer ${await token({})}` };
    const mounts = await app.request("/api/spaces/company/mounts", {
      headers: auth,
    });
    const members = await app.request("/api/spaces/company/members", {
      headers: auth,
    });
    expect(mounts.status).toBe(200);
    expect(members.status).toBe(200);
  });

  it("refuses removing a required baseline mount", async () => {
    dal.findAccessibleSpace.mockResolvedValue({
      ...COMPANY,
      ownerUserId: ALICE,
    });
    dal.listSpaceMounts.mockResolvedValue([
      {
        agentAccess: "none",
        isRequired: true,
        recordScope: null,
        resourceKey: "engenty-copilot",
        resourceType: "module",
        spaceId: COMPANY.id,
        tenantId: TENANT,
      },
    ]);
    const app = createApp();
    const res = await app.request(
      "/api/spaces/company/mounts/module/engenty-copilot",
      {
        headers: { authorization: `Bearer ${await token({})}` },
        method: "DELETE",
      }
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe(
      "space_setup_required_mount_removal"
    );
    expect(dal.removeSpaceMount).not.toHaveBeenCalled();
  });

  it("mounts every library skill in a category pack", async () => {
    dal.findAccessibleSpace.mockResolvedValue({
      ...COMPANY,
      ownerUserId: ALICE,
    });
    dal.upsertSpaceMount.mockResolvedValue({});
    const app = createApp();
    const res = await app.request(
      "/api/spaces/company/skill-packs/productivity",
      {
        headers: { authorization: `Bearer ${await token({})}` },
        method: "PUT",
      }
    );
    expect(res.status).toBe(200);
    const body = (await json(res)).data as { mounted: string[] };
    expect(body.mounted).toEqual(
      expect.arrayContaining(["xlsx", "pdf", "docx"])
    );
    expect(dal.upsertSpaceMount).toHaveBeenCalled();
    expect(dal.upsertSpaceMount.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({
        resourceKey: expect.any(String),
        resourceType: "skill",
      })
    );
  });

  it("unmounts pack skills and leaves module-prefixed names when that module is mounted", async () => {
    dal.findAccessibleSpace.mockResolvedValue({
      ...COMPANY,
      ownerUserId: ALICE,
    });
    dal.listSpaceMounts.mockResolvedValue([
      {
        agentAccess: "write",
        isRequired: false,
        recordScope: null,
        resourceKey: "contacts",
        resourceType: "module",
        spaceId: COMPANY.id,
        tenantId: TENANT,
      },
    ]);
    const app = createApp();
    const res = await app.request(
      "/api/spaces/company/skill-packs/productivity",
      {
        headers: { authorization: `Bearer ${await token({})}` },
        method: "DELETE",
      }
    );
    expect(res.status).toBe(200);
    const body = (await json(res)).data as {
      unmounted: string[];
      retained: string[];
    };
    expect(body.retained).toEqual([]);
    expect(body.unmounted).toContain("xlsx");
    expect(dal.removeSpaceMount).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      COMPANY.id,
      "skill",
      "xlsx"
    );
  });

  it("404s an unknown skill pack category", async () => {
    dal.findAccessibleSpace.mockResolvedValue({
      ...COMPANY,
      ownerUserId: ALICE,
    });
    const app = createApp();
    const res = await app.request(
      "/api/spaces/company/skill-packs/not-a-pack",
      {
        headers: { authorization: `Bearer ${await token({})}` },
        method: "PUT",
      }
    );
    expect(res.status).toBe(404);
  });

  describe("task-bound headless surface access", () => {
    const TASK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const SURFACE = {
      agents: [],
      browserGrant: null,
      computerNetworkTier: null,
      modules: [],
      spaceId: VAULT.id,
    };

    it("serves a private Space's surface to a service principal whose task lives there", async () => {
      dal.findAccessibleSpace.mockResolvedValue(null);
      dal.findSpaceIdForRecord.mockResolvedValue(VAULT.id);
      dal.getSpaceById.mockResolvedValue(VAULT);
      dal.resolveSpaceResourceSurface.mockResolvedValue(SURFACE);
      const app = createApp();
      const res = await app.request(`/api/spaces/${VAULT.id}/surface`, {
        headers: {
          authorization: `Bearer ${await token({ role: "service" })}`,
          "x-engenty-task-id": TASK,
        },
      });
      expect(res.status).toBe(200);
      expect((await json(res)).data).toEqual(SURFACE);
      expect(dal.findSpaceIdForRecord).toHaveBeenCalledWith(expect.anything(), {
        moduleId: "tasks",
        recordId: TASK,
        tenantId: TENANT,
      });
    });

    it("refuses when the task lives in a different Space", async () => {
      dal.findAccessibleSpace.mockResolvedValue(null);
      dal.findSpaceIdForRecord.mockResolvedValue(COMPANY.id);
      dal.getSpaceById.mockResolvedValue(COMPANY);
      const app = createApp();
      const res = await app.request(`/api/spaces/${VAULT.id}/surface`, {
        headers: {
          authorization: `Bearer ${await token({ role: "service" })}`,
          "x-engenty-task-id": TASK,
        },
      });
      expect(res.status).toBe(404);
    });

    it("never widens a USER principal via the task header", async () => {
      dal.findAccessibleSpace.mockResolvedValue(null);
      const app = createApp();
      const res = await app.request(`/api/spaces/${VAULT.id}/surface`, {
        headers: {
          authorization: `Bearer ${await token({})}`,
          "x-engenty-task-id": TASK,
        },
      });
      expect(res.status).toBe(404);
      expect(dal.findSpaceIdForRecord).not.toHaveBeenCalled();
    });

    it("still 404s a service principal without a task header", async () => {
      dal.findAccessibleSpace.mockResolvedValue(null);
      const app = createApp();
      const res = await app.request(`/api/spaces/${VAULT.id}/surface`, {
        headers: {
          authorization: `Bearer ${await token({ role: "service" })}`,
        },
      });
      expect(res.status).toBe(404);
      expect(dal.findSpaceIdForRecord).not.toHaveBeenCalled();
    });

    it("does not open the members route through the task header", async () => {
      dal.findAccessibleSpace.mockResolvedValue(null);
      dal.findSpaceIdForRecord.mockResolvedValue(VAULT.id);
      dal.getSpaceById.mockResolvedValue(VAULT);
      const app = createApp();
      const res = await app.request(`/api/spaces/${VAULT.id}/members`, {
        headers: {
          authorization: `Bearer ${await token({ role: "service" })}`,
          "x-engenty-task-id": TASK,
        },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("delete and restore", () => {
    const marketing = space({
      id: "s-marketing",
      key: "marketing",
      name: "Marketing",
    });

    it("refuses to mark a space unless the caller is a tenant admin", async () => {
      const app = createApp();
      const res = await app.request("/api/spaces/marketing", {
        body: JSON.stringify({ confirm_name: "Marketing" }),
        headers: {
          authorization: `Bearer ${await token({})}`,
          "content-type": "application/json",
        },
        method: "DELETE",
      });
      expect(res.status).toBe(403);
      expect(dal.markSpaceDeleted).not.toHaveBeenCalled();
    });

    it("marks a space for deletion when the name matches", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.getSpaceByKey.mockResolvedValue(marketing);
      const marked = {
        ...marketing,
        deletedAt: "2026-09-07T12:00:00.000Z",
        purgeAfter: "2026-09-14T12:00:00.000Z",
      };
      dal.markSpaceDeleted.mockResolvedValue(marked);
      const app = createApp();
      const res = await app.request("/api/spaces/marketing", {
        body: JSON.stringify({ confirm_name: "Marketing" }),
        headers: {
          authorization: `Bearer ${await token({})}`,
          "content-type": "application/json",
        },
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      expect(dal.markSpaceDeleted).toHaveBeenCalledWith(
        expect.anything(),
        TENANT,
        marketing.id
      );
      expect((await json(res)).data).toEqual(marked);
    });

    it("refuses a confirm name that does not match", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.getSpaceByKey.mockResolvedValue(marketing);
      const app = createApp();
      const res = await app.request("/api/spaces/marketing", {
        body: JSON.stringify({ confirm_name: "Wrong" }),
        headers: {
          authorization: `Bearer ${await token({})}`,
          "content-type": "application/json",
        },
        method: "DELETE",
      });
      expect(res.status).toBe(400);
      expect(dal.markSpaceDeleted).not.toHaveBeenCalled();
    });

    it("refuses to delete the company space", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.getSpaceByKey.mockResolvedValue(COMPANY);
      dal.markSpaceDeleted.mockRejectedValue(new Error("space_is_default"));
      const app = createApp();
      const res = await app.request("/api/spaces/company", {
        body: JSON.stringify({ confirm_name: "Company" }),
        headers: {
          authorization: `Bearer ${await token({})}`,
          "content-type": "application/json",
        },
        method: "DELETE",
      });
      expect(res.status).toBe(403);
    });

    it("restores a marked space for a tenant admin", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.getSpaceByKey.mockResolvedValue({
        ...marketing,
        deletedAt: "2026-09-07T12:00:00.000Z",
        purgeAfter: "2026-09-14T12:00:00.000Z",
      });
      dal.restoreSpace.mockResolvedValue(marketing);
      const app = createApp();
      const res = await app.request("/api/spaces/marketing/restore", {
        headers: { authorization: `Bearer ${await token({})}` },
        method: "POST",
      });
      expect(res.status).toBe(200);
      expect(dal.restoreSpace).toHaveBeenCalled();
    });
  });
});
