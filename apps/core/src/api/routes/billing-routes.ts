import type { OpenAPIHono } from "@hono/zod-openapi";
import { createBillingDal, type InvoiceStatus } from "../../dal/billing.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireSuperAdmin } from "./authz.js";

const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "open", "paid", "void"];

/**
 * Superadmin billing routes (docs/internal/manage-app.md §8). List/generate invoices
 * per tenant, advance invoice status (incl. the dunning -> suspend flow the
 * manage app drives), and a revenue overview. `createDal` is injectable.
 */
export function registerBillingRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  createDal?: typeof createBillingDal;
}) {
  const { app, config } = params;
  const dal = (params.createDal ?? createBillingDal)(config);

  app.get("/api/superadmin/tenants/:id/invoices", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const invoices = await dal.listInvoices(c.req.param("id"));
    return jsonApiSuccess(c, { invoices });
  });

  app.post("/api/superadmin/tenants/:id/invoices/generate", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      period_start?: string;
      period_end?: string;
    };
    if (!(body.period_start && body.period_end)) {
      return jsonApiError(c, 400, {
        message: "period_start and period_end are required",
      });
    }
    const invoice = await dal.generateInvoice(c.req.param("id"), {
      start: body.period_start,
      end: body.period_end,
    });
    return jsonApiSuccess(c, invoice);
  });

  app.get("/api/superadmin/invoices/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const invoice = await dal.getInvoice(c.req.param("id"));
    if (!invoice) {
      return jsonApiError(c, 404, { message: "Invoice not found" });
    }
    return jsonApiSuccess(c, invoice);
  });

  app.post("/api/superadmin/invoices/:id/status", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = (await c.req.json().catch(() => ({}))) as { status?: string };
    if (!INVOICE_STATUSES.includes(body.status as InvoiceStatus)) {
      return jsonApiError(c, 400, {
        message: `status must be one of: ${INVOICE_STATUSES.join(", ")}`,
      });
    }
    await dal.setInvoiceStatus(c.req.param("id"), body.status as InvoiceStatus);
    return jsonApiSuccess(c, { updated: true });
  });

  app.get("/api/superadmin/billing/revenue", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    return jsonApiSuccess(c, await dal.revenueSummary());
  });
}
