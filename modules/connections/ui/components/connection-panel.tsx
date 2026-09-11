import { useTranslation } from "@engenty/i18n/ui";
import { Badge } from "@engenty/ui-core";
import { toast } from "sonner";
import type { CatalogConnection, CatalogConnector } from "../api.js";
import { useSetConnectionPolicyMutation } from "../queries.js";
import { AutonomousModeCallout } from "./autonomous-mode-callout.js";
import { ConnectionAgentsCard } from "./connection-agents-card.js";
import { ConnectionSettingsCard } from "./connection-settings-card.js";
import { PermissionsMatrix } from "./permissions-matrix.js";

export interface ConnectionPanelProps {
  connection: CatalogConnection;
  connector: CatalogConnector;
  /** False for non-owners of shared connections: matrix + settings read-only. */
  editable: boolean;
  /** Hide the settings card (e.g. compact admin rows). */
  showSettings?: boolean;
}

/** Header + permission matrix + settings for one connection. */
export function ConnectionPanel({
  connection,
  connector,
  editable,
  showSettings = true,
}: ConnectionPanelProps) {
  const { t } = useTranslation("connections");
  const setPolicy = useSetConnectionPolicyMutation();

  const label =
    connection.display_name ?? connection.external_account ?? connector.name;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-base">{label}</h3>
        <StatusBadge connection={connection} />
        {connection.sharing === "org" ? (
          <Badge variant="outline">{t("sharing.orgBadge")}</Badge>
        ) : null}
      </div>
      {connection.status === "error" && connection.error_message ? (
        <p className="text-destructive text-sm">
          {t("detail.connectionError", { error: connection.error_message })}
        </p>
      ) : null}

      <AutonomousModeCallout connection={connection} editable={editable} />

      {showSettings ? (
        <ConnectionSettingsCard
          connection={connection}
          connector={connector}
          disabled={!editable}
        />
      ) : null}

      {/* Where this account has been lent out (CN.5). Renders nothing until
          there is a grant to show — granting itself happens on the agent. */}
      <ConnectionAgentsCard connectionId={connection.id} editable={editable} />

      <div className="space-y-1">
        <h4 className="font-medium text-sm">{t("matrix.title")}</h4>
        <p className="text-muted-foreground text-xs">
          {t("matrix.description")}
        </p>
      </div>
      {editable ? null : (
        <p className="text-muted-foreground text-xs">
          {t("matrix.readOnlyNotice")}
        </p>
      )}
      <PermissionsMatrix
        actions={connector.actions}
        disabled={!editable || setPolicy.isPending}
        onSetPolicy={(selector, policy) => {
          setPolicy.mutate(
            { connection_id: connection.id, policy, selector },
            {
              onError: (error) => {
                toast.error(
                  t("toasts.policySaveFailed", { error: error.message })
                );
              },
            }
          );
        }}
        overrides={connection.policies}
      />
    </section>
  );
}

export function StatusBadge({
  connection,
}: {
  connection: Pick<CatalogConnection, "status">;
}) {
  const { t } = useTranslation("connections");
  if (connection.status === "active") {
    return <Badge variant="secondary">{t("status.active")}</Badge>;
  }
  return (
    <Badge className="border-destructive/40 text-destructive" variant="outline">
      {t(`status.${connection.status}`)}
    </Badge>
  );
}
