import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import type { SpaceDataAdapter, SpaceDataDocument } from "@engenty/plugin-sdk";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Space } from "../../dal/spaces.js";
import { makeEmptyRegistry } from "../../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../../security/audit-adapter.js";
import { verifyAccessToken } from "../../security/auth.js";
import { registerSpaceDataRoutes } from "./space-data-routes.js";

const dal = vi.hoisted(() => ({
  findAccessibleSpace: vi.fn(),
  listSpaceMounts: vi.fn(),
}));

vi.mock("../../dal/space-membership.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../dal/space-membership.js")>();
  return {
    ...actual,
    findAccessibleSpace: dal.findAccessibleSpace,
  };
});

vi.mock("../../dal/space-mounts.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../dal/space-mounts.js")>();
  return {
    ...actual,
    listSpaceMounts: dal.listSpaceMounts,
  };
});

const SECRET = "test-security-secret";
const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SPACE_ID = "019fe8ec-0000-4000-8000-00000000000a";

const COMPANY: Space = {
  agentApprovalMode: null,
  computerNetworkTier: null,
  computerEgressHosts: [],
  publishToCompany: null,
  color: null,
  createdAt: "2026-08-21T00:00:00.000Z",
  deletedAt: null,
  description: null,
  icon: null,
  id: SPACE_ID,
  isDefault: true,
  key: "company",
  name: "Company",
  ownerUserId: null,
  purgeAfter: null,
  tenantId: TENANT,
  visibility: "open",
};

function document(path: string): SpaceDataDocument {
  return {
    kind: "record",
    members: [],
    name: path,
    nodeType: "file",
    path,
    recordId: path,
    version: "v1",
  };
}

function adapter(input: { moduleId: string; root: string }): SpaceDataAdapter {
  return {
    label: input.root,
    list: () => Promise.resolve({ entries: [], folders: [] }),
    moduleId: input.moduleId,
    nodeTypes: [],
    read: () => Promise.resolve(document(input.root)),
    recordScopes: ["all"],
    root: input.root,
  };
}

const contacts = adapter({ moduleId: "contacts", root: "Contacts" });
const offers = adapter({ moduleId: "offers", root: "Offers" });
const files = adapter({ moduleId: "files", root: "Files" });

function moduleMount(input: {
  agentAccess?: "none" | "read" | "write";
  key: string;
}) {
  return {
    agentAccess: input.agentAccess ?? "write",
    createdAt: "2026-08-21T00:00:00.000Z",
    isRequired: false,
    recordScope: "all" as const,
    resourceKey: input.key,
    resourceType: "module" as const,
    spaceId: SPACE_ID,
    tenantId: TENANT,
  };
}

async function userToken() {
  return await new SignJWT({
    tenant_id: TENANT,
    role: "user",
    capabilities: ["module.read", "module.write"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(SECRET));
}

function createApp() {
  const app = new OpenAPIHono();
  registerSpaceDataRoutes({
    app,
    approvalService: createApprovalService(createFakeApprovalDb().client),
    auditLog: createNoopAuditLog(),
    authProvider: {
      resolveAdminFallback: async () => null,
      resolvePrincipal: async (header) =>
        verifyAccessToken(header, SECRET, { transport: "rest" }),
      resolveTenantForSession: async () => TENANT,
      verifyToken: async (header) =>
        verifyAccessToken(header, SECRET, { transport: "rest" }),
    },
    config: { securityJwtSecret: SECRET },
    dataDir: "/tmp",
    getTenantDb: () => ({}) as never,
    registry: makeEmptyRegistry({
      spaceDataAdapters: [
        {
          adapter: contacts,
          pluginConfig: {},
          pluginId: "contacts",
          source: "test",
        },
        {
          adapter: offers,
          pluginConfig: {},
          pluginId: "offers",
          source: "test",
        },
        {
          adapter: files,
          pluginConfig: {},
          pluginId: "files",
          source: "test",
        },
      ],
    }),
    resolvePath: (p) => p,
  });
  return app;
}

async function json(res: Response) {
  return (await res.json()) as {
    data?: unknown;
    error?: { message?: string };
  };
}

beforeEach(() => {
  dal.findAccessibleSpace.mockReset();
  dal.listSpaceMounts.mockReset();
  dal.findAccessibleSpace.mockResolvedValue(COMPANY);
  dal.listSpaceMounts.mockResolvedValue([
    moduleMount({ key: "contacts", agentAccess: "read" }),
    moduleMount({ key: "files", agentAccess: "write" }),
  ]);
});

describe("space data HTTP routes", () => {
  it("returns 401 without a principal", async () => {
    const res = await createApp().request(`/api/spaces/${SPACE_ID}/data/roots`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for a private Space the caller cannot enter", async () => {
    dal.findAccessibleSpace.mockResolvedValue(null);
    const res = await createApp().request(
      `/api/spaces/${SPACE_ID}/data/roots`,
      {
        headers: { authorization: `Bearer ${await userToken()}` },
      }
    );
    expect(res.status).toBe(404);
    expect((await json(res)).error?.message).toBe("Space not found");
  });

  it("lists only mounted Data roots", async () => {
    const res = await createApp().request(
      `/api/spaces/${SPACE_ID}/data/roots`,
      {
        headers: { authorization: `Bearer ${await userToken()}` },
      }
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    const roots = body.data as Array<{ root: string; moduleId: string }>;
    expect(roots.map((entry) => entry.root).sort()).toEqual([
      "Contacts",
      "Files",
    ]);
    expect(roots.some((entry) => entry.moduleId === "offers")).toBe(false);
  });

  it("reads a mounted root and 404s an unmounted one as not part of this Space", async () => {
    const app = createApp();
    const auth = { authorization: `Bearer ${await userToken()}` };
    const listed = await app.request(
      `/api/spaces/${SPACE_ID}/data/list?path=Contacts`,
      { headers: auth }
    );
    expect(listed.status).toBe(200);
    const missing = await app.request(
      `/api/spaces/${SPACE_ID}/data/list?path=Offers`,
      { headers: auth }
    );
    expect(missing.status).toBe(404);
  });

  it("refuses a traversal path before any adapter sees it", async () => {
    const res = await createApp().request(
      `/api/spaces/${SPACE_ID}/data/list?path=${encodeURIComponent("Contacts/../Offers")}`,
      { headers: { authorization: `Bearer ${await userToken()}` } }
    );
    expect(res.status).toBe(400);
  });
});
