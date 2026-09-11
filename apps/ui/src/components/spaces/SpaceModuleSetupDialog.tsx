import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type { UiIconComponent } from "@engenty/ui-plugin-sdk";
import { useEffect, useState } from "react";
import {
  overviewIconToneForCategory,
  SettingsOverviewIcon,
} from "@/components/settings/SettingsOverviewIcon";
import type { SpaceCatalogItem } from "./space-mount-catalog";
import {
  DEFAULT_MODULE_ACCESS,
  type SpaceAccessLevel,
} from "./space-setup-selection";

const ACCESS_LEVELS: SpaceAccessLevel[] = ["none", "read", "write"];

export function SpaceModuleSetupDialog({
  access,
  Icon,
  item,
  onApply,
  onOpenChange,
  onRemove,
  open,
  required,
  requiredBy = null,
  saving,
}: {
  access: SpaceAccessLevel | null;
  Icon: UiIconComponent;
  item: SpaceCatalogItem | null;
  onApply: (access: SpaceAccessLevel) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  onRemove: (() => Promise<boolean>) | null;
  open: boolean;
  required: boolean;
  /** Why this module cannot be removed right now — another mounted module needs it. */
  requiredBy?: string | null;
  saving: boolean;
}) {
  const { t } = useTranslation("common");
  const [draftAccess, setDraftAccess] = useState<SpaceAccessLevel>(
    DEFAULT_MODULE_ACCESS
  );

  useEffect(() => {
    if (open) {
      setDraftAccess(access ?? DEFAULT_MODULE_ACCESS);
    }
  }, [access, open]);

  if (!item) {
    return null;
  }

  const isNew = access === null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <SettingsOverviewIcon
              Icon={Icon}
              tone={overviewIconToneForCategory(item.category)}
            />
            <div className="min-w-0">
              <DialogTitle>
                {isNew
                  ? t("spaces.setup.moduleAddTitle", { name: item.name })
                  : item.name}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {item.description ??
                  t("spaces.setup.moduleDescriptionFallback")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isNew ? null : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="space-module-access">
                {t("spaces.setup.moduleAccessLabel")}
              </Label>
              {required ? (
                <Badge variant="secondary">
                  {t("spaces.setup.moduleAlwaysInSpace")}
                </Badge>
              ) : requiredBy ? (
                <Badge variant="secondary">{requiredBy}</Badge>
              ) : null}
            </div>
            <Select
              onValueChange={(value) =>
                setDraftAccess(value as SpaceAccessLevel)
              }
              value={draftAccess}
            >
              <SelectTrigger id="space-module-access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`spaces.setup.moduleAccess.${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t(`spaces.setup.moduleAccessHint.${draftAccess}`)}
            </p>
            {draftAccess === "write" ? (
              <p className="text-muted-foreground text-xs">
                {t("spaces.setup.moduleApprovalHint")}
              </p>
            ) : null}
          </div>
        )}

        {onRemove ? (
          <p className="text-muted-foreground text-xs">
            {t("spaces.setup.moduleRemoveHint")}
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
                {t("spaces.setup.moduleRemove")}
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
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                if (await onApply(draftAccess)) {
                  onOpenChange(false);
                }
              }}
              type="button"
            >
              {saving
                ? t("saving", { defaultValue: "Saving…" })
                : isNew
                  ? t("spaces.setup.moduleAdd")
                  : t("spaces.setup.moduleApply")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
