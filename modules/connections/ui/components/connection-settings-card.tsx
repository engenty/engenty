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
  Card,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useState } from "react";
import { toast } from "sonner";
import type {
  CatalogConnection,
  CatalogConnector,
  ConnectionAutonomousMode,
  ConnectionSharing,
  ConnectorActionGroup,
} from "../api.js";
import {
  useDisconnectConnectionMutation,
  useUpdateConnectionSettingsMutation,
} from "../queries.js";

/** Sentinel for the `null` (no cap) value in the non-owner-cap select. */
const NO_CAP_VALUE = "none";

const AUTONOMOUS_MODES: ConnectionAutonomousMode[] = [
  "off",
  "read_only",
  "full",
];

const NON_OWNER_CAPS = [NO_CAP_VALUE, "read", "write", "destructive"] as const;

export interface ConnectionSettingsCardProps {
  connection: CatalogConnection;
  connector: CatalogConnector;
  disabled?: boolean;
}

/**
 * Sharing / autonomous-mode / non-owner-cap / display-name settings plus the
 * disconnect action for one connection.
 */
export function ConnectionSettingsCard({
  connection,
  connector,
  disabled,
}: ConnectionSettingsCardProps) {
  const { t } = useTranslation("connections");
  const updateSettings = useUpdateConnectionSettingsMutation();
  const disconnect = useDisconnectConnectionMutation();

  const [displayName, setDisplayName] = useState(connection.display_name ?? "");
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const busy = disabled || updateSettings.isPending || disconnect.isPending;

  const saveSettings = (
    patch: Omit<Parameters<typeof updateSettings.mutate>[0], "connection_id">
  ) => {
    updateSettings.mutate(
      { connection_id: connection.id, ...patch },
      {
        onError: (error) => {
          toast.error(t("toasts.settingsSaveFailed", { error: error.message }));
        },
        onSuccess: () => {
          toast.success(t("toasts.settingsSaved"));
        },
      }
    );
  };

  const commitDisplayName = () => {
    const next = displayName.trim() === "" ? null : displayName.trim();
    if (next !== (connection.display_name ?? null)) {
      saveSettings({ display_name: next });
    }
  };

  const handleDisconnect = () => {
    disconnect.mutate(connection.id, {
      onError: (error) => {
        toast.error(t("toasts.disconnectFailed", { error: error.message }));
      },
      onSuccess: () => {
        setDisconnectOpen(false);
        toast.success(t("toasts.disconnected"));
      },
    });
  };

  const fieldId = (name: string) => `connection-${connection.id}-${name}`;

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Label className="w-44 shrink-0 text-sm" htmlFor={fieldId("name")}>
            {t("settings.displayName")}
          </Label>
          <Input
            className="max-w-[320px] flex-1"
            disabled={busy}
            id={fieldId("name")}
            onBlur={commitDisplayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("settings.displayNamePlaceholder")}
            value={displayName}
          />
        </div>

        <div className="flex items-center gap-4">
          <Label className="w-44 shrink-0 text-sm" htmlFor={fieldId("sharing")}>
            {t("sharing.label")}
          </Label>
          <Select
            disabled={busy}
            onValueChange={(value) =>
              saveSettings({ sharing: value as ConnectionSharing })
            }
            value={connection.sharing}
          >
            <SelectTrigger className="max-w-[320px]" id={fieldId("sharing")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">{t("sharing.personal")}</SelectItem>
              <SelectItem value="org">{t("sharing.org")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {connection.sharing === "org" ? (
          <div className="flex items-start gap-4">
            <Label
              className="w-44 shrink-0 pt-2.5 text-sm"
              htmlFor={fieldId("cap")}
            >
              {t("settings.nonOwnerMaxGroup")}
            </Label>
            <div className="max-w-[320px] flex-1 space-y-1">
              <Select
                disabled={busy}
                onValueChange={(value) =>
                  saveSettings({
                    non_owner_max_group:
                      value === NO_CAP_VALUE
                        ? null
                        : (value as ConnectorActionGroup),
                  })
                }
                value={connection.non_owner_max_group ?? NO_CAP_VALUE}
              >
                <SelectTrigger className="w-full" id={fieldId("cap")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NON_OWNER_CAPS.map((cap) => (
                    <SelectItem key={cap} value={cap}>
                      {t(`settings.nonOwnerCap.${cap}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {t("settings.nonOwnerMaxGroupHelp")}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex items-start gap-4">
          <Label
            className="w-44 shrink-0 pt-2.5 text-sm"
            htmlFor={fieldId("autonomous")}
          >
            {t("settings.autonomousMode")}
          </Label>
          <div className="max-w-[320px] flex-1 space-y-1">
            <Select
              disabled={busy}
              onValueChange={(value) =>
                saveSettings({
                  autonomous_mode: value as ConnectionAutonomousMode,
                })
              }
              value={connection.autonomous_mode}
            >
              <SelectTrigger className="w-full" id={fieldId("autonomous")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTONOMOUS_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`settings.autonomous.${mode}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t("settings.autonomousModeHelp")}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end border-border border-t pt-4">
          <Button
            disabled={busy}
            onClick={() => setDisconnectOpen(true)}
            type="button"
            variant="destructive"
          >
            {t("settings.disconnect")}
          </Button>
        </div>
      </div>

      <AlertDialog onOpenChange={setDisconnectOpen} open={disconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.disconnectTitle", {
                name:
                  connection.display_name ??
                  connection.external_account ??
                  connector.name,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.disconnectDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 hover:text-white"
              disabled={disconnect.isPending}
              onClick={handleDisconnect}
            >
              {disconnect.isPending
                ? t("settings.disconnecting")
                : t("settings.disconnectConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
