// The open routine's actions in the pane's top bar: run it now, change it in
// the chat, switch it on or off, delete it.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import {
  CirclePause,
  CirclePlay,
  Edit,
  MoreVertical,
  Play,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { editRoutineInChat } from "./routine-chat-prompts.js";
import { RoutineDeleteDialog } from "./routine-delete-dialog.js";
import { useRoutineRunNow } from "./routine-run-now.js";
import type { RoutineDto } from "./routines-api.js";
import { usePatchRoutineStateMutation } from "./routines-queries.js";

export function RoutineActionsMenu({
  hostKey,
  locale = "en",
  onDeleted,
  routine,
}: {
  /** The desk's chat — Edit hands the routine's reference to that composer. */
  hostKey: string;
  locale?: string;
  onDeleted: () => void;
  routine: RoutineDto;
}) {
  const { t } = useTranslation("ai-ui");
  const isDe = locale.startsWith("de");
  const runNow = useRoutineRunNow(routine.id);
  const patchMutation = usePatchRoutineStateMutation();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const isCustom = routine.source === "custom";

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={isDe ? "Weitere Aktionen" : "More actions"}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreVertical aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={runNow.isPending || !routine.enabled}
            onSelect={runNow.run}
          >
            <Play aria-hidden className="mr-2 size-4" />
            {isDe ? "Jetzt ausführen" : "Run now"}
          </DropdownMenuItem>
          {isCustom ? (
            <DropdownMenuItem
              onSelect={() => editRoutineInChat(hostKey, routine, t)}
            >
              <Edit aria-hidden className="mr-2 size-4" />
              {isDe ? "Bearbeiten" : "Edit"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={patchMutation.isPending}
            onSelect={() =>
              patchMutation.mutate({
                id: routine.id,
                patch: { enabled: !routine.enabled },
              })
            }
          >
            {routine.enabled ? (
              <CirclePause aria-hidden className="mr-2 size-4" />
            ) : (
              <CirclePlay aria-hidden className="mr-2 size-4" />
            )}
            {routine.enabled
              ? isDe
                ? "Deaktivieren"
                : "Deactivate"
              : isDe
                ? "Aktivieren"
                : "Activate"}
          </DropdownMenuItem>
          {isCustom ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setPendingDelete(routine.id)}
              >
                <Trash2 aria-hidden className="mr-2 size-4" />
                {isDe ? "Löschen" : "Delete"}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <RoutineDeleteDialog
        locale={locale}
        onDeleted={onDeleted}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        routineId={pendingDelete}
      />
    </>
  );
}
