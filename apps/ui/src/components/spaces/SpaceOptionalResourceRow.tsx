import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button } from "@engenty/ui-core";
import { CheckCircle2, Plus, Settings2, Sparkles } from "lucide-react";
import {
  overviewIconToneForCategory,
  SettingsOverviewIcon,
} from "@/components/settings/SettingsOverviewIcon";
import type { SpaceCatalogItem } from "./space-mount-catalog";

export function SpaceOptionalResourceRow({
  inSpace,
  item,
  onOpen,
  saving,
}: {
  inSpace: boolean;
  item: SpaceCatalogItem;
  onOpen: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center gap-3 px-2 py-3">
      <SettingsOverviewIcon
        Icon={Sparkles}
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
            {t("spaces.setup.resourceInSpace")}
          </Badge>
          <Button
            aria-label={t("spaces.setup.resourceDetailsLabel", {
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
              {t("spaces.setup.resourceDetails")}
            </span>
          </Button>
        </div>
      ) : (
        <Button
          disabled={saving}
          onClick={onOpen}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="size-3.5" />
          {t("spaces.setup.resourceAdd")}
        </Button>
      )}
    </div>
  );
}
