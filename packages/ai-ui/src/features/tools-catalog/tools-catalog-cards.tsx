// Grouped card view for the tools catalog.

import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListGroupHeader,
  AdminListGroupPill,
  adminListCardsGridClassName,
  cn,
} from "@engenty/ui-core";
import { Wrench } from "lucide-react";
import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { buildToolEditPath } from "../agents-workspace/agent-workspace-paths";
import { ToolSourceBadgeForTool } from "./tool-source-badge";
import {
  deriveToolSource,
  deriveToolSourceCategory,
  type ToolsGroup,
} from "./tools-catalog-state";

interface ToolsCatalogCardsProps {
  grouped: boolean;
  groups: ToolsGroup[];
  isGroupOpen: (id: string) => boolean;
  onToggleGroup: (id: string) => void;
}

export function ToolsCatalogCards({
  grouped,
  groups,
  isGroupOpen,
  onToggleGroup,
}: ToolsCatalogCardsProps) {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();

  const groupCountLabel = (count: number) =>
    `${count} ${count === 1 ? t("toolsCatalog.groupCountSingular") : t("toolsCatalog.groupCountPlural")}`;

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => {
        const open = grouped ? isGroupOpen(group.id) : true;
        return (
          <Fragment key={group.id}>
            {grouped ? (
              <AdminListGroupHeader
                count={groupCountLabel(group.tools.length)}
                onToggle={() => onToggleGroup(group.id)}
                open={open}
                toggleLabel={t("toolsCatalog.toggleGroup")}
              >
                <AdminListGroupPill>{group.label}</AdminListGroupPill>
              </AdminListGroupHeader>
            ) : null}
            {open ? (
              <div
                className={cn(
                  adminListCardsGridClassName("compact"),
                  grouped && "mb-2"
                )}
              >
                {group.tools.map((tool) => {
                  const category = deriveToolSourceCategory(tool);
                  const isCustom = category === "custom";
                  return (
                    <button
                      className="ui-card-raised flex flex-col p-3 text-left disabled:cursor-default"
                      disabled={!isCustom}
                      key={tool.id}
                      onClick={() => navigate(buildToolEditPath(tool.id))}
                      type="button"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Wrench
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground opacity-80"
                        />
                        <span className="truncate font-medium text-sm">
                          {tool.name}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-muted-foreground text-xs">
                        {tool.id}
                      </p>
                      {tool.description ? (
                        <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                          {tool.description}
                        </p>
                      ) : null}
                      <div className="mt-3">
                        <ToolSourceBadgeForTool
                          category={category}
                          derivedSource={deriveToolSource(tool)}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
