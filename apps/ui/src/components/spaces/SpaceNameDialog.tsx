/**
 * One name, one field: a new section, a section's new name, a room's new
 * title. Enter submits, Escape cancels, an empty name does nothing.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@engenty/ui-core";
import { useId, useState } from "react";
import type { SpaceNameDialogRequest } from "./space-conversation-sidebar-context";

export function SpaceNameDialog({
  onOpenChange,
  request,
}: {
  onOpenChange: (open: boolean) => void;
  request: SpaceNameDialogRequest | null;
}) {
  const { t } = useTranslation("common");
  const inputId = useId();
  return (
    <Dialog onOpenChange={onOpenChange} open={request != null}>
      {request ? (
        <SpaceNameDialogBody
          inputId={inputId}
          onClose={() => onOpenChange(false)}
          request={request}
          t={t}
        />
      ) : null}
    </Dialog>
  );
}

function SpaceNameDialogBody({
  inputId,
  onClose,
  request,
  t,
}: {
  inputId: string;
  onClose: () => void;
  request: SpaceNameDialogRequest;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const [value, setValue] = useState(request.initial ?? "");
  const submit = () => {
    const name = value.trim();
    if (!name) {
      return;
    }
    request.onSubmit(name);
    onClose();
  };
  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
      </DialogHeader>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Label htmlFor={inputId}>{request.label}</Label>
        <Input
          autoFocus
          id={inputId}
          maxLength={80}
          onChange={(event) => setValue(event.target.value)}
          value={value}
        />
        <DialogFooter className="mt-2">
          <Button onClick={onClose} type="button" variant="ghost">
            {t("actions.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button disabled={!value.trim()} type="submit">
            {request.submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
