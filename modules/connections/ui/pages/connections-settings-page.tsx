import {
  useSettingsSecondaryShellNav,
  useSetupSecondaryShellNav,
} from "@engenty/app-shell";
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
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import type { CatalogConnection, CatalogConnector } from "../api.js";
import { ConnectButton } from "../components/connect-button.js";
import { ConnectCredentialsDialog } from "../components/connect-credentials-dialog.js";
import { StatusBadge } from "../components/connection-panel.js";
import { getConnectorConnectButton } from "../extensions.js";
import { useConnectionsSettingsAgentUiSlice } from "../hooks/use-connections-agent-ui-slice.js";
import { useConnectionsCatalogQuery } from "../queries.js";

export const CONNECTIONS_SETTINGS_PATH = "/setup/connections";

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
      // A fresh connection ships with autonomous use OFF — without this hint
      // the first signal is an inexplicably empty inbox days later.
      toast.success(t("toasts.connected"), {
        description: t("toasts.connectedAutonomyHint"),
      });
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
  const { isSuperAdmin, isTenantAdmin, currentUserId } = useWorkspaceContext();
  const { t } = useTranslation("connections");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const setupNav = useSetupSecondaryShellNav(tCommon("navigation.setup"));
  const settingsNav = useSettingsSecondaryShellNav(t("breadcrumb.settings"));
  const { moduleRootCrumb, secondaryNavHeaderSlot } =
    isSuperAdmin || isTenantAdmin ? setupNav : settingsNav;
  const { data, isLoading } = useConnectionsCatalogQuery();
  // PLAN-spaces.md CN.4 Flow A — arriving from a space's "Add account". The
  // space rides the URL so it survives this page, the provider round trip and
  // the callback, which is what turns "connect an account" into "this space can
  // use this account". `back` returns the user where they started; without it
  // a connect from a space would end on the tenant settings page, which is not
  // where they were working.
  const [flowParams] = useSearchParams();
  const fromSpaceId = flowParams.get("space")?.trim() || null;
  const backTo = flowParams.get("back")?.trim();
  const returnPath =
    backTo?.startsWith("/") && !backTo.startsWith("//")
      ? backTo
      : CONNECTIONS_SETTINGS_PATH;

  useConnectResultToast();

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("breadcrumb.connections") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
  });

  const connectors = data?.connectors ?? [];

  useConnectionsSettingsAgentUiSlice({ connectors });

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
                returnPath={returnPath}
                spaceId={fromSpaceId}
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
  returnPath = CONNECTIONS_SETTINGS_PATH,
  spaceId = null,
}: {
  connector: CatalogConnector;
  currentUserId: string | null;
  onManage: () => void;
  /** Where the OAuth callback returns to — the space, when one sent us here. */
  returnPath?: string;
  /** Space to mount the new account into on success (CN.4 Flow A). */
  spaceId?: string | null;
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
              {connection.all_spaces ? (
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
          returnPath={returnPath}
          spaceId={spaceId}
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
  returnPath = CONNECTIONS_SETTINGS_PATH,
  spaceId = null,
}: {
  connector: CatalogConnector;
  hasConnection: boolean;
  returnPath?: string;
  spaceId?: string | null;
}) {
  // OAuth connector with no client credentials anywhere (env/platform/tenant):
  // the connect flow would fail, so surface "Needs setup" instead of Connect.
  if (
    connector.auth_kind === "oauth2" &&
    !(connector.configured || connector.dcr_available || hasConnection)
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
          redirectTo={returnPath}
          spaceId={spaceId}
        />
      );
    }
    return null;
  }
  return (
    <ConnectButton
      connectorId={connector.id}
      hasConnections={hasConnection}
      redirectTo={returnPath}
      spaceId={spaceId}
      variant={hasConnection ? "outline" : "default"}
    />
  );
}

/**
 * Shown for an OAuth connector whose client credentials are not configured
 * anywhere (env, platform settings, this tenant's overrides).
 *
 * It used to be a disabled button with a tooltip, which is the same dead end
 * for both people who see it: an admin who could fix it in a minute was told
 * to hunt for a page, and a member was told to do something they cannot do.
 * So it now branches on who is looking — a link for the person with the power
 * to act, and a plain sentence naming the ask for everyone else
 * (PLAN-spaces.md CN.2).
 */
function NeedsSetupAffordance() {
  const { t } = useTranslation("connections");
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  if (isSuperAdmin || isTenantAdmin) {
    return (
      <Button asChild size="sm" type="button" variant="outline">
        <Link to="/settings/integration-keys">
          {t("catalog.needsSetupAdmin", { defaultValue: "Set up \u2192" })}
        </Link>
      </Button>
    );
  }
  return (
    <span className="text-muted-foreground text-xs">
      {t("catalog.needsSetupMember", {
        defaultValue: "Ask an admin to set this up",
      })}
    </span>
  );
}

/** Connections the caller can see: own accounts plus all-spaces. */
export function visibleConnections(
  connector: CatalogConnector,
  currentUserId: string | null
): CatalogConnection[] {
  return connector.connections.filter(
    (c) => c.all_spaces === true || c.owner_user_id === currentUserId
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
