import { computeInvoiceLines } from "@engenty/entitlements";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type { BillingDal, InvoiceRecord } from "../dal/billing.js";
import { registerBillingRoutes } from "./routes/billing-routes.js";

async function signToken(capabilities: string[]) {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "service",
    token_type: "access",
    auth_method: "oauth",
    capabilities,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("service-user")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("test-secret"));
}

const CONFIG = {
  securityJwtSecret: "test-secret",
  supabaseUrl: "http://127.0.0.1:54321",
  supabaseServiceRoleKey: "test-service-role",
};

const teamPricing = {
  base_micros: 49_000_000,
  currency: "usd",
  includedUsers: 25,
  perExtraUser_micros: 5_000_000,
};

/** Stateful fake billing DAL that computes real totals via computeInvoiceLines. */
function createStatefulDal(): BillingDal {
  const store = new Map<string, InvoiceRecord>();
  let seq = 0;
  return {
    listInvoices: async (tenantId) =>
      [...store.values()].filter((i) => i.tenant_id === tenantId),
    getInvoice: async (id) => store.get(id) ?? null,
    generateInvoice: async (tenantId, period, usageOverride) => {
      const comp = computeInvoiceLines(
        { pricing: teamPricing },
        { userCount: usageOverride?.userCount ?? 30, aiCostMicros: 0 }
      );
      const invoice: InvoiceRecord = {
        id: `inv-${++seq}`,
        tenant_id: tenantId,
        package_id: "team",
        period_start: period.start,
        period_end: period.end,
        currency: comp.currency,
        total_micros: comp.totalMicros,
        status: "draft",
        created_at: "2026-07-14T00:00:00.000Z",
        lines: [],
      };
      store.set(invoice.id, invoice);
      return invoice;
    },
    setInvoiceStatus: async (id, status) => {
      const inv = store.get(id);
      if (inv) {
        store.set(id, { ...inv, status });
      }
    },
    revenueSummary: async () => {
      const rows = [...store.values()];
      return {
        totalMicros: rows.reduce((s, r) => s + r.total_micros, 0),
        invoiceCount: rows.length,
        byStatus: {},
      };
    },
  };
}

function createApp() {
  const app = new OpenAPIHono();
  const dal = createStatefulDal();
  registerBillingRoutes({ app, config: CONFIG, createDal: () => dal });
  return app;
}

const headers = async () => ({
  authorization: `Bearer ${await signToken(["core.superadmin"])}`,
  "content-type": "application/json",
});

describe("billing routes", () => {
  it("gates invoices behind superadmin", async () => {
    const app = createApp();
    const nonAdmin = await signToken(["core.plugins.manage"]);
    const res = await app.request("/api/superadmin/tenants/t1/invoices", {
      headers: { authorization: `Bearer ${nonAdmin}` },
    });
    expect(res.status).toBe(403);
  });

  it("requires a period to generate", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/superadmin/tenants/t1/invoices/generate",
      { method: "POST", headers: await headers(), body: JSON.stringify({}) }
    );
    expect(res.status).toBe(400);
  });

  it("generates an invoice, lists it, and advances its status", async () => {
    const app = createApp();
    const h = await headers();

    const gen = await app.request(
      "/api/superadmin/tenants/t1/invoices/generate",
      {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          period_start: "2026-07-01",
          period_end: "2026-07-31",
        }),
      }
    );
    expect(gen.status).toBe(200);
    const invoice = ((await gen.json()) as { data: InvoiceRecord }).data;
    // 30 users, 25 included -> base 49 + 5*5 = 74M
    expect(invoice.total_micros).toBe(49_000_000 + 25_000_000);

    const list = await app.request("/api/superadmin/tenants/t1/invoices", {
      headers: h,
    });
    expect(
      ((await list.json()) as { data: { invoices: InvoiceRecord[] } }).data
        .invoices
    ).toHaveLength(1);

    const status = await app.request(
      `/api/superadmin/invoices/${invoice.id}/status`,
      { method: "POST", headers: h, body: JSON.stringify({ status: "paid" }) }
    );
    expect(status.status).toBe(200);

    const bad = await app.request(
      `/api/superadmin/invoices/${invoice.id}/status`,
      { method: "POST", headers: h, body: JSON.stringify({ status: "nope" }) }
    );
    expect(bad.status).toBe(400);
  });
});
