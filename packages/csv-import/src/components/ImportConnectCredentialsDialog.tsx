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
import {
  type CatalogConnector,
  connectWithCredentials,
} from "../connection-import-api.js";

export interface ImportConnectCredentialsDialogProps {
  connectLabel: string;
  connector: Pick<CatalogConnector, "credential_fields" | "id" | "name">;
  onConnected: () => void;
  onError?: (message: string) => void;
  submitLabel: string;
  title: string;
}

/** api_key connect dialog for the import source picker. */
export function ImportConnectCredentialsDialog({
  connectLabel,
  connector,
  onConnected,
  onError,
  submitLabel,
  title,
}: ImportConnectCredentialsDialogProps) {
  const fields = connector.credential_fields ?? [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const submit = async () => {
    setBusy(true);
    try {
      await connectWithCredentials(connector.id, {
        credentials: values,
      });
      setOpen(false);
      setValues({});
      onConnected();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Failed to connect");
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
        <Button size="sm" type="button" variant="outline">
          {connectLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{connector.name}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {fields.map((field) => (
            <div className="space-y-1.5" key={field.key}>
              <Label htmlFor={`import-cred-${field.key}`}>{field.label}</Label>
              <Input
                autoComplete="off"
                id={`import-cred-${field.key}`}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
                placeholder={field.placeholder ?? undefined}
                type={field.secret ? "password" : "text"}
                value={values[field.key] ?? ""}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            disabled={busy || requiredMissing}
            onClick={() => void submit()}
            type="button"
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
