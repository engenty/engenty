import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { Sparkles } from "lucide-react";
import {
  overviewIconToneForCategory,
  SettingsOverviewIcon,
} from "@/components/settings/SettingsOverviewIcon";
import type { SpaceCatalogItem } from "./space-mount-catalog";

/** Add / remove one optional resource (a skill) on the Space. */
export function SpaceOptionalResourceSetupDialog({
  inSpace,
  item,
  onAdd,
  onOpenChange,
  onRemove,
  open,
  saving,
}: {
  inSpace: boolean;
  item: SpaceCatalogItem | null;
  onAdd: () => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  onRemove: (() => Promise<boolean>) | null;
  open: boolean;
  saving: boolean;
}) {
  const { t } = useTranslation("common");
  if (!item) {
    return null;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <SettingsOverviewIcon
              Icon={Sparkles}
              tone={overviewIconToneForCategory(item.category)}
            />
            <div className="min-w-0">
              <DialogTitle>
                {inSpace
                  ? item.name
                  : t("spaces.setup.resourceAddTitle", { name: item.name })}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {item.description ??
                  t("spaces.setup.resourceDescriptionFallback")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          {t("spaces.setup.skillAccessHint")}
        </p>
        {onRemove ? (
          <p className="text-muted-foreground text-xs">
            {t("spaces.setup.resourceRemoveHint")}
          </p>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <div>
            {onRemove ? (
              <Button
                className="text-destructive"
                disabled={saving}
                onClick={async () => {
                  if (await onRemove()) {
                    onOpenChange(false);
                  }
                }}
                type="button"
                variant="ghost"
              >
                {t("spaces.setup.resourceRemove")}
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
              {inSpace ? t("actions.close") : t("actions.cancel")}
            </Button>
            {inSpace ? null : (
              <Button
                disabled={saving}
                onClick={async () => {
                  if (await onAdd()) {
                    onOpenChange(false);
                  }
                }}
                type="button"
              >
                {t("spaces.setup.resourceAdd")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
