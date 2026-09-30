import { useSetupSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  CONNECTIONS_CATALOG_PATH,
  connectionsCatalogPath,
} from "@engenty/plugin-sdk";
import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  SettingsFormSection,
  Skeleton,
} from "@engenty/ui-core";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CatalogConnector, ConnectorUsage } from "../api.js";
import { ConnectorIcon } from "../components/connector-icon.js";
import { ConnectorSheet } from "../components/connector-sheet.js";
import {
  isTenantImportedPlugin,
  toMarketplacePlugin,
} from "../components/marketplace/marketplace-model.js";
import { getCatalogSections } from "../extensions.js";
import { useConnectResultToast } from "../hooks/use-connect-result-toast.js";
import { useConnectionsSettingsAgentUiSlice } from "../hooks/use-connections-agent-ui-slice.js";
import {
  useConnectionsCatalogQuery,
  useConnectionsUsageQuery,
} from "../queries.js";

type CredentialsState = "ready" | "missing" | "none";

function credentialsState(connector: CatalogConnector): CredentialsState {
  if (connector.auth_kind !== "oauth2") {
    return "none";
  }
  return connector.configured || connector.dcr_available ? "ready" : "missing";
}

/**
 * Setup → Connections: which services this Organisation offers — every
 * connector, whether its OAuth client is in place, and how many Spaces and
 * persons hold an account (counts only; personal accounts stay private). A
 * row opens the connector with its credentials form.
 */
export function ConnectionsCatalogPage() {
  const { t } = useTranslation("connections");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const { connectorId } = useParams<{ connectorId?: string }>();
  const { moduleRootCrumb, secondaryNavHeaderSlot } = useSetupSecondaryShellNav(
    tCommon("navigation.setup")
  );
  // Any owner's catalog lists every connector; the viewer's own is the one
  // an admin always has.
  const catalogQuery = useConnectionsCatalogQuery(null);
  const usageQuery = useConnectionsUsageQuery();
  const connectors = catalogQuery.data?.connectors ?? [];
  const usageById = useMemo(
    () =>
      new Map(
        (usageQuery.data?.usage ?? []).map((row) => [row.connector_id, row])
      ),
    [usageQuery.data]
  );
  const open = connectors.find((connector) => connector.id === connectorId);

  useConnectResultToast();
  useConnectionsSettingsAgentUiSlice({ connectors });

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("catalogPage.title") },
    ],
    [moduleRootCrumb, t]
  );
  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
  });

  const sections = getCatalogSections();

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-4xl space-y-8 pt-4">
        <SettingsFormSection
          cardVariant="flush"
          description={t("catalogPage.description")}
          title={t("catalogPage.title")}
        >
          <div className="hidden grid-cols-[minmax(0,1fr)_8rem_4rem_4rem_1rem] gap-3 border-border border-b px-4 py-2 text-muted-foreground text-xs sm:grid">
            <span>{t("catalogPage.colService")}</span>
            <span>{t("sheet.credentials")}</span>
            <span className="text-right">{t("catalogPage.colSpaces")}</span>
            <span className="text-right">{t("catalogPage.colPersons")}</span>
            <span />
          </div>
          {catalogQuery.isPending ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {connectors.map((connector) => (
                <CatalogRow
                  connector={connector}
                  key={connector.id}
                  onOpen={() => navigate(connectionsCatalogPath(connector.id))}
                  usage={usageById.get(connector.id) ?? null}
                />
              ))}
            </ul>
          )}
        </SettingsFormSection>
        {sections.map((Section, index) => (
          <Section key={index} />
        ))}
      </div>
      <Dialog
        onOpenChange={(next) => {
          if (!next) {
            navigate(CONNECTIONS_CATALOG_PATH);
          }
        }}
        open={Boolean(open)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{open?.name ?? ""}</DialogTitle>
            <DialogDescription>
              {t("catalogPage.description")}
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <ConnectorSheet
              canMount={false}
              onAuthenticated={() => undefined}
              owner={null}
              plugin={toMarketplacePlugin(open, [])}
              pluginMounted={false}
              saving={false}
              usage={usageById.get(open.id) ?? emptyUsage(open.id)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function emptyUsage(connectorId: string): ConnectorUsage {
  return {
    account_count: 0,
    connector_id: connectorId,
    person_count: 0,
    space_count: 0,
  };
}

function CatalogRow({
  connector,
  onOpen,
  usage,
}: {
  connector: CatalogConnector;
  onOpen: () => void;
  usage: ConnectorUsage | null;
}) {
  const { t } = useTranslation("connections");
  const state = credentialsState(connector);
  return (
    <li>
      <button
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_8rem_4rem_4rem_1rem]"
        onClick={onOpen}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
          <ConnectorIcon icon={connector.icon} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-sm">
              {connector.name}
            </span>
            <span className="block truncate text-muted-foreground text-xs">
              {isTenantImportedPlugin(connector)
                ? t("marketplace.kindImported")
                : connector.description}
            </span>
          </span>
        </span>
        <span
          className={cn(
            "text-xs",
            state === "missing"
              ? "text-amber-600 dark:text-amber-500"
              : "text-muted-foreground"
          )}
        >
          {state === "ready"
            ? t("sheet.credentialsReady")
            : state === "missing"
              ? t("sheet.credentialsMissing")
              : t("sheet.credentialsNone")}
        </span>
        <span className="hidden text-right text-sm tabular-nums sm:block">
          {usage?.space_count ?? 0}
        </span>
        <span className="hidden text-right text-sm tabular-nums sm:block">
          {usage?.person_count ?? 0}
        </span>
        <ChevronRight className="hidden size-4 text-muted-foreground/40 sm:block" />
      </button>
    </li>
  );
}
