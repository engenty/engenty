import { createClient } from "@supabase/supabase-js";
import type { BillingUsage } from "../lib/entitlements-contract.js";
import { requireEntitlements } from "../lib/entitlements-runtime.js";
import { createPackagesDal, type PackagesDal } from "./packages.js";
import { resolveSupabaseConfig } from "./supabase-config.js";

export type InvoiceStatus = "draft" | "open" | "paid" | "void";

export interface InvoiceLineRecord {
  amount_micros: number;
  description: string;
  id: string;
  invoice_id: string;
  kind: string;
  quantity: number;
  unit_price_micros: number;
}

export interface InvoiceRecord {
  created_at: string;
  currency: string;
  id: string;
  lines?: InvoiceLineRecord[];
  package_id: string | null;
  period_end: string;
  period_start: string;
  status: InvoiceStatus;
  tenant_id: string;
  total_micros: number;
}

export interface RevenueSummary {
  byStatus: Record<string, { count: number; totalMicros: number }>;
  invoiceCount: number;
  totalMicros: number;
}

export interface BillingDal {
  /**
   * Generate an invoice for a tenant + period from its package pricing and the
   * period's metered usage (seats from membership; AI cost passed in, default 0
   * until the usage rollup feed lands).
   */
  generateInvoice: (
    tenantId: string,
    period: { start: string; end: string },
    usageOverride?: Partial<BillingUsage>
  ) => Promise<InvoiceRecord>;
  getInvoice: (id: string) => Promise<InvoiceRecord | null>;
  listInvoices: (tenantId: string) => Promise<InvoiceRecord[]>;
  revenueSummary: () => Promise<RevenueSummary>;
  setInvoiceStatus: (id: string, status: InvoiceStatus) => Promise<void>;
}

export function createBillingDal(
  config: Record<string, unknown>,
  deps: { packagesDal?: PackagesDal } = {}
): BillingDal {
  const { url, serviceRoleKey } = resolveSupabaseConfig(config);
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const packagesDal = deps.packagesDal ?? createPackagesDal(config);
  const invoices = () => client.schema("core").from("invoices");
  const lineItems = () => client.schema("core").from("invoice_line_items");
  const memberships = () => client.schema("core").from("user_tenant_roles");

  async function countMembers(tenantId: string): Promise<number> {
    const { count, error } = await memberships()
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (error) {
      throw new Error(`Failed to count members: ${error.message}`);
    }
    return count ?? 0;
  }

  async function getInvoice(id: string): Promise<InvoiceRecord | null> {
    const { data, error } = await invoices()
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load invoice ${id}: ${error.message}`);
    }
    if (!data) {
      return null;
    }
    const { data: lines, error: lineError } = await lineItems()
      .select("*")
      .eq("invoice_id", id);
    if (lineError) {
      throw new Error(`Failed to load invoice lines: ${lineError.message}`);
    }
    return {
      ...(data as InvoiceRecord),
      lines: (lines ?? []) as InvoiceLineRecord[],
    };
  }

  async function listInvoices(tenantId: string): Promise<InvoiceRecord[]> {
    const { data, error } = await invoices()
      .select("*")
      .eq("tenant_id", tenantId)
      .order("period_start", { ascending: false });
    if (error) {
      throw new Error(`Failed to list invoices: ${error.message}`);
    }
    return (data ?? []) as InvoiceRecord[];
  }

  async function generateInvoice(
    tenantId: string,
    period: { start: string; end: string },
    usageOverride: Partial<BillingUsage> = {}
  ): Promise<InvoiceRecord> {
    const packageId = await packagesDal.getTenantPackageId(tenantId);
    const pkg = packageId ? await packagesDal.getPackage(packageId) : null;
    const userCount = usageOverride.userCount ?? (await countMembers(tenantId));
    const usage: BillingUsage = {
      userCount,
      aiCostMicros: usageOverride.aiCostMicros ?? 0,
    };
    const computation = requireEntitlements().computeInvoiceLines(
      pkg ?? { pricing: undefined },
      usage
    );

    const { data: invoice, error } = await invoices()
      .insert({
        tenant_id: tenantId,
        package_id: packageId,
        period_start: period.start,
        period_end: period.end,
        currency: computation.currency,
        total_micros: computation.totalMicros,
        status: "draft",
      })
      .select("*")
      .single();
    if (error) {
      throw new Error(`Failed to create invoice: ${error.message}`);
    }
    const invoiceRow = invoice as InvoiceRecord;

    if (computation.lines.length > 0) {
      const { error: lineError } = await lineItems().insert(
        computation.lines.map((line) => ({
          invoice_id: invoiceRow.id,
          kind: line.kind,
          description: line.description,
          quantity: line.quantity,
          unit_price_micros: line.unitPriceMicros,
          amount_micros: line.amountMicros,
        }))
      );
      if (lineError) {
        throw new Error(`Failed to insert invoice lines: ${lineError.message}`);
      }
    }

    return { ...invoiceRow, lines: [] };
  }

  async function setInvoiceStatus(
    id: string,
    status: InvoiceStatus
  ): Promise<void> {
    const { error } = await invoices().update({ status }).eq("id", id);
    if (error) {
      throw new Error(`Failed to set invoice status: ${error.message}`);
    }
  }

  async function revenueSummary(): Promise<RevenueSummary> {
    const { data, error } = await invoices().select("status, total_micros");
    if (error) {
      throw new Error(`Failed to load revenue summary: ${error.message}`);
    }
    const rows = (data ?? []) as Array<{
      status: string;
      total_micros: number;
    }>;
    const byStatus: RevenueSummary["byStatus"] = {};
    let totalMicros = 0;
    for (const row of rows) {
      totalMicros += row.total_micros;
      const bucket = byStatus[row.status] ?? { count: 0, totalMicros: 0 };
      bucket.count += 1;
      bucket.totalMicros += row.total_micros;
      byStatus[row.status] = bucket;
    }
    return { totalMicros, invoiceCount: rows.length, byStatus };
  }

  return {
    listInvoices,
    getInvoice,
    generateInvoice,
    setInvoiceStatus,
    revenueSummary,
  };
}
