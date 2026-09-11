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
  Input,
  SettingsFormSection,
} from "@engenty/ui-core";
import { useState } from "react";
import { toast } from "sonner";
import type { Space } from "@/lib/api/spaces-client";
import { useDeleteSpaceMutation } from "@/lib/spaces-queries";

/**
 * Inner chrome, not `border-*` on the card: `.ui-card-panel` owns border and
 * fill, so a ring/wash on a child is the only colour that actually shows.
 */
const dangerSurfaceClass =
  "bg-destructive/8 ring-2 ring-inset ring-destructive";
const dangerOutlineButtonClass =
  "shrink-0 border-destructive text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive";

export function SpaceDangerZone({
  onDeleted,
  space,
}: {
  onDeleted: () => void;
  space: Space;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const del = useDeleteSpaceMutation();
  const nameMatches = confirmName.trim() === space.name.trim();

  if (space.isDefault) {
    return (
      <SettingsFormSection
        cardVariant="flush"
        description={t("spaces.settings.danger.defaultHint")}
        title={
          <span className="text-destructive">
            {t("spaces.settings.danger.title")}
          </span>
        }
      >
        <div className={dangerSurfaceClass}>
          <p className="px-4 py-3 text-muted-foreground text-sm">
            {t("spaces.settings.danger.defaultBody")}
          </p>
        </div>
      </SettingsFormSection>
    );
  }

  return (
    <>
      <SettingsFormSection
        cardVariant="flush"
        description={t("spaces.settings.danger.description")}
        title={
          <span className="text-destructive">
            {t("spaces.settings.danger.title")}
          </span>
        }
      >
        <div className={dangerSurfaceClass}>
          <div className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium text-foreground text-sm">
                {t("spaces.settings.danger.deleteTitle")}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("spaces.settings.danger.deleteHint")}
              </p>
            </div>
            <Button
              className={dangerOutlineButtonClass}
              onClick={() => {
                setConfirmName("");
                setOpen(true);
              }}
              size="sm"
              variant="outline"
            >
              {t("spaces.settings.danger.deleteAction")}
            </Button>
          </div>
        </div>
      </SettingsFormSection>

      <AlertDialog
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setConfirmName("");
          }
        }}
        open={open}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("spaces.settings.danger.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("spaces.settings.danger.confirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label
              className="font-medium text-foreground text-sm"
              htmlFor="space-delete-confirm"
            >
              {t("spaces.settings.danger.confirmLabel", { name: space.name })}
            </label>
            <Input
              autoComplete="off"
              id="space-delete-confirm"
              onChange={(event) => setConfirmName(event.target.value)}
              value={confirmName}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!nameMatches || del.isPending}
              onClick={(event) => {
                event.preventDefault();
                del.mutate(
                  { confirmName: space.name, spaceId: space.id },
                  {
                    onError: () => {
                      toast.error(t("spaces.settings.danger.deleteFailed"));
                    },
                    onSuccess: (result) => {
                      setOpen(false);
                      const when = result.purgeAfter
                        ? new Date(result.purgeAfter).toLocaleDateString(
                            undefined,
                            { dateStyle: "medium" }
                          )
                        : "";
                      toast.success(
                        t("spaces.settings.danger.marked", { date: when })
                      );
                      onDeleted();
                    },
                  }
                );
              }}
              variant="destructive"
            >
              {t("spaces.settings.danger.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
