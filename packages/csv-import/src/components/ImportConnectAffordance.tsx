import { Button } from "@engenty/ui-core";
import type { CatalogConnector } from "../connection-import-api.js";
import type { ConnectionImportConfig } from "../types.js";
import { ImportConnectButton } from "./ImportConnectButton.js";
import { ImportConnectCredentialsDialog } from "./ImportConnectCredentialsDialog.js";

type ConnectionImportLabels = ConnectionImportConfig["labels"];

export function ImportConnectAffordance({
  connector,
  labels,
  onConnected,
  onError,
  redirectTo,
}: {
  connector: CatalogConnector;
  labels: ConnectionImportLabels;
  onConnected: () => void;
  onError?: (message: string) => void;
  redirectTo: string;
}) {
  if (connector.auth_kind === "oauth2") {
    return (
      <ImportConnectButton
        connectingLabel={labels.connecting}
        connectLabel={labels.connect}
        connectorId={connector.id}
        onError={onError}
        redirectTo={redirectTo}
      />
    );
  }
  if (connector.auth_kind === "api_key") {
    return (
      <ImportConnectCredentialsDialog
        connectLabel={labels.connect}
        connector={connector}
        onConnected={onConnected}
        onError={onError}
        submitLabel={labels.submitCredentials}
        title={labels.credentialsTitle}
      />
    );
  }
  // browser (e.g. local-files): settings owns the File System Access flow
  return (
    <Button asChild size="sm" type="button" variant="outline">
      <a href="/settings/connections">{labels.openSettings}</a>
    </Button>
  );
}
