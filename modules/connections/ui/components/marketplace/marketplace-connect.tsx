import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { ConnectorCredentialField } from "../../api.js";
import { preferImportedToken } from "../../api.js";
import { getConnectorConnectButton } from "../../extensions.js";
import { ConnectButton } from "../connect-button.js";
import { ConnectCredentialsDialog } from "../connect-credentials-dialog.js";
import {
  isTenantImportedPlugin,
  type MarketplacePlugin,
} from "./marketplace-model.js";

export function MarketplaceConnect({
  appearance = "pill",
  hasConnections,
  onConnected,
  plugin,
  spaceId,
}: {
  /** `pill` sits on an account row. `addRow` is the “add another account” line. */
  appearance?: "addRow" | "pill";
  hasConnections: boolean;
  onConnected?: (connectionId?: string) => void | Promise<void>;
  plugin: MarketplacePlugin;
  spaceId?: string | null;
}) {
  const { t } = useTranslation("connections");
  const navigate = useNavigate();
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [tokenFields, setTokenFields] = useState<
    ConnectorCredentialField[] | null
  >(null);
  const [switching, setSwitching] = useState(false);
  const isAdmin = isSuperAdmin || isTenantAdmin;
  const addRow = appearance === "addRow";
  const label = addRow
    ? t("marketplace.addAccount")
    : t("marketplace.authenticate");
  const buttonClass = addRow
    ? "h-auto w-full justify-start rounded-none px-3 py-2.5 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
    : undefined;
  const buttonVariant = addRow ? "ghost" : "outline";
  const leading = addRow ? <Plus className="size-3.5" /> : undefined;

  const openTokenForm = async () => {
    setSwitching(true);
    try {
      const result = await preferImportedToken(plugin.id);
      if (!result.switched) {
        navigate("/settings/integration-keys");
        return;
      }
      setTokenFields(result.fields);
      setCredentialsOpen(true);
    } catch (error) {
      toast.error(
        t("toasts.connectStartFailed", {
          defaultValue: "Could not start the connect flow: {{error}}",
          error: error instanceof Error ? error.message : String(error),
        })
      );
    } finally {
      setSwitching(false);
    }
  };

  if (plugin.auth_kind === "none" || plugin.id === "figma-mcp-server") {
    return null;
  }

  if (tokenFields) {
    return (
      <>
        <Button
          className={buttonClass}
          onClick={() => setCredentialsOpen(true)}
          size="sm"
          type="button"
          variant={buttonVariant}
        >
          {leading}
          {label}
        </Button>
        <ConnectCredentialsDialog
          connector={{ ...plugin, credential_fields: tokenFields }}
          hasConnections={hasConnections}
          hideTrigger
          onConnected={(connectionId) => void onConnected?.(connectionId)}
          onOpenChange={setCredentialsOpen}
          open={credentialsOpen}
        />
      </>
    );
  }

  // OAuth that cannot start (no client, no DCR): a button, never dead copy.
  // Imported connectors try the spec's API token first (Figma REST).
  if (
    plugin.auth_kind === "oauth2" &&
    !plugin.configured &&
    !plugin.dcr_available
  ) {
    if (addRow) {
      return null;
    }
    if (!isAdmin) {
      return (
        <p className="text-muted-foreground text-xs">
          {t("catalog.needsSetupMember", {
            defaultValue: "Ask an admin to set this up",
          })}
        </p>
      );
    }
    if (isTenantImportedPlugin(plugin)) {
      return (
        <Button
          disabled={switching}
          onClick={() => void openTokenForm()}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("catalog.needsSetupAdmin", { defaultValue: "Set up →" })}
        </Button>
      );
    }
    return (
      <Button asChild size="sm" type="button" variant="outline">
        <Link to="/settings/integration-keys">
          {t("catalog.needsSetupAdmin", { defaultValue: "Set up →" })}
        </Link>
      </Button>
    );
  }
  if (plugin.auth_kind === "api_key") {
    return (
      <>
        <Button
          className={buttonClass}
          onClick={() => setCredentialsOpen(true)}
          size="sm"
          type="button"
          variant={buttonVariant}
        >
          {leading}
          {label}
        </Button>
        <ConnectCredentialsDialog
          connector={plugin}
          hasConnections={hasConnections}
          hideTrigger
          onConnected={(connectionId) => void onConnected?.(connectionId)}
          onOpenChange={setCredentialsOpen}
          open={credentialsOpen}
        />
      </>
    );
  }
  if (plugin.auth_kind !== "oauth2") {
    const Custom = getConnectorConnectButton(plugin.id);
    if (!Custom) {
      return null;
    }
    return (
      <Custom
        connectorId={plugin.id}
        hasConnections={hasConnections}
        onConnected={onConnected}
        redirectTo={`${window.location.pathname}${window.location.search}`}
        spaceId={spaceId}
      />
    );
  }
  return (
    <ConnectButton
      className={buttonClass}
      connectorId={plugin.id}
      flow="popup"
      hasConnections={hasConnections}
      label={label}
      leading={leading}
      onResult={(result) => {
        if (result.ok) {
          void onConnected?.();
        }
      }}
      size="sm"
      spaceId={spaceId}
      variant={buttonVariant}
    />
  );
}
