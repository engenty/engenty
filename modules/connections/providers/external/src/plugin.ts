import {
  createConnectionsRepo,
  encryptToken,
  registerConnectorModule,
  removeConnectorDefinition,
} from "@engenty/connections-sdk";
import type { EngentyPluginFactory } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerExternalConnectorRoutes } from "./api/routes.js";
import { buildImportedConnector } from "./build-connector.js";
import {
  applyImportedRefresh,
  withImportedAccessToken,
} from "./refresh-actions.js";
import { createExternalConnectorsRepo } from "./repo.js";
import type { ImportedConnectorRecord } from "./types.js";

function liveKey(
  record: Pick<ImportedConnectorRecord, "id" | "tenant_id">
): string {
  return `${record.tenant_id}::${record.id}`;
}

/**
 * External (imported) connectors provider. Definitions are data: tenant admins
 * import OpenAPI/MCP sources (found via the integrations.sh registry or a
 * pasted URL) and this plugin materializes them into ordinary connectors at
 * boot — keyed `${tenantId}::${id}` so one tenant's import is not listed or
 * executed as another's. Builtins stay code, not rows.
 */
const registerExternalConnectorsPlugin: EngentyPluginFactory = async (
  engenty
) => {
  const { events, server } = engenty;
  // Boot lists every tenant on the SERVICE lane so each import can register
  // under its tenant key. Request handlers stamp tenant_id from auth and the
  // tenant-lane RLS keeps one tenant from reading another's rows.
  const supabaseRaw = server.getServiceDb?.() ?? null;
  if (!supabaseRaw) {
    throw new Error("External connectors provider requires Supabase");
  }
  const supabase = supabaseRaw as SupabaseClient;
  const repo = createExternalConnectorsRepo(supabase);
  const connectionsRepo = createConnectionsRepo(supabase);

  const liveRecords = new Map<string, ImportedConnectorRecord>();

  const persistOAuthClient = async (
    record: ImportedConnectorRecord,
    creds: { clientId: string; clientSecret: string }
  ): Promise<void> => {
    const current = liveRecords.get(liveKey(record)) ?? record;
    const client_id_enc = encryptToken(creds.clientId);
    const client_secret_enc = creds.clientSecret
      ? encryptToken(creds.clientSecret)
      : null;
    await repo.update(current.tenant_id, current.id, {
      client_id_enc,
      client_secret_enc,
    });
    liveRecords.set(liveKey(current), {
      ...current,
      client_id_enc,
      client_secret_enc,
    });
  };

  const registerRecord = (record: ImportedConnectorRecord): string[] => {
    liveRecords.set(liveKey(record), record);
    const { connector, skippedActions } = buildImportedConnector(
      record,
      () => liveRecords.get(liveKey(record)),
      (creds) => persistOAuthClient(record, creds)
    );
    registerConnectorModule(engenty, connector);
    return skippedActions;
  };

  const removeRecord = (id: string, tenantId: string): void => {
    liveRecords.delete(`${tenantId}::${id}`);
    removeConnectorDefinition(id, tenantId);
  };

  registerExternalConnectorRoutes(server, {
    connectionsRepo,
    registerRecord,
    removeRecord,
    repo,
  });

  events.modules.on("connections.connected", async (payload, context) => {
    const connectorId =
      typeof payload.connector_id === "string" ? payload.connector_id : null;
    const tenantId = context.tenantId;
    if (!(connectorId && tenantId)) {
      return;
    }
    const record = await repo.get(tenantId, connectorId);
    if (record?.source_kind !== "mcp" || record.actions.length > 0) {
      return;
    }
    try {
      await withImportedAccessToken({
        connectionsRepo,
        record,
        use: async (accessToken) => {
          if (!accessToken) {
            return;
          }
          await applyImportedRefresh({
            accessToken,
            record,
            registerRecord,
            repo,
          });
        },
      });
    } catch (error) {
      engenty.diagnostics.report({
        code: "external_connectors.refresh_after_connect_failed",
        level: "warn",
        message: `could not list tools for "${connectorId}" after connect: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  });

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
