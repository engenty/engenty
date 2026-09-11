import { useTranslation } from "@engenty/i18n/ui";
import {
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
import { Plug, Sparkles } from "lucide-react";
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

export function SpaceOptionalResourceSetupDialog({
  access,
  inSpace,
  item,
  kind,
  onAdd,
  onApplyAccess,
  onOpenChange,
  onRemove,
  open,
  saving,
}: {
  /**
   * What this space's engentys may do with the ACCOUNT
   * (PLAN-connections-ux.md C1). `null` on an account in the space means this
   * space never decided, and its own `autonomous_mode` decides alone — which
   * is usually why an engenty still cannot use it.
   */
  access?: SpaceAccessLevel | null;
  inSpace: boolean;
  item: SpaceCatalogItem | null;
  kind: "connection" | "skill";
  onAdd: (access?: SpaceAccessLevel) => Promise<boolean>;
  /** Change the level of an account already in this space. Accounts only. */
  onApplyAccess?: ((access: SpaceAccessLevel) => Promise<boolean>) | null;
  onOpenChange: (open: boolean) => void;
  onRemove: (() => Promise<boolean>) | null;
  open: boolean;
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
  const Icon = kind === "skill" ? Sparkles : Plug;
  // A skill is availability only; an account carries a level, and it is the
  // control that decides whether this space's engentys can use it at all.
  const showAccess = kind === "connection";

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
          {t(
            kind === "connection"
              ? "spaces.setup.connectionAccessHint"
              : "spaces.setup.skillAccessHint"
          )}
        </p>
        {showAccess ? (
          <div className="space-y-2">
            <Label htmlFor="space-account-access">
              {t("spaces.setup.accountAccessLabel")}
            </Label>
            <Select
              onValueChange={(value) =>
                setDraftAccess(value as SpaceAccessLevel)
              }
              value={draftAccess}
            >
              <SelectTrigger id="space-account-access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {t(`spaces.setup.accountAccess.${level}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {t(`spaces.setup.accountAccessHint.${draftAccess}`)}
            </p>
          </div>
        ) : null}
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
            {inSpace ? (
              showAccess && onApplyAccess && draftAccess !== access ? (
                <Button
                  disabled={saving}
                  onClick={async () => {
                    if (await onApplyAccess(draftAccess)) {
                      onOpenChange(false);
                    }
                  }}
                  type="button"
                >
                  {t("spaces.setup.moduleApply")}
                </Button>
              ) : null
            ) : (
              <Button
                disabled={saving}
                onClick={async () => {
                  if (await onAdd(showAccess ? draftAccess : undefined)) {
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
