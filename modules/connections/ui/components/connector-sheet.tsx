import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Lock, Users } from "lucide-react";
import { useState } from "react";
import type { ConnectorUsage } from "../api.js";
import { useCanManageSpaceConnections } from "../hooks/use-connection-space.js";
import { type ConnectionsOwner, ownerTarget } from "../lib/connection-space.js";
import { AccountRow } from "./account-row.js";
import { ConnectionPanel } from "./connection-panel.js";
import { CredentialsSheet } from "./credentials-sheet.js";
import { MarketplaceConnect } from "./marketplace/marketplace-connect.js";
import {
  isRecommendedPlugin,
  isTenantImportedPlugin,
  type MarketplacePlugin,
} from "./marketplace/marketplace-model.js";
import { PluginMark } from "./marketplace/marketplace-row.js";

/**
 * One connector for one owner — a Space or the viewer: its accounts (each
 * opens its settings, permissions and disconnect in place), connect another,
 * its credentials, and for a Space whether the plugin is enabled there. The
 * dialog, the person's page and the Organisation's catalog all show this.
 */
export function ConnectorSheet({
  canMount,
  focusConnectionId = null,
  onAdd,
  onAuthenticated,
  onDisable,
  onUninstall,
  onUseRest,
  owner,
  plugin,
  pluginMounted,
  saving,
  usage,
}: {
  /** May enable / remove the plugin on the Space (tenant admin). */
  canMount: boolean;
  /** Open with this account's settings expanded. */
  focusConnectionId?: string | null;
  onAdd?: () => void | Promise<void>;
  onAuthenticated: (connectionId?: string) => void;
  onDisable?: () => void;
  onUninstall?: () => void;
  onUseRest?: () => void;
  owner: ConnectionsOwner | null;
  /** `connections` = this owner's accounts only. */
  plugin: MarketplacePlugin;
  pluginMounted: boolean;
  saving: boolean;
  /** Organisation-wide counts (the admin catalog), never account names. */
  usage?: ConnectorUsage | null;
}) {
  const { t } = useTranslation("connections");
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const isAdmin = isSuperAdmin || isTenantAdmin;
  const target = owner ? ownerTarget(owner) : null;
  const editable = useCanManageSpaceConnections(target);
  const [expandedId, setExpandedId] = useState<string | null>(
    focusConnectionId
  );
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const imported = isTenantImportedPlugin(plugin);
  const accounts = plugin.connections;
  const spaceOwner = owner && owner !== "me" ? owner : null;
  const added = pluginMounted || accounts.length > 0;
  const oauthClient = plugin.auth_kind === "oauth2" && !imported;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <PluginMark className="size-10" icon={plugin.icon} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-base">{plugin.name}</h2>
          <p className="text-muted-foreground text-sm">
            {plugin.description || plugin.id}
          </p>
          {owner ? (
            <p className="mt-1 inline-flex items-center gap-1 text-muted-foreground text-xs">
              {spaceOwner ? (
                <Users aria-hidden className="size-3" />
              ) : (
                <Lock aria-hidden className="size-3" />
              )}
              {spaceOwner
                ? t("sheet.forSpace", {
                    name: spaceOwner.spaceName ?? t("sheet.ownerSpaceUnknown"),
                  })
                : t("sheet.forMe")}
            </p>
          ) : null}
        </div>
        {spaceOwner && canMount && onAdd && !(added || imported) ? (
          <Button disabled={saving} onClick={() => void onAdd()} type="button">
            {t("marketplace.add")}
          </Button>
        ) : null}
      </div>

      {owner ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-sm">
            {t("sheet.accounts")}
          </h3>
          <div className="overflow-hidden rounded-xl bg-muted/70">
            {accounts.length === 0 ? (
              <EmptyAccount
                onAuthenticated={onAuthenticated}
                onUseRest={onUseRest}
                plugin={plugin}
                spaceId={target}
              />
            ) : (
              <ul>
                {accounts.map((account) => {
                  const expanded = expandedId === account.id;
                  return (
                    <li
                      className="border-border-soft border-b last:border-b-0"
                      key={account.id}
                    >
                      <AccountRow
                        connection={account}
                        fallbackLabel={plugin.name}
                        showOwner={false}
                        trailing={
                          <Button
                            onClick={() =>
                              setExpandedId(expanded ? null : account.id)
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {expanded
                              ? t("sheet.hide")
                              : editable
                                ? t("sheet.manage")
                                : t("sheet.details")}
                          </Button>
                        }
                      />
                      {expanded ? (
                        <div className="border-border-soft border-t bg-background px-4 py-4">
                          <ConnectionPanel
                            connection={account}
                            connector={plugin.connector}
                            editable={editable}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {accounts.length > 0 ? (
              <div className="border-border-soft border-t">
                <MarketplaceConnect
                  appearance="addRow"
                  hasConnections
                  onConnected={onAuthenticated}
                  plugin={plugin}
                  spaceId={target}
                />
              </div>
            ) : null}
          </div>
          {imported && (plugin.actions?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t("marketplace.toolsLoadAfterConnect")}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="font-medium text-sm">{t("marketplace.sectionInfo")}</h3>
        <dl className="overflow-hidden rounded-xl bg-muted/70 text-sm">
          <InfoRow
            label={t("marketplace.infoKind")}
            value={
              isRecommendedPlugin(plugin)
                ? t("marketplace.recommended")
                : t("marketplace.kindImported")
            }
          />
          <InfoRow
            label={t("marketplace.infoAuth")}
            value={t(`marketplace.auth.${plugin.auth_kind}`, {
              defaultValue: plugin.auth_kind,
            })}
          />
          {oauthClient ? (
            <div className="flex items-center justify-between gap-4 border-border-soft border-b px-3 py-2 last:border-b-0">
              <dt className="text-muted-foreground">
                {t("sheet.credentials")}
              </dt>
              <dd className="flex items-center gap-2">
                <span
                  className={
                    plugin.configured
                      ? "font-medium"
                      : "font-medium text-amber-600 dark:text-amber-500"
                  }
                >
                  {plugin.configured
                    ? t("sheet.credentialsReady")
                    : t("sheet.credentialsMissing")}
                </span>
                {isAdmin ? (
                  <Button
                    onClick={() => setCredentialsOpen(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {plugin.configured
                      ? t("sheet.editCredentials")
                      : t("sheet.setCredentials")}
                  </Button>
                ) : null}
              </dd>
            </div>
          ) : null}
          {usage ? (
            <>
              <InfoRow
                label={t("sheet.usageSpaces")}
                value={String(usage.space_count)}
              />
              <InfoRow
                label={t("sheet.usagePersons")}
                value={String(usage.person_count)}
              />
            </>
          ) : (
            <InfoRow
              label={t("marketplace.infoAccounts")}
              value={String(accounts.length)}
            />
          )}
          <InfoRow label={t("marketplace.infoId")} value={plugin.id} />
          {spaceOwner ? (
            <InfoRow
              label={t("marketplace.infoWhere")}
              value={added ? t("marketplace.added") : t("marketplace.notAdded")}
            />
          ) : null}
        </dl>
        {spaceOwner && canMount && pluginMounted && onDisable ? (
          <Button
            disabled={saving}
            onClick={onDisable}
            type="button"
            variant="outline"
          >
            {t("marketplace.removeFromSpace")}
          </Button>
        ) : null}
        {imported && isAdmin && onUninstall ? (
          <Button
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={saving}
            onClick={() => setConfirmUninstall(true)}
            type="button"
            variant="ghost"
          >
            {t("marketplace.uninstall")}
          </Button>
        ) : null}
      </section>

      {oauthClient && isAdmin ? (
        <CredentialsSheet
          connector={plugin}
          onOpenChange={setCredentialsOpen}
          open={credentialsOpen}
        />
      ) : null}

      <AlertDialog onOpenChange={setConfirmUninstall} open={confirmUninstall}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("marketplace.uninstallTitle", { name: plugin.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("marketplace.uninstallDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 hover:text-white"
              onClick={onUninstall}
            >
              {t("marketplace.uninstall")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** No account yet: the connect action, or why there is none to take. */
function EmptyAccount({
  onAuthenticated,
  onUseRest,
  plugin,
  spaceId,
}: {
  onAuthenticated: (connectionId?: string) => void;
  onUseRest?: () => void;
  plugin: MarketplacePlugin;
  spaceId: string | null;
}) {
  const { t } = useTranslation("connections");
  if (plugin.id === "figma-mcp-server") {
    return (
      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-sm">
            {t("marketplace.defaultAccount")}
          </span>
          <span className="font-medium text-amber-600 text-sm dark:text-amber-500">
            {t("marketplace.needsAuth")}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          {t("marketplace.figmaMcpBlocked", {
            defaultValue:
              "Figma has not approved Engenty for this server. There is no setup to fill in. A personal access token works on the REST connection.",
          })}
        </p>
        {onUseRest ? (
          <Button
            className="self-start"
            onClick={onUseRest}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("marketplace.openFigmaRest", {
              defaultValue: "Use Figma REST",
            })}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <span className="font-medium text-sm">
        {t("marketplace.defaultAccount")}
      </span>
      <span className="flex items-center gap-3">
        <span className="font-medium text-amber-600 text-sm dark:text-amber-500">
          {t("marketplace.needsAuth")}
        </span>
        <MarketplaceConnect
          hasConnections={false}
          onConnected={onAuthenticated}
          plugin={plugin}
          spaceId={spaceId}
        />
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-border-soft border-b px-3 py-2.5 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
