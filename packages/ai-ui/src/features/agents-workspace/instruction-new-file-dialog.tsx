// New append instruction file dialog — name → `*.md` under the agent.

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
import { useState } from "react";

interface InstructionNewFileDialogProps {
  isPending?: boolean;
  onCreate: (filename: string) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  t: (key: string) => string;
}

export function InstructionNewFileDialog({
  isPending = false,
  onCreate,
  onOpenChange,
  open,
  t,
}: InstructionNewFileDialogProps) {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const filename = trimmed
    ? /\.md$/i.test(trimmed)
      ? trimmed
      : `${trimmed}.md`
    : "";

  const submit = async () => {
    if (!filename || isPending) {
      return;
    }
    await onCreate(filename);
    setName("");
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("instructions.newFileTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {t("instructions.newFileHint")}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="instruction-new-name">
              {t("instructions.newFileName")}
            </Label>
            <Input
              autoFocus
              id="instruction-new-name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submit();
                }
              }}
              placeholder={t("instructions.newFilePlaceholder")}
              value={name}
            />
          </div>
          {filename ? (
            <p className="font-mono text-muted-foreground text-xs">
              {filename}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={!filename || isPending}
            onClick={() => void submit()}
            size="sm"
          >
            {t("instructions.newFileCreate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
