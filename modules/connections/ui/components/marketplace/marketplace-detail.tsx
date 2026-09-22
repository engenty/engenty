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
  Switch,
} from "@engenty/ui-core";
import { Plug } from "lucide-react";
import { useState } from "react";
import { MarketplaceConnect } from "./marketplace-connect.js";
import {
  accountLabel,
  accountUses,
  isRecommendedPlugin,
  isTenantImportedPlugin,
  type MarketplaceAccount,
  type MarketplacePlugin,
} from "./marketplace-model.js";
import { PluginMark } from "./marketplace-row.js";

export function MarketplaceDetail({
  agentId,
  connectionMountIds,
  grantedIds,
  onAdd,
  onAuthenticated,
  onDisable,
  onGrant,
  onSetAllSpaces,
  onUninstall,
  onUseRest,
  plugin,
  pluginMounted,
  preferredOnAgent,
  saving,
  spaceId,
}: {
  agentId?: string | null;
  connectionMountIds: ReadonlySet<string>;
  grantedIds: ReadonlySet<string>;
  onAdd: () => void | Promise<void>;
  onAuthenticated: (connectionId?: string) => void;
  onDisable: () => void;
  onGrant: (connectionId: string, granted: boolean) => void;
  onSetAllSpaces: (connectionId: string, allSpaces: boolean) => void;
  onUninstall: () => void;
  onUseRest?: () => void;
  plugin: MarketplacePlugin;
  pluginMounted: boolean;
  /** Agent preferred-plugin list includes this connector (zero-account Add). */
  preferredOnAgent?: boolean;
  saving: boolean;
  spaceId?: string | null;
}) {
  const { t } = useTranslation("connections");
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const imported = isTenantImportedPlugin(plugin);
  const accounts = plugin.connections;
  const added =
    pluginMounted ||
    Boolean(preferredOnAgent) ||
    accounts.some(
      (account) =>
        connectionMountIds.has(account.id) || grantedIds.has(account.id)
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <PluginMark className="size-10" icon={plugin.icon} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-base">{plugin.name}</h2>
          <p className="text-muted-foreground text-sm">
            {plugin.description || plugin.id}
          </p>
        </div>
        {added || imported ? null : (
          <Button disabled={saving} onClick={() => void onAdd()} type="button">
            {t("marketplace.add")}
          </Button>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-muted-foreground text-sm">
          {t("marketplace.accounts")}
        </h3>
        <div className="overflow-hidden rounded-xl bg-muted/70">
          {accounts.length === 0 ? (
            plugin.id === "figma-mcp-server" ? (
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
            ) : (
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
            )
          ) : (
            <ul>
              {accounts.map((account) => (
                <AccountCard
                  account={account}
                  agentId={agentId}
                  connectionMountIds={connectionMountIds}
                  grantedIds={grantedIds}
                  key={account.id}
                  onGrant={onGrant}
                  onSetAllSpaces={onSetAllSpaces}
                  pluginName={plugin.name}
                  saving={saving}
                  spaceId={spaceId}
                />
              ))}
            </ul>
          )}
          {accounts.length > 0 ? (
            <div className="border-border-soft border-t">
              <MarketplaceConnect
                appearance="addRow"
                hasConnections
                onConnected={onAuthenticated}
                plugin={plugin}
                spaceId={spaceId}
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

      <section className="flex flex-col gap-2">
        <h3 className="text-muted-foreground text-sm">
          {t("marketplace.sectionApps", { count: 1 })}
        </h3>
        <div className="flex items-center gap-3 rounded-xl bg-muted/70 px-3 py-2.5">
          <Plug className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{plugin.id}</p>
            <p className="text-muted-foreground text-xs">
              {t("marketplace.connector")}
            </p>
          </div>
        </div>
      </section>

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
          <InfoRow
            label={t("marketplace.infoAccounts")}
            value={String(accounts.length)}
          />
          <InfoRow label={t("marketplace.infoId")} value={plugin.id} />
          <InfoRow
            label={t("marketplace.infoWhere")}
            value={added ? t("marketplace.added") : t("marketplace.notAdded")}
          />
        </dl>
        {spaceId && pluginMounted ? (
          <Button
            disabled={saving}
            onClick={onDisable}
            type="button"
            variant="outline"
          >
            {t("marketplace.removeFromSpace")}
          </Button>
        ) : null}
        {imported ? (
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-border-soft border-b px-3 py-2.5 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function AccountCard({
  account,
  agentId,
  connectionMountIds,
  grantedIds,
  onGrant,
  onSetAllSpaces,
  pluginName,
  saving,
  spaceId,
}: {
  account: MarketplaceAccount;
  agentId?: string | null;
  connectionMountIds: ReadonlySet<string>;
  grantedIds: ReadonlySet<string>;
  onGrant: (connectionId: string, granted: boolean) => void;
  onSetAllSpaces: (connectionId: string, allSpaces: boolean) => void;
  pluginName: string;
  saving: boolean;
  spaceId?: string | null;
}) {
  const { t } = useTranslation("connections");
  const uses = accountUses({
    account,
    grantedToAgent: Boolean(agentId) && grantedIds.has(account.id),
    mountedOnSpace: connectionMountIds.has(account.id),
  });
  const where = [
    uses.includes("thisSpace") ? t("marketplace.usedThisSpace") : null,
    uses.includes("allSpaces") ? t("marketplace.usedAllSpaces") : null,
    uses.includes("thisAgent") ? t("marketplace.usedThisAgent") : null,
  ].filter(Boolean);
  return (
    <li className="flex items-center justify-between gap-3 border-border-soft border-b px-3 py-3 last:border-b-0">
      <span className="min-w-0 truncate font-medium text-sm">
        {accountLabel(account, pluginName)}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span className="text-muted-foreground text-sm">
          {where.length > 0 ? where.join(" · ") : pluginName}
        </span>
        {agentId ? (
          <Button
            disabled={saving}
            onClick={() => onGrant(account.id, !grantedIds.has(account.id))}
            size="sm"
            type="button"
            variant="outline"
          >
            {grantedIds.has(account.id)
              ? t("marketplace.revokeAgent")
              : t("marketplace.useOnAgent")}
          </Button>
        ) : null}
        {spaceId || agentId ? (
          <Switch
            aria-label={t("sharing.allSpaces")}
            checked={Boolean(account.all_spaces)}
            disabled={saving}
            onCheckedChange={(checked) => onSetAllSpaces(account.id, checked)}
          />
        ) : null}
      </span>
    </li>
  );
}
