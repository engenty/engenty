import {
  buildAgentUiPageBrief,
  useRegisterAgentUiSlice,
} from "@engenty/app-shell";
import { useMemo } from "react";
import type { CatalogConnection, CatalogConnector } from "../api.js";

interface ConnectionListRow {
  connection: CatalogConnection;
  connector: CatalogConnector;
}

function connectionLabel(row: ConnectionListRow): string {
  const account =
    row.connection.display_name?.trim() ||
    row.connection.external_account?.trim();
  if (account) {
    return `${row.connector.name} — ${account}`;
  }
  return row.connector.name;
}

export function useConnectionsWorkspaceAgentUiSlice(input: {
  rows: ConnectionListRow[];
}) {
  const slice = useMemo(() => {
    const preview = input.rows.slice(0, 10).map((row) => ({
      id: row.connection.id,
      label: connectionLabel(row),
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "list",
          page_title: "Connections",
          page_description: `Connections workspace list (${input.rows.length} connection(s)).`,
          list_total: input.rows.length,
          list_preview: preview,
        }),
      },
    };
  }, [input.rows]);

  useRegisterAgentUiSlice("connections.workspace", slice);
}

export function useConnectionsConnectorDetailAgentUiSlice(input: {
  connector: CatalogConnector | null;
  connectorId: string | undefined;
}) {
  const slice = useMemo(() => {
    if (!(input.connectorId && input.connector)) {
      return null;
    }
    const name = input.connector.name?.trim() || input.connectorId;
    const connectionCount = input.connector.connections?.length ?? 0;
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "detail",
          page_title: name,
          page_description: `Viewing connector "${name}" (${connectionCount} connection(s)).`,
        }),
        connector_id: input.connector.id,
        connector_name: name,
      },
      selection: {
        entity_id: input.connector.id,
        entity_type: "connector",
      },
    };
  }, [input.connector, input.connectorId]);

  useRegisterAgentUiSlice("connections.connector-detail", slice);
}

export function useConnectionsSettingsAgentUiSlice(input: {
  connectors: CatalogConnector[];
}) {
  const slice = useMemo(() => {
    const preview = input.connectors.slice(0, 10).map((c) => ({
      id: c.id,
      label: c.name?.trim() || c.id,
    }));
    return {
      page: {
        ...buildAgentUiPageBrief({
          page_type: "settings",
          page_title: "Connections settings",
          page_description: `Connections settings catalog (${input.connectors.length} connector(s)).`,
          list_total: input.connectors.length,
          list_preview: preview,
        }),
      },
    };
  }, [input.connectors]);

  useRegisterAgentUiSlice("connections.settings", slice);
}

/** Thin brief for the OAuth popup complete landing page. */
export function useConnectionsConnectCompleteAgentUiSlice() {
  const slice = useMemo(
    () => ({
      page: {
        ...buildAgentUiPageBrief({
          page_type: "connect-complete",
          page_title: "Connect complete",
          page_description:
            "OAuth connect popup completion page (reporting result to opener).",
        }),
      },
    }),
    []
  );

  useRegisterAgentUiSlice("connections.connect-complete", slice);
}
