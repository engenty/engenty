// Tenant enumeration for the multi-tenant scheduler. The scheduler is
// platform infrastructure: it reconciles triggers and system-job schedules
// for EVERY tenant, minting a per-tenant service token for each. The list
// comes straight off core.tenants via the service-role client because there
// is no per-tenant principal to ask on the AI runtime's own behalf.
//
// SERVICE lane (Phase A residual, on purpose): this is the sweep pattern —
// ENUMERATE tenants on the service client, then do each tenant's work on a
// tenant-locked handle (see system-jobs.ts). A tenant handle could never list
// other tenants: core.tenants only exposes the caller's own row to the
// engenty_server role.
import { createLogger } from "@engenty/telemetry";
import { createAiDatabaseAdapter } from "../infra/database.js";

const logger = createLogger({ name: "scheduler" });

export async function listTenantIds(): Promise<string[]> {
  const db = createAiDatabaseAdapter();
  if (!db) {
    logger.warn("scheduler: no database adapter — cannot enumerate tenants");
    return [];
  }
  const { data, error } = await db
    .schema("core")
    .from("tenants")
    .select("id")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`scheduler: tenant enumeration failed — ${error.message}`);
  }
  return ((data ?? []) as { id: string }[]).map((row) => String(row.id));
}
