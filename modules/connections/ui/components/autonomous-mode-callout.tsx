// The "why is nothing happening" fix for fresh connections: autonomous use
// defaults to OFF, which means no background sync and no agent (scheduled or
// headless) may touch the connection — and until this callout existed the
// only signal was an empty inbox and a dial buried in the settings card.
// Rendered on the connection detail; offers the two enable levels one click
// away instead of making the user discover the select.
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { toast } from "sonner";
import type { CatalogConnection, ConnectionAutonomousMode } from "../api.js";
import { useUpdateConnectionSettingsMutation } from "../queries.js";

export interface AutonomousModeCalloutProps {
  connection: CatalogConnection;
  /** Non-owners see the explanation but cannot flip the dial. */
  editable: boolean;
}

export function AutonomousModeCallout({
  connection,
  editable,
}: AutonomousModeCalloutProps) {
  const { t } = useTranslation("connections");
  const updateSettings = useUpdateConnectionSettingsMutation();

  if (connection.autonomous_mode !== "off") {
    return null;
  }

  const enable = (mode: ConnectionAutonomousMode) => {
    updateSettings.mutate(
      { autonomous_mode: mode, connection_id: connection.id },
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

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5">
      <p className="font-medium text-amber-700 text-sm dark:text-amber-400">
        {t("autonomousCallout.title")}
      </p>
      <p className="text-muted-foreground text-xs">
        {t("autonomousCallout.description")}
      </p>
      {editable ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            disabled={updateSettings.isPending}
            onClick={() => enable("read_only")}
            size="sm"
            variant="outline"
          >
            {t("autonomousCallout.enableReadOnly")}
          </Button>
          <Button
            disabled={updateSettings.isPending}
            onClick={() => enable("full")}
            size="sm"
            variant="outline"
          >
            {t("autonomousCallout.enableFull")}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("autonomousCallout.askOwner")}
        </p>
      )}
    </div>
  );
}
