import {
  AdminListGroupHeader,
  AdminListGroupPill,
  adminListCardsGridClassName,
  Badge,
  cn,
} from "@engenty/ui-core";
import { Fragment } from "react";
import type {
  SkillCatalogGroup,
  SkillCatalogGroupBy,
} from "./skills-catalog-state";
import {
  displayName,
  formatUpdatedAt,
  SkillStatusBadge,
} from "./skills-catalog-table";

interface SkillCatalogCardsLabels {
  groupCountPlural: string;
  groupCountSingular: string;
  managed: string;
  needsSandbox: string;
  noSandbox: string;
  toggleGroup: string;
  toolsCount: string;
  uploaded: string;
}

interface SkillCatalogCardsProps {
  groupBy: SkillCatalogGroupBy;
  groups: SkillCatalogGroup[];
  isGroupOpen: (id: string) => boolean;
  labels: SkillCatalogCardsLabels;
  onOpen: (skillName: string) => void;
  onToggleGroup: (id: string) => void;
  tableSize: "compact" | "normal";
}

export function SkillCatalogCards({
  groupBy,
  groups,
  isGroupOpen,
  labels,
  onOpen,
  onToggleGroup,
  tableSize,
}: SkillCatalogCardsProps) {
  const compact = tableSize === "compact";

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => {
        const grouped = groupBy !== "none";
        const open = grouped ? isGroupOpen(group.id) : true;
        return (
          <Fragment key={group.id}>
            {grouped ? (
              <AdminListGroupHeader
                count={`${group.skills.length} ${
                  group.skills.length === 1
                    ? labels.groupCountSingular
                    : labels.groupCountPlural
                }`}
                onToggle={() => onToggleGroup(group.id)}
                open={open}
                toggleLabel={labels.toggleGroup}
              >
                <AdminListGroupPill>{group.label}</AdminListGroupPill>
              </AdminListGroupHeader>
            ) : null}
            {open ? (
              <div
                className={cn(
                  adminListCardsGridClassName(tableSize),
                  grouped && "mb-2"
                )}
              >
                {group.skills.map((skill) => (
                  <button
                    className={cn(
                      "ui-canvas-elevated flex flex-col rounded-lg bg-card text-left transition-shadow hover:shadow-[var(--e-3)]",
                      compact ? "p-3" : "p-4"
                    )}
                    key={skill.name}
                    onClick={() => onOpen(skill.name)}
                    type="button"
                  >
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-medium text-foreground">
                        {displayName(skill)}
                      </span>
                      <span className="truncate font-mono text-muted-foreground text-xs">
                        {skill.name}
                      </span>
                    </div>
                    {skill.description ? (
                      <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                        {skill.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge
                        className={cn(
                          "border-border/70 bg-card font-normal text-[11px]",
                          skill.requires_sandbox
                            ? "text-primary"
                            : "text-muted-foreground"
                        )}
                        variant="outline"
                      >
                        {skill.requires_sandbox
                          ? labels.needsSandbox
                          : labels.noSandbox}
                      </Badge>
                      <SkillStatusBadge
                        labels={{
                          managed: labels.managed,
                          uploaded: labels.uploaded,
                        }}
                        skill={skill}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                      <span className="truncate">
                        {skill.engenty_modules.join(", ") || skill.module_id}
                      </span>
                      <span className="tabular-nums">
                        {labels.toolsCount}: {skill.allowed_tools.length}
                      </span>
                      <span className="whitespace-nowrap">
                        {formatUpdatedAt(skill.updated_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
}
