import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@engenty/ui-core";
import { useState } from "react";
import { toast } from "sonner";
import type { CatalogConnector } from "../api.js";
import { connectWithCredentials } from "../api.js";
import { connectionsKeys } from "../queries.js";

/**
 * Generic connect flow for `api_key` connectors: renders the credential form
 * the connector declared (labels only come from the catalog — values are only
 * ever sent to the connect route, never echoed back).
 */
export function ConnectCredentialsDialog({
  connector,
  hasConnections,
}: {
  connector: Pick<CatalogConnector, "credential_fields" | "id" | "name">;
  hasConnections: boolean;
}) {
  const { t } = useTranslation("connections");
  const queryClient = useQueryClient();
  const fields = connector.credential_fields ?? [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const submit = async () => {
    setBusy(true);
    try {
      await connectWithCredentials(connector.id, {
        credentials: values,
        sharing: "personal",
      });
      await queryClient.invalidateQueries({
        queryKey: connectionsKeys.catalog(),
      });
      setOpen(false);
      setValues({});
      toast.success(t("toasts.connected", { name: connector.name }));
    } catch (error) {
      toast.error(
        t("toasts.connectStartFailed", {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const requiredMissing = fields.some(
    (field) => field.required && !values[field.key]?.trim()
  );

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          type="button"
          variant={hasConnections ? "outline" : "default"}
        >
          {t("catalog.connect")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{connector.name}</DialogTitle>
          <DialogDescription>
            {t("credentials.description", {
              defaultValue:
                "Enter the credentials for this service. They are stored encrypted and never shown again.",
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {fields.map((field) => (
            <div className="flex flex-col gap-1.5" key={field.key}>
              <Label htmlFor={`cred-${field.key}`}>
                {field.label}
                {field.required ? null : (
                  <span className="ml-1 text-muted-foreground text-xs">
                    {t("credentials.optional", { defaultValue: "(optional)" })}
                  </span>
                )}
              </Label>
              <Input
                autoComplete="off"
                id={`cred-${field.key}`}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: event.target.value,
                  }))
                }
                placeholder={field.placeholder ?? undefined}
                type={field.secret ? "password" : "text"}
                value={values[field.key] ?? ""}
              />
            </div>
          ))}
          <DialogFooter className="mt-2">
            <Button disabled={busy || requiredMissing} size="sm" type="submit">
              {busy
                ? t("catalog.connecting")
                : t("credentials.submit", { defaultValue: "Connect" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
