import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ScrollArea,
} from "@engenty/ui-core";
import { History, RotateCcw } from "lucide-react";
import type { AiInstructionChange } from "../../lib/admin/instruction-settings-api";
import { InstructionVersionDialog } from "./instruction-version-dialog";

interface InstructionHistoryDialogProps {
  history: AiInstructionChange[];
  isBusy: boolean;
  isDirty: boolean;
  isSaving: boolean;
  onCreateVersion: (reason: string) => void;
  onRollback: (changeId: string) => void;
  t: (key: string) => string;
}

export function InstructionHistoryDialog({
  history,
  isBusy,
  isDirty,
  isSaving,
  onCreateVersion,
  onRollback,
  t,
}: InstructionHistoryDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          aria-label={t("instructions.historyTitle")}
          className="size-7"
          size="icon"
          type="button"
          variant="ghost"
        >
          <History className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(36rem,calc(100dvh-4rem))] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("instructions.historyTitle")}</DialogTitle>
          <DialogDescription>
            {t("instructions.historyDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <InstructionVersionDialog
            disabled={!isDirty || isBusy}
            isSubmitting={isSaving}
            onConfirm={onCreateVersion}
            t={t}
          />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {history.length ? (
            <div className="space-y-2 pr-3">
              {history.map((change) => (
                <div className="rounded-md border p-3" key={change.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{change.created_at}</p>
                      <p className="text-muted-foreground text-xs">
                        {change.change_reason || t("instructions.noReason")}
                      </p>
                    </div>
                    <Button
                      disabled={!change.previous_body || isBusy}
                      onClick={() => onRollback(change.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RotateCcw className="size-3.5" />
                      {t("instructions.rollback")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("instructions.noHistory")}
            </p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
