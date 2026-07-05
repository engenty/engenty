import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Skeleton,
  Switch,
} from "@engenty/ui-core";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { InboxAccount } from "../api.js";
import {
  useInboxAccountsQuery,
  useRunSyncNowMutation,
  useUpdateSyncSettingsMutation,
} from "../queries.js";

export function InboxSettingsPage() {
  const { t } = useTranslation("inbox");
  const navigate = useNavigate();
  const accountsQuery = useInboxAccountsQuery();
  const accounts = accountsQuery.data?.accounts ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Button
          onClick={() => navigate("/mdl/inbox")}
          size="sm"
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="font-semibold text-xl">{t("settings.title")}</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        {t("settings.description")}{" "}
        <Link className="underline" to="/settings/connections">
          {t("settings.connectionsLink")}
        </Link>
      </p>

      {accountsQuery.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : accountsQuery.isError ? (
        // An errored query is NOT "no accounts" — showing the empty state
        // here sends users hunting in the wrong place (connections setup).
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("errors.loadFailed")}</EmptyTitle>
            <EmptyDescription>
              {String(accountsQuery.error)}
            </EmptyDescription>
          </EmptyHeader>
          <Button
            onClick={() => accountsQuery.refetch()}
            size="sm"
            variant="outline"
          >
            {t("errors.retry")}
          </Button>
        </Empty>
      ) : accounts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("settings.noAccounts")}</EmptyTitle>
            <EmptyDescription>
              {t("settings.noAccountsDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <AccountRow account={account} key={account.connection_id} />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountRow({ account }: { account: InboxAccount }) {
  const { t } = useTranslation("inbox");
  const updateSettings = useUpdateSyncSettingsMutation();
  const syncNow = useRunSyncNowMutation();
  const state = account.sync_state;
  const autonomousOff = account.autonomous_mode === "off";

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">
              {account.display_name ??
                account.external_account ??
                account.connector_id}
            </span>
            <Badge variant="secondary">
              {t(`filters.${account.sharing === "org" ? "org" : "personal"}`)}
            </Badge>
          </div>
          <span className="text-muted-foreground text-xs">
            {account.connector_id}
            {account.external_account ? ` · ${account.external_account}` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            {t("settings.syncEnabled")}
            <Switch
              checked={state?.sync_enabled ?? true}
              disabled={updateSettings.isPending}
              onCheckedChange={(checked) =>
                updateSettings.mutate(
                  {
                    connection_id: account.connection_id,
                    sync_enabled: checked,
                  },
                  {
                    onError: (error) =>
                      toast.error(
                        t("toasts.settingsFailed", { error: String(error) })
                      ),
                  }
                )
              }
            />
          </label>
          <Button
            disabled={syncNow.isPending || autonomousOff}
            onClick={() =>
              syncNow.mutate(
                { connection_id: account.connection_id },
                {
                  onError: (error) =>
                    toast.error(
                      t("toasts.syncFailed", { error: String(error) })
                    ),
                  onSuccess: (result) => {
                    const entry = result.connections[0];
                    toast.success(
                      t("toasts.syncDone", { count: entry?.new_messages ?? 0 })
                    );
                  },
                }
              )
            }
            size="sm"
            variant="outline"
          >
            <RefreshCw
              className={syncNow.isPending ? "size-4 animate-spin" : "size-4"}
            />
            {t("actions.syncNow")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          {t("settings.backfillDays")}
          <Input
            className="w-24"
            defaultValue={state?.backfill_days ?? 90}
            disabled={updateSettings.isPending}
            min={1}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (
                Number.isInteger(value) &&
                value >= 1 &&
                value !== (state?.backfill_days ?? 90)
              ) {
                updateSettings.mutate({
                  backfill_days: value,
                  connection_id: account.connection_id,
                });
              }
            }}
            type="number"
          />
        </label>
        <span className="text-muted-foreground text-xs">
          {state?.last_synced_at
            ? t("settings.lastSynced", {
                at: new Date(state.last_synced_at).toLocaleString(),
              })
            : t("settings.neverSynced")}
        </span>
      </div>

      {autonomousOff ? (
        <p className="text-amber-600 text-xs dark:text-amber-500">
          {t("settings.autonomousOff")}{" "}
          <Link
            className="underline"
            to={`/settings/connections/${account.connector_id}`}
          >
            {t("settings.autonomousOffLink")}
          </Link>
        </p>
      ) : null}
      {state?.last_error ? (
        <p className="text-destructive text-xs">
          {t("settings.lastError", { error: state.last_error })}
        </p>
      ) : null}
    </Card>
  );
}
