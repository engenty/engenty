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
} from "@engenty/ui-core";
import { Bot } from "lucide-react";
import {
  overviewIconToneForCategory,
  SettingsOverviewIcon,
} from "@/components/settings/SettingsOverviewIcon";
import type { SpaceCatalogItem } from "./space-mount-catalog";

export function SpaceAgentSetupDialog({
  inSpace,
  item,
  onAdd,
  onOpenChange,
  onRemove,
  open,
  required,
  saving,
}: {
  inSpace: boolean;
  item: SpaceCatalogItem | null;
  onAdd: () => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  onRemove: (() => Promise<boolean>) | null;
  open: boolean;
  required: boolean;
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
              Icon={Bot}
              tone={overviewIconToneForCategory(item.category)}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>
                  {inSpace
                    ? item.name
                    : t("spaces.setup.agentAddTitle", { name: item.name })}
                </DialogTitle>
                {required ? (
                  <Badge variant="secondary">
                    {t("spaces.setup.agentAlwaysInSpace")}
                  </Badge>
                ) : null}
              </div>
              <DialogDescription className="mt-1">
                {item.description ?? t("spaces.setup.agentDescriptionFallback")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-muted/40 p-3 text-xs">
          <dt className="text-muted-foreground">{t("spaces.setup.agentId")}</dt>
          <dd className="truncate font-mono">{item.id}</dd>
          {item.managedByModule ? (
            <>
              <dt className="text-muted-foreground">
                {t("spaces.setup.agentModule")}
              </dt>
              <dd>{item.managedByModule}</dd>
            </>
          ) : null}
          {item.role ? (
            <>
              <dt className="text-muted-foreground">
                {t("spaces.setup.agentRole")}
              </dt>
              <dd>{item.role}</dd>
            </>
          ) : null}
        </dl>

        <p className="text-muted-foreground text-xs">
          {inSpace
            ? t("spaces.setup.agentInSpaceHint")
            : t("spaces.setup.agentAddHint")}
        </p>
        {onRemove ? (
          <p className="text-muted-foreground text-xs">
            {t("spaces.setup.agentRemoveHint")}
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
                {t("spaces.setup.agentRemove")}
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
              {inSpace
                ? t("actions.close")
                : t("actions.cancel", { defaultValue: "Cancel" })}
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
                {saving
                  ? t("saving", { defaultValue: "Saving…" })
                  : t("spaces.setup.agentAdd")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
