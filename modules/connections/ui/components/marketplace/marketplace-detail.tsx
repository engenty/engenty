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
import { Plug } from "lucide-react";
import { useState } from "react";
import { MarketplaceConnect } from "./marketplace-connect.js";
import {
  accountLabel,
  isRecommendedPlugin,
  isTenantImportedPlugin,
  type MarketplaceAccount,
  type MarketplacePlugin,
} from "./marketplace-model.js";
import { PluginMark } from "./marketplace-row.js";

/**
 * One plugin inside a Space: the Space's accounts for it (every agent and
 * member of the Space uses them), Connect to add one, and enable / remove the
 * plugin on the Space.
 */
export function MarketplaceDetail({
  onAdd,
  onAuthenticated,
  onDisable,
  onUninstall,
  onUseRest,
  plugin,
  pluginMounted,
  saving,
  spaceId,
}: {
  onAdd: () => void | Promise<void>;
  onAuthenticated: (connectionId?: string) => void;
  onDisable: () => void;
  onUninstall: () => void;
  onUseRest?: () => void;
  /** `connections` = this Space's accounts only. */
  plugin: MarketplacePlugin;
  pluginMounted: boolean;
  saving: boolean;
  /** The Space accounts connect into. */
  spaceId: string;
}) {
  const { t } = useTranslation("connections");
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const imported = isTenantImportedPlugin(plugin);
  const accounts = plugin.connections;
  const added = pluginMounted || accounts.length > 0;

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
          {t("marketplace.spaceAccounts")}
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
                <AccountRow
                  account={account}
                  key={account.id}
                  pluginName={plugin.name}
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
        {pluginMounted ? (
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

function AccountRow({
  account,
  pluginName,
}: {
  account: MarketplaceAccount;
  pluginName: string;
}) {
  const { t } = useTranslation("connections");
  const failing = account.status === "error" || account.status === "revoked";
  return (
    <li className="flex items-center justify-between gap-3 border-border-soft border-b px-3 py-3 last:border-b-0">
      <span className="min-w-0 truncate font-medium text-sm">
        {accountLabel(account, pluginName)}
      </span>
      <span
        className={
          failing
            ? "shrink-0 text-destructive text-sm"
            : "shrink-0 text-muted-foreground text-sm"
        }
      >
        {failing
          ? t(`status.${account.status}`)
          : t("marketplace.usedThisSpace")}
      </span>
    </li>
  );
}
