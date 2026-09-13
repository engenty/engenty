import {
  registerConnectorModule,
  removeConnectorDefinition,
} from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerExternalConnectorRoutes } from "./api/routes.js";
import { buildImportedConnector } from "./build-connector.js";
import { createExternalConnectorsRepo } from "./repo.js";
import type { ImportedConnectorRecord } from "./types.js";

/**
 * External (imported) connectors provider. Unlike the hand-written providers,
 * definitions here are data: superadmins import OpenAPI/MCP sources (found via
 * the integrations.sh registry or a pasted URL) and this plugin materializes
 * them into ordinary connectors at boot — policy, approvals, accounts, audit
 * and the agent tool surface all come from the framework unchanged.
 */
const registerExternalConnectorsPlugin: EngentyPluginFactory = async (
  engenty
) => {
  const { server } = engenty;
  // Phase A seam note (PLAN-tenant-isolation-a-rls-seam.md): this provider stays
  // on the SERVICE lane by design. module_external_connectors carries no
  // tenant_id — it is the platform-level registry of imported connector specs
  // (admin-managed, incl. encrypted client credentials), boot-materialized for
  // the whole instance. Fail-closed doctrine: the tenant lane has no grants on
  // it; tenant data never lives here.
  const supabaseRaw = server.getServiceDb?.() ?? null;
  if (!supabaseRaw) {
    throw new Error("External connectors provider requires Supabase");
  }
  const supabase = supabaseRaw as SupabaseClient;
  const repo = createExternalConnectorsRepo(supabase);

  // Live record store: action handlers resolve their record through this map,
  // so refresh/credential updates apply without re-binding already-registered
  // operation closures. Module-local is safe — routes and handlers below share
  // this jiti instance.
  const liveRecords = new Map<string, ImportedConnectorRecord>();

  const registerRecord = (record: ImportedConnectorRecord): string[] => {
    liveRecords.set(record.id, record);
    const { connector, skippedActions } = buildImportedConnector(record, () =>
      liveRecords.get(record.id)
    );
    // Latest definition wins in the shared registry; duplicate operation ids
    // are warn-skipped by core (add-only), which registerRecord tolerates.
    registerConnectorModule(engenty, connector);
    return skippedActions;
  };

  const removeRecord = (id: string): void => {
    liveRecords.delete(id);
    removeConnectorDefinition(id);
  };

  registerExternalConnectorRoutes(server, {
    registerRecord,
    removeRecord,
    repo,
  });

  // Boot: register every enabled import. One rotten record must not take the
  // provider down — report a diagnostic and continue; the console shows the
  // record via the list route either way.
  let records: ImportedConnectorRecord[] = [];
  try {
    records = await repo.listEnabled();
  } catch (error) {
    engenty.diagnostics.report({
      code: "external_connectors.load_failed",
      level: "warn",
      message: `cannot load imported connectors: ${
        error instanceof Error ? error.message : String(error)
      }`,
      remediation:
        "Apply the module_external_connectors migration (pnpm engenty db migrate), then restart.",
    });
    return;
  }
  for (const record of records) {
    try {
      const skipped = registerRecord(record);
      if (skipped.length > 0) {
        engenty.diagnostics.report({
          code: "external_connectors.actions_skipped",
          level: "warn",
          message: `${record.id}: skipped ${skipped.length} action(s) with unconvertible schemas`,
        });
      }
    } catch (error) {
      engenty.diagnostics.report({
        code: "external_connectors.register_failed",
        level: "error",
        message: `failed to register "${record.id}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        remediation:
          "Refresh or re-import the connector from the import console.",
      });
    }
  }
};

export default registerExternalConnectorsPlugin;
