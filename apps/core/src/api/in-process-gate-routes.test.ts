import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import type { PluginAuthContext, PluginServerApi } from "@engenty/plugin-sdk";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createPluginRegistry } from "../plugins/registry.js";
import { makePluginRecord } from "../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { createApiApp } from "./server.js";

const SECRET = "test-security-secret";

async function agentToken(capabilities: string[]): Promise<string> {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "agent",
    capabilities,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("agent-1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(SECRET));
}

/**
 * A module whose operations call one another in-process, the way offers calls
 * `contacts_add_contact_role` while creating an offer: `demo_outer_*` runs
 * `demo_inner_write` through the plugin runtime API, forwarding `ctx.auth`.
 */
function makeApp() {
  const { registry, createApi } = createPluginRegistry({
    config: {},
    dataDir: "/tmp",
    resolvePath: (p) => p,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  });
  const record = makePluginRecord({ id: "demo" });
  registry.plugins.push(record);
  const server: PluginServerApi = createApi(record, {}).server;
  const innerCalls: unknown[] = [];

  server.registerOperation({
    operationId: "demo_inner_write",
    moduleId: "demo",
    requiredCapabilities: ["module.demo.write"],
    riskLevel: "high",
    requiresApproval: true,
    handler: async (input) => {
      innerCalls.push(input);
      return { ok: true };
    },
  });

  const callInner = async (auth: PluginAuthContext | undefined) => {
    try {
      await server.callGatewayMethod(
        "demo_inner_write",
        { via: "nested" },
        {
          ...(auth ? { auth } : {}),
        }
      );
      return { nested: "executed" };
    } catch (e) {
      return { nested: "denied", reason: e instanceof Error ? e.message : "" };
    }
  };

  server.registerOperation({
    operationId: "demo_outer_write",
    moduleId: "demo",
    requiredCapabilities: ["module.demo.write"],
    riskLevel: "high",
    requiresApproval: true,
    handler: async (_input, ctx) => callInner(ctx.auth),
  });

  // Mirrors the invoices create path, where the nested contacts read is
  // load-bearing and its refusal must not surface as a crash.
  server.registerOperation({
    operationId: "demo_outer_strict",
    moduleId: "demo",
    requiredCapabilities: ["module.demo.read"],
    riskLevel: "low",
    requiresApproval: false,
    handler: async (_input, ctx) =>
      server.callGatewayMethod(
        "demo_inner_write",
        { via: "nested" },
        {
          ...(ctx.auth ? { auth: ctx.auth } : {}),
        }
      ),
  });

  server.registerOperation({
    operationId: "demo_outer_read",
    moduleId: "demo",
    requiredCapabilities: ["module.demo.read"],
    riskLevel: "low",
    requiresApproval: false,
    handler: async (_input, ctx) => callInner(ctx.auth),
  });

  const app = createApiApp({
    approvalService: createApprovalService(createFakeApprovalDb().client),
    registry,
    config: { securityJwtSecret: SECRET },
    dataDir: "/tmp",
    resolvePath: (p) => p,
    auditLog: createNoopAuditLog(),
    tenantPluginOverrides: {
      getOverrides: async () => ({}),
      setOverride: async () => undefined,
    },
  });
  return { app, innerCalls };
}

async function invoke(
  app: ReturnType<typeof makeApp>["app"],
  operationId: string,
  token: string
) {
  return await app.request(`/api/operations/${operationId}/invoke`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ input: {} }),
  });
}

describe("in-process gate through the module operation transport", () => {
  it("lets an approved outer operation run its gated nested call", async () => {
    const { app, innerCalls } = makeApp();
    const token = await agentToken(["module.demo.write"]);

    const gated = await invoke(app, "demo_outer_write", token);
    expect(gated.status).toBe(202);
    const gatedBody = (await gated.json()) as {
      error: { details?: { approvalRequestId?: string } };
    };
    const requestId = gatedBody.error.details?.approvalRequestId;
    expect(requestId).toBeTruthy();
    expect(innerCalls).toHaveLength(0);

    const decided = await app.request(
      `/api/security/approvals/${requestId}/decision`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ decision: "allow_once" }),
      }
    );
    expect(decided.status).toBe(200);

    const allowed = await invoke(app, "demo_outer_write", token);
    expect(allowed.status).toBe(200);
    // The grant was spent by the outer call; the nested gated call runs on the
    // strength of that same approval, not on a second one.
    expect(await allowed.json()).toMatchObject({
      data: { nested: "executed" },
    });
    expect(innerCalls).toHaveLength(1);
  });

  it("denies a gated nested call made from a plain read", async () => {
    const { app, innerCalls } = makeApp();
    const token = await agentToken(["module.demo.read", "module.demo.write"]);

    const res = await invoke(app, "demo_outer_read", token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { nested: "denied" },
    });
    expect(innerCalls).toHaveLength(0);
  });

  it("denies a nested call the caller has no capability for", async () => {
    const { app, innerCalls } = makeApp();
    const token = await agentToken(["module.demo.read"]);

    const res = await invoke(app, "demo_outer_read", token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { nested: string; reason: string };
    };
    expect(body.data.nested).toBe("denied");
    expect(body.data.reason).toMatch(/missing capability: module.demo.write/);
    expect(innerCalls).toHaveLength(0);
  });

  it("answers 403, not 500, when an uncaught nested call is refused", async () => {
    const { app, innerCalls } = makeApp();
    const token = await agentToken(["module.demo.read"]);

    const res = await invoke(app, "demo_outer_strict", token);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("in_process_policy_denied");
    expect(innerCalls).toHaveLength(0);
  });
});
