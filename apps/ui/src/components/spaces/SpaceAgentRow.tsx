import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button } from "@engenty/ui-core";
import { Bot, CheckCircle2, Plus, Settings2 } from "lucide-react";
import {
  overviewIconToneForCategory,
  SettingsOverviewIcon,
} from "@/components/settings/SettingsOverviewIcon";
import type { SpaceCatalogItem } from "./space-mount-catalog";

export function SpaceAgentRow({
  inSpace,
  item,
  locked,
  onOpen,
  recommended = false,
  saving,
}: {
  inSpace: boolean;
  item: SpaceCatalogItem;
  locked: boolean;
  onOpen: () => void;
  recommended?: boolean;
  saving: boolean;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center gap-3 px-2 py-3">
      <SettingsOverviewIcon
        Icon={Bot}
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
          <Badge className="gap-1" variant="secondary">
            <CheckCircle2 className="size-3" />
            {locked
              ? t("spaces.setup.agentAlwaysInSpace")
              : t("spaces.setup.agentInSpace")}
          </Badge>
          <Button
            aria-label={t("spaces.setup.agentDetailsLabel", {
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
              {t("spaces.setup.agentDetails")}
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
            onClick={onOpen}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="size-3.5" />
            {t("spaces.setup.agentAdd")}
          </Button>
        </div>
      )}
    </div>
  );
}
