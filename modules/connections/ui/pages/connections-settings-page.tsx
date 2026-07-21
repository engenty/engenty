import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@engenty/ui-core";
import { connectorLogoSvg } from "@engenty/ui-icons";
import {
  type PageBreadcrumb,
  usePageConfig,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import { Cable } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { CatalogConnection, CatalogConnector } from "../api.js";
import { ConnectButton } from "../components/connect-button.js";
import { ConnectCredentialsDialog } from "../components/connect-credentials-dialog.js";
import { StatusBadge } from "../components/connection-panel.js";
import { getConnectorConnectButton } from "../extensions.js";
import { useConnectionsCatalogQuery } from "../queries.js";

export const CONNECTIONS_SETTINGS_PATH = "/settings/connections";

/**
 * Surface the OAuth callback outcome (`?connected=1` / `?error=...`) as a
 * toast and strip the params from the URL.
 */
export function useConnectResultToast() {
  const { t } = useTranslation("connections");
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (!(connected || error)) {
      return;
    }
    if (connected) {
      toast.success(t("toasts.connected"));
    } else if (error) {
      toast.error(t("toasts.connectFailed", { error }));
    }
    const next = new URLSearchParams(searchParams);
    next.delete("connected");
    next.delete("error");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, t]);
}

export function ConnectionsSettingsPage() {
  const { t } = useTranslation("connections");
  const navigate = useNavigate();
  const { currentUserId } = useWorkspaceContext();
  const { data, isLoading } = useConnectionsCatalogQuery();

  useConnectResultToast();

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [
      { label: t("breadcrumb.settings"), to: "/settings" },
      { label: t("breadcrumb.connections") },
    ],
    [t]
  );

  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    topbarChrome: "contentBlend",
  });

  const connectors = data?.connectors ?? [];

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-4xl space-y-4 pt-4">
        {isLoading ? (
          <ConnectorListSkeleton />
        ) : connectors.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("catalog.empty")}</EmptyTitle>
              <EmptyDescription>
                {t("catalog.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {connectors.map((connector) => (
              <ConnectorCard
                connector={connector}
                currentUserId={currentUserId}
                key={connector.id}
                onManage={() =>
                  navigate(`${CONNECTIONS_SETTINGS_PATH}/${connector.id}`)
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ConnectorCard({
  connector,
  currentUserId,
  onManage,
}: {
  connector: CatalogConnector;
  currentUserId: string | null;
  onManage: () => void;
}) {
  const { t } = useTranslation("connections");
  const myConnections = visibleConnections(connector, currentUserId);
  const hasConnection = myConnections.length > 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ConnectorIcon icon={connector.icon} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-sm">{connector.name}</h3>
          <p className="line-clamp-2 text-muted-foreground text-xs">
            {connector.description}
          </p>
        </div>
      </div>

      <div className="min-h-6 space-y-1">
        {hasConnection ? (
          myConnections.map((connection) => (
            <div
              className="flex flex-wrap items-center gap-2 text-sm"
              key={connection.id}
            >
              <span className="truncate">
                {connection.display_name ??
                  connection.external_account ??
                  t("catalog.connected")}
              </span>
              <StatusBadge connection={connection} />
              {connection.sharing === "org" ? (
                <Badge variant="outline">{t("sharing.orgBadge")}</Badge>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("catalog.notConnected")}
          </p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-end gap-2">
        {hasConnection ? (
          <Button onClick={onManage} size="sm" type="button" variant="outline">
            {t("catalog.manage")}
          </Button>
        ) : null}
        <ConnectorConnectAffordance
          connector={connector}
          hasConnection={hasConnection}
        />
      </div>
    </Card>
  );
}

/**
 * OAuth connectors use the shared redirect ConnectButton; api_key connectors
 * get the generic credentials dialog (form fields come from the catalog);
 * browser connectors render whatever bespoke affordance their UI plugin
 * registered (e.g. the local-files folder picker).
 */
function ConnectorConnectAffordance({
  connector,
  hasConnection,
}: {
  connector: CatalogConnector;
  hasConnection: boolean;
}) {
  // OAuth connector with no client credentials anywhere (env/platform/tenant):
  // the connect flow would fail, so surface "Needs setup" instead of Connect.
  if (
    connector.auth_kind === "oauth2" &&
    !(connector.configured || hasConnection)
  ) {
    return <NeedsSetupAffordance />;
  }
  if (connector.auth_kind === "api_key") {
    return (
      <ConnectCredentialsDialog
        connector={connector}
        hasConnections={hasConnection}
      />
    );
  }
  if (connector.auth_kind !== "oauth2") {
    const Custom = getConnectorConnectButton(connector.id);
    if (Custom) {
      return (
        <Custom
          connectorId={connector.id}
          hasConnections={hasConnection}
          redirectTo={CONNECTIONS_SETTINGS_PATH}
        />
      );
    }
    return null;
  }
  return (
    <ConnectButton
      connectorId={connector.id}
      hasConnections={hasConnection}
      redirectTo={CONNECTIONS_SETTINGS_PATH}
      variant={hasConnection ? "outline" : "default"}
    />
  );
}

/**
 * Shown for an OAuth connector whose client credentials are not configured. The
 * admin sets them in Setup → Platform settings (or, per tenant, Integration
 * keys); a member sees only that it isn't available yet.
 */
function NeedsSetupAffordance() {
  const { t } = useTranslation("connections");
  return (
    <Button
      disabled
      size="sm"
      title={t("catalog.needsSetupHint", {
        defaultValue:
          "An admin must add this connector's OAuth credentials in Setup → Platform settings.",
      })}
      type="button"
      variant="outline"
    >
      {t("catalog.needsSetup", { defaultValue: "Needs setup" })}
    </Button>
  );
}

/** Connections the caller can see: own personal ones plus org-shared ones. */
export function visibleConnections(
  connector: CatalogConnector,
  currentUserId: string | null
): CatalogConnection[] {
  return connector.connections.filter(
    (c) => c.sharing === "org" || c.owner_user_id === currentUserId
  );
}

export function ConnectorIcon({ icon }: { icon: string | null }) {
  // Connector `icon` hints, in precedence order: `logo:<slug>` for a bundled
  // brand SVG, an emoji (render it), or anything else (icon NAMES would
  // render as raw text) falls back to the generic glyph.
  const logoSvg = connectorLogoSvg(icon);
  const isEmoji = Boolean(icon) && !/[\w\s-]/u.test(icon ?? "");
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-lg">
      {logoSvg ? (
        <img
          alt=""
          className="size-5 object-contain"
          height={20}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(logoSvg)}`}
          width={20}
        />
      ) : isEmoji ? (
        <span aria-hidden>{icon}</span>
      ) : (
        <Cable aria-hidden className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  );
}

function ConnectorListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton className="h-36 w-full" key={i} />
      ))}
    </div>
  );
}
