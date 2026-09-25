import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Space } from "../../dal/spaces.js";

const dal = vi.hoisted(() => ({
  applySpaceSetup: vi.fn(),
  createSpace: vi.fn(),
  findAccessibleSpace: vi.fn(),
  findSpaceIdForRecord: vi.fn(),
  getSpaceById: vi.fn(),
  getSpaceByKey: vi.fn(),
  isAuthUserAdmin: vi.fn(async () => false),
  listAccessibleSpaces: vi.fn(),
  listCompanyPublishingSpaces: vi.fn(async () => []),
  listMarkedDeletedSpaces: vi.fn(),
  listSpaceMounts: vi.fn(),
  markSpaceDeleted: vi.fn(),
  removeSpaceMember: vi.fn(),
  resolveSpaceResourceSurface: vi.fn(),
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
    findAccessibleSpace: dal.findAccessibleSpace,
    listAccessibleSpaces: dal.listAccessibleSpaces,
    removeSpaceMember: dal.removeSpaceMember,
  };
});

vi.mock("../../dal/space-mounts.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../dal/space-mounts.js")>();
  return {
    ...actual,
    listSpaceMounts: dal.listSpaceMounts,
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
    listCompanyPublishingSpaces: dal.listCompanyPublishingSpaces,
    listMarkedDeletedSpaces: dal.listMarkedDeletedSpaces,
    markSpaceDeleted: dal.markSpaceDeleted,
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

import { registerSpacesRoutes } from "./spaces-routes.js";

const SECRET = "test-security-secret";
const TENANT = "11111111-1111-4111-8111-111111111111";
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function space(partial: Partial<Space> & Pick<Space, "id" | "key">): Space {
  return {
    agentApprovalMode: null,
    computerNetworkTier: null,
    computerEgressHosts: [],
    publishToCompany: null,
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
          id: "files",
          connections: [
            {
              bindOperation: "files_source_bind",
              capability: "files" as const,
              required: false,
            },
          ],
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
  return (await res.json()) as { error?: { message?: string } };
}

beforeEach(() => {
  for (const fn of Object.values(dal)) {
    fn.mockReset();
  }
  dal.isAuthUserAdmin.mockResolvedValue(false);
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

    it("refuses a member who is not the space owner or an admin", async () => {
      const app = createApp();
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
      // A mount the caller never mentioned must survive an additive call.
      const desired = dal.applySpaceSetup.mock.calls[0][3] as Array<{
        resourceKey: string;
      }>;
      expect(desired.map((mount) => mount.resourceKey).sort()).toEqual([
        "inbox",
        "tasks",
      ]);
    });

    it("binds an added app to the accounts the space owns", async () => {
      dal.isAuthUserAdmin.mockResolvedValue(true);
      dal.applySpaceSetup.mockResolvedValue({
        plan: { protectedRemovals: [], remove: [], unchanged: [], upsert: [] },
        surface: {
          connections: [CONNECTION],
          modules: [{ moduleId: "files" }],
        },
      });
      const callOperation = vi.fn(async ({ operationId }) =>
        operationId === "connections_catalog"
          ? {
              connectors: [
                {
                  capabilities: { files: true },
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
            resource_key: "files",
            resource_type: "module",
          },
        ]),
        headers: { ...(await headers()), "content-type": "application/json" },
      });
      expect(res.status).toBe(200);
      expect(callOperation).toHaveBeenCalledWith({
        auth: expect.anything(),
        // The space rides along: a drive's binding is per space.
        input: { connection_id: CONNECTION, space_id: COMPANY.id },
        operationId: "files_source_bind",
      });
    });
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

  describe("delete", () => {
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
  });
});
