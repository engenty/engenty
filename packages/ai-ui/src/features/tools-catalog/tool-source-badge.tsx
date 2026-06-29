// Source badge pill for the tools catalog.

import { useTranslation } from "@engenty/i18n/ui";
import { Badge } from "@engenty/ui-core";
import { Bot, Package, Plug } from "lucide-react";
import type { ToolSourceCategory } from "./tools-catalog-state";

const SOURCE_CONFIG: Record<
  ToolSourceCategory,
  { icon: typeof Bot; variant: "default" | "secondary" | "outline" }
> = {
  custom: { icon: Bot, variant: "default" },
  mcp: { icon: Plug, variant: "secondary" },
  module: { icon: Package, variant: "outline" },
};

export function ToolSourceBadge({
  category,
  label,
}: {
  category: ToolSourceCategory;
  label: string;
}) {
  const config = SOURCE_CONFIG[category];
  const Icon = config.icon;
  return (
    <Badge
      className="gap-1 whitespace-nowrap font-mono"
      variant={config.variant}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      {label}
    </Badge>
  );
}

export function ToolSourceBadgeForTool({
  derivedSource,
  category,
}: {
  derivedSource: string;
  category: ToolSourceCategory;
}) {
  const { t } = useTranslation("ai-ui");
  const label =
    category === "custom" ? t("toolsCatalog.source.custom") : derivedSource;
  return <ToolSourceBadge category={category} label={label} />;
}
