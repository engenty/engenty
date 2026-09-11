import { useTranslation } from "@engenty/i18n/ui";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { personAvatarTone, type SpacePersonItem } from "./SpacePersonRow";
import { initials } from "./space-roster";

export function SpacePersonDetailsDialog({
  canManage,
  item,
  onAdd,
  onOpenChange,
  onRemove,
  open,
  saving,
}: {
  canManage: boolean;
  item: SpacePersonItem | null;
  onAdd: () => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  open: boolean;
  saving: boolean;
}) {
  const { t } = useTranslation("common");
  if (!item) {
    return null;
  }

  const removable = canManage && item.inSpace && item.role !== "owner";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <Avatar className="size-9">
              <AvatarFallback
                className={`font-bold text-xs ${personAvatarTone(item.id)}`}
              >
                {initials(item.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>
                  {item.inSpace
                    ? item.name
                    : t("spaces.members.addTitle", { name: item.name })}
                </DialogTitle>
                {item.role === "owner" ? (
                  <Badge variant="secondary">{t("spaces.members.owner")}</Badge>
                ) : null}
              </div>
              <DialogDescription className="mt-1">
                {item.email ?? t("spaces.members.noEmail")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          {item.inSpace
            ? t("spaces.members.inSpaceHint")
            : t("spaces.members.addHint")}
        </p>
        {removable ? (
          <p className="text-muted-foreground text-xs">
            {t("spaces.members.removeHint")}
          </p>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <div>
            {removable ? (
              <Button
                className="text-destructive"
                disabled={saving}
                onClick={() => {
                  onOpenChange(false);
                  onRemove();
                }}
                type="button"
                variant="ghost"
              >
                {t("spaces.members.removeFromSpace")}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              disabled={saving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {item.inSpace ? t("actions.close") : t("actions.cancel")}
            </Button>
            {item.inSpace ? null : (
              <Button
                disabled={saving}
                onClick={async () => {
                  if (await onAdd()) {
                    onOpenChange(false);
                  }
                }}
                type="button"
              >
                {saving ? t("saving") : t("spaces.members.add")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
