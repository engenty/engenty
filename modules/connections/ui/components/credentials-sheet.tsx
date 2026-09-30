import { useTranslation } from "@engenty/i18n/ui";
import { PlatformSettingsPanel } from "@engenty/platform-settings/ui";
import { useMutation, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { requestConnectorSetup } from "../api.js";
import { connectionsKeys } from "../queries.js";

/** The fields of a catalog connector this file reads. */
export interface CredentialsConnector {
  id: string;
  /** The env feature its OAuth client belongs to (`connections-google`). */
  module_id: string;
  name: string;
}

/**
 * A connector's OAuth client for this Organisation, in place — the same
 * store as Setup → Integration keys, filtered to this connector's keys.
 */
export function CredentialsSheet({
  connector,
  onOpenChange,
  open,
}: {
  connector: CredentialsConnector;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation("connections");
  const { isSuperAdmin } = useWorkspaceContext();
  const queryClient = useQueryClient();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("sheet.credentialsTitle", { name: connector.name })}
          </DialogTitle>
          <DialogDescription>
            {t("sheet.credentialsHint", { name: connector.name })}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {open ? (
            <PlatformSettingsPanel
              feature={connector.module_id}
              layout="sheet"
              onChanged={() => {
                void queryClient.invalidateQueries({
                  queryKey: connectionsKeys.all,
                });
              }}
              scope="tenant"
            />
          ) : null}
          {isSuperAdmin ? (
            <p className="pt-4 text-muted-foreground text-xs">
              {t("sheet.credentialsPlatform")}{" "}
              <Link className="underline" to="/setup/platform">
                {t("sheet.credentialsPlatformLink")}
              </Link>
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * An OAuth connector nobody can connect yet: an admin adds the credentials
 * right here, anyone else asks the admins.
 */
export function NeedsCredentialsAffordance({
  connector,
  size = "sm",
}: {
  connector: CredentialsConnector;
  size?: "sm" | "default";
}) {
  const { t } = useTranslation("connections");
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const ask = useMutation({
    mutationFn: () => requestConnectorSetup(connector.id),
    onError: (error) => {
      toast.error(
        t("sheet.askAdminFailed", {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    },
  });

  if (isSuperAdmin || isTenantAdmin) {
    return (
      <>
        <Button
          onClick={() => setOpen(true)}
          size={size}
          type="button"
          variant="outline"
        >
          {t("sheet.setCredentials")}
        </Button>
        <CredentialsSheet
          connector={connector}
          onOpenChange={setOpen}
          open={open}
        />
      </>
    );
  }
  if (ask.isSuccess) {
    return (
      <span className="text-muted-foreground text-xs">
        {t("sheet.askedAdmin")}
      </span>
    );
  }
  return (
    <Button
      disabled={ask.isPending}
      onClick={() => ask.mutate()}
      size={size}
      type="button"
      variant="outline"
    >
      {t("sheet.askAdmin")}
    </Button>
  );
}
