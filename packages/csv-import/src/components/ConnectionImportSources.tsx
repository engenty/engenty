import { useQuery, useQueryClient } from "@engenty/query-client";
import { Button, Skeleton } from "@engenty/ui-core";
import { ConnectorLogoImg, connectorLogoSvg } from "@engenty/ui-icons";
import { Cable } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activeConnectionsForConnector,
  type CatalogConnection,
  type CatalogConnector,
  getConnectionsCatalog,
} from "../connection-import-api.js";
import {
  fetchConnectionFileText,
  fetchConnectionListRecordsText,
} from "../connection-import-fetch.js";
import type { ConnectionImportSource } from "../import-sources.js";
import type { ConnectionImportConfig } from "../types.js";
import { ConnectionFilePickerDialog } from "./ConnectionFilePickerDialog.js";
import { ImportConnectAffordance } from "./ImportConnectAffordance.js";

export type ConnectionImportLabels = ConnectionImportConfig["labels"];

export interface ConnectionImportSourcesProps {
  labels: ConnectionImportLabels;
  onError?: (message: string) => void;
  onFileLoaded: (content: string, filename: string) => void;
  redirectTo: string;
  sources: ConnectionImportSource[];
}

interface PickerTarget {
  connection: CatalogConnection;
  connector: CatalogConnector;
  source: ConnectionImportSource;
}

export function ConnectionImportSources({
  labels,
  onError,
  onFileLoaded,
  redirectTo,
  sources,
}: ConnectionImportSourcesProps) {
  const queryClient = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["import", "connections-catalog"],
    queryFn: ({ signal }) => getConnectionsCatalog(signal),
    staleTime: 15_000,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1" || params.get("error")) {
      void queryClient.invalidateQueries({
        queryKey: ["import", "connections-catalog"],
      });
      params.delete("connected");
      params.delete("error");
      const next = params.toString();
      const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", url);
    }
  }, [queryClient]);

  const rows = useMemo(() => {
    const connectors = catalogQuery.data?.connectors ?? [];
    const byId = new Map(connectors.map((c) => [c.id, c]));
    return sources
      .map((source) => {
        const connector = byId.get(source.connectorId);
        if (!connector) {
          return null;
        }
        return { connector, source };
      })
      .filter(
        (
          row
        ): row is {
          connector: CatalogConnector;
          source: ConnectionImportSource;
        } => row !== null
      );
  }, [catalogQuery.data?.connectors, sources]);

  const refreshCatalog = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["import", "connections-catalog"],
    });
  }, [queryClient]);

  const startUsingConnection = useCallback(
    async (
      source: ConnectionImportSource,
      connector: CatalogConnector,
      connection: CatalogConnection
    ) => {
      if (source.fetchMode === "pick_file") {
        setPicker({ connection, connector, source });
        return;
      }
      const key = `${connector.id}:${connection.id}`;
      setBusyKey(key);
      try {
        const result = await fetchConnectionListRecordsText({
          connection,
          connector,
          source,
        });
        onFileLoaded(result.content, result.filename);
      } catch (error) {
        onError?.(
          error instanceof Error ? error.message : "Failed to load records"
        );
      } finally {
        setBusyKey(null);
      }
    },
    [onError, onFileLoaded]
  );

  const onPickFile = useCallback(
    async (file: { name: string; ref: string }) => {
      if (!picker) {
        return;
      }
      const key = `${picker.connector.id}:${picker.connection.id}`;
      setBusyKey(key);
      const connectionId = picker.connection.id;
      setPicker(null);
      try {
        const result = await fetchConnectionFileText({
          connectionId,
          fallbackName: file.name,
          fileRef: file.ref,
        });
        onFileLoaded(result.content, result.filename);
      } catch (error) {
        onError?.(
          error instanceof Error ? error.message : "Failed to read file"
        );
      } finally {
        setBusyKey(null);
      }
    },
    [onError, onFileLoaded, picker]
  );

  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm">{labels.sectionTitle}</h3>

      {catalogQuery.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton className="h-12 w-full" key={`import-src-${i}`} />
          ))}
        </div>
      ) : rows.length === 0 ? null : (
        <ul className="divide-y rounded-lg border">
          {rows.map(({ connector, source }) => {
            const active = activeConnectionsForConnector(connector);
            const connected = active.length > 0;
            const primary = active[0];
            const rowBusy = busyKey?.startsWith(`${connector.id}:`) ?? false;

            return (
              <li
                className="flex items-center gap-3 px-3 py-2.5"
                key={connector.id}
              >
                {connectorLogoSvg(connector.icon) ? (
                  <ConnectorLogoImg
                    className="size-5 shrink-0 object-contain"
                    icon={connector.icon}
                    size={20}
                  />
                ) : (
                  <Cable
                    aria-hidden
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">
                    {connector.name}
                  </div>
                  <div className="truncate text-muted-foreground text-xs">
                    {connected
                      ? primary
                        ? `${labels.connected} · ${
                            primary.display_name ??
                            primary.external_account ??
                            connector.name
                          }`
                        : labels.connected
                      : labels.notConnected}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {connected && primary ? (
                    <Button
                      disabled={rowBusy}
                      onClick={() =>
                        void startUsingConnection(source, connector, primary)
                      }
                      size="sm"
                      type="button"
                    >
                      {labels.use}
                    </Button>
                  ) : (
                    <ImportConnectAffordance
                      connector={connector}
                      labels={labels}
                      onConnected={refreshCatalog}
                      onError={onError}
                      redirectTo={redirectTo}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {picker ? (
        <ConnectionFilePickerDialog
          browseEmptyLabel={labels.browseEmpty}
          cancelLabel={labels.cancel}
          connectionId={picker.connection.id}
          connectionLabel={
            picker.connection.display_name ??
            picker.connection.external_account ??
            picker.connector.name
          }
          description={labels.browseDescription}
          onOpenChange={(open) => {
            if (!open) {
              setPicker(null);
            }
          }}
          onPick={(file) => void onPickFile(file)}
          open
          title={labels.browseTitle}
        />
      ) : null}
    </div>
  );
}
