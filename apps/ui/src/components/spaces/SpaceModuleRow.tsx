import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button } from "@engenty/ui-core";
import type { UiIconComponent } from "@engenty/ui-plugin-sdk";
import { CheckCircle2, Minus, Plus, Settings2 } from "lucide-react";
import {
  overviewIconToneForCategory,
  SettingsOverviewIcon,
} from "@/components/settings/SettingsOverviewIcon";
import type { SpaceCatalogItem } from "./space-mount-catalog";
import type { SpaceAccessLevel } from "./space-setup-selection";

export function SpaceModuleRow({
  access,
  Icon,
  inSpace,
  item,
  locked,
  onAdd,
  onOpen,
  onRemove,
  recommended = false,
  requiredBy = null,
  saving,
}: {
  access: SpaceAccessLevel | null;
  Icon: UiIconComponent;
  inSpace: boolean;
  item: SpaceCatalogItem;
  locked: boolean;
  onAdd?: () => void;
  onOpen: () => void;
  /** Drop this optional module. Absent when it is locked or required by another. */
  onRemove?: () => void;
  recommended?: boolean;
  /** "Required by Projects" — set while another selected module needs this one. */
  requiredBy?: string | null;
  saving: boolean;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center gap-3 px-2 py-3">
      <SettingsOverviewIcon
        Icon={Icon}
        tone={overviewIconToneForCategory(item.category)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{item.name}</p>
        <p className="truncate text-muted-foreground text-xs">
          {item.description ?? item.id}
        </p>
      </div>
      {inSpace ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-muted-foreground text-xs sm:inline">
            {t("spaces.setup.moduleAccessSummary", {
              access: t(`spaces.setup.moduleAccess.${access ?? "none"}`),
            })}
          </span>
          {onRemove ? (
            <Button
              aria-label={t("spaces.setup.moduleRemoveLabel", {
                name: item.name,
              })}
              disabled={saving}
              onClick={onRemove}
              size="sm"
              type="button"
              variant="outline"
            >
              <Minus className="size-3.5" />
              <span className="hidden sm:inline">
                {t("spaces.setup.moduleRemoveAction")}
              </span>
            </Button>
          ) : (
            <Badge className="gap-1" variant="secondary">
              <CheckCircle2 className="size-3" />
              {locked
                ? t("spaces.setup.moduleAlwaysInSpace")
                : (requiredBy ?? t("spaces.setup.moduleInSpace"))}
            </Badge>
          )}
          <Button
            aria-label={t("spaces.setup.moduleDetailsLabel", {
              name: item.name,
            })}
            disabled={saving}
            onClick={onOpen}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Settings2 className="size-3.5" />
            <span className="hidden sm:inline">
              {t("spaces.setup.moduleDetails")}
            </span>
          </Button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          {recommended ? (
            <Badge variant="secondary">{t("spaces.setup.recommended")}</Badge>
          ) : null}
          <Button
            disabled={saving}
            onClick={onAdd ?? onOpen}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="size-3.5" />
            {t("spaces.setup.moduleAdd")}
          </Button>
        </div>
      )}
    </div>
  );
}
