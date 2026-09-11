import { Switch } from "@engenty/ui-core";
import { ChevronRightIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { ModuleSettingsRow } from "./module-settings-rows";
import {
  overviewIconToneForCategory,
  SettingsOverviewIcon,
} from "./SettingsOverviewIcon";

const ROW_CLASS =
  "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30";

interface ModuleSettingsListRowProps {
  activateLabel: string;
  busy: boolean;
  deactivateLabel: string;
  exiting: boolean;
  mandatoryLabel: string;
  onToggle: (nextEnabled: boolean) => void;
  row: ModuleSettingsRow;
}

export function ModuleSettingsListRow({
  activateLabel,
  busy,
  deactivateLabel,
  exiting,
  mandatoryLabel,
  onToggle,
  row,
}: ModuleSettingsListRowProps) {
  const Icon = row.icon;
  const inner = (
    <>
      <SettingsOverviewIcon
        Icon={Icon}
        tone={overviewIconToneForCategory(row.category)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate font-medium text-sm",
            row.enabled ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {row.label}
        </span>
        {row.description ? (
          <span className="truncate text-muted-foreground text-xs">
            {row.description}
          </span>
        ) : null}
      </div>
      {row.mandatory ? (
        <span className="shrink-0 font-medium text-[11px] text-muted-foreground">
          {mandatoryLabel}
        </span>
      ) : (
        <div
          className="relative z-10 shrink-0"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          role="presentation"
        >
          <Switch
            aria-label={row.enabled ? deactivateLabel : activateLabel}
            checked={row.enabled && !exiting}
            disabled={busy || exiting}
            onCheckedChange={onToggle}
            size="sm"
          />
        </div>
      )}
      {row.to ? (
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/40" />
      ) : (
        <span className="size-4 shrink-0" />
      )}
    </>
  );

  return (
    <div
      className={cn(
        "overflow-hidden transition-[opacity,max-height] duration-300 ease-out",
        exiting ? "max-h-0 opacity-0" : "max-h-24 opacity-100"
      )}
    >
      {row.to ? (
        <Link className={ROW_CLASS} to={row.to}>
          {inner}
        </Link>
      ) : (
        <div className={ROW_CLASS}>{inner}</div>
      )}
    </div>
  );
}
