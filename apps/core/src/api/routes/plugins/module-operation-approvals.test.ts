import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrincipalContext } from "../../../security/auth.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import { registerApprovalRoutes } from "./module-operation-approvals.js";
import type { ApprovalService } from "./module-operation-shared.js";

const isSpaceOwner = vi.hoisted(() => vi.fn());
vi.mock("../../../dal/space-membership.js", () => ({ isSpaceOwner }));

const TENANT = "11111111-1111-4111-8111-111111111111";
const SPACE = "99999999-9999-4999-8999-999999999999";
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function principal(capabilities: string[] = []): PrincipalContext {
  return {
    audience: [],
    authMethod: "jwt",
    capabilities,
    delegationChain: [],
    moduleIds: [],
    permissions: [],
    principalId: ALICE,
    principalType: "user",
    tenantId: TENANT,
    userId: ALICE,
  } as unknown as PrincipalContext;
}

function createApp(options: {
  auth: PrincipalContext;
  context?: Record<string, unknown>;
}) {
  const app = new OpenAPIHono();
  const decide = vi.fn(async () => ({
    id: "req-1",
    moduleId: "connections",
    operationId: "connections_execute",
  }));
  const approvalService = {
    decide,
    get: vi.fn(async () => ({
      context: options.context ?? {},
      id: "req-1",
      status: "pending",
      tenantId: TENANT,
    })),
    listPending: vi.fn(async () => []),
  } as unknown as ApprovalService;
  registerApprovalRoutes({
    app,
    approvalService,
    auditLog: { push: vi.fn() } as never,
    authProvider: {
      resolvePrincipal: vi.fn(async () => options.auth),
    } as unknown as AuthProvider,
    config: {},
    getTenantDb: () => ({}) as never,
  });
  return { app, decide };
}

function decideRequest(app: OpenAPIHono) {
  return app.request("/api/security/approvals/req-1/decision", {
    body: JSON.stringify({ decision: "allow_once" }),
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    method: "POST",
  });
}

describe("approval decision — space-owned connections", () => {
  beforeEach(() => {
    isSpaceOwner.mockReset();
  });

  it("lets an owner of the request's space decide", async () => {
    isSpaceOwner.mockResolvedValue(true);
    const { app, decide } = createApp({
      auth: principal(),
      context: { space_id: SPACE },
    });
    const res = await decideRequest(app);
    expect(res.status).toBe(200);
    expect(isSpaceOwner).toHaveBeenCalledWith(
      expect.anything(),
      TENANT,
      SPACE,
      ALICE
    );
    expect(decide).toHaveBeenCalled();
  });

  it("refuses a tenant member who does not own the space", async () => {
    isSpaceOwner.mockResolvedValue(false);
    const { app, decide } = createApp({
      auth: principal(),
      context: { space_id: SPACE },
    });
    const res = await decideRequest(app);
    expect(res.status).toBe(403);
    expect(decide).not.toHaveBeenCalled();
  });

  it("lets a tenant admin decide without owning the space", async () => {
    const { app, decide } = createApp({
      auth: principal(["core.users.manage"]),
      context: { space_id: SPACE },
    });
    const res = await decideRequest(app);
    expect(res.status).toBe(200);
    expect(isSpaceOwner).not.toHaveBeenCalled();
    expect(decide).toHaveBeenCalled();
  });
});
