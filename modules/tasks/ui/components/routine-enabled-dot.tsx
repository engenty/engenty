// Enabled indicator for a routine card: colored dot with an enable/disable
// dropdown, mirroring the TaskCard status-change dropdown.
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";

interface RoutineEnabledDotProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

function dotClass(enabled: boolean) {
  return enabled ? "bg-emerald-500" : "bg-muted-foreground/40";
}

export function RoutineEnabledDot({
  enabled,
  onChange,
}: RoutineEnabledDotProps) {
  const { t } = useTranslation("tasks");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t(
            enabled ? "routines.list.enabled" : "routines.list.disabled"
          )}
          className="flex items-center justify-center rounded-md p-1 hover:bg-muted"
          onClick={(e) => e.stopPropagation()}
          type="button"
        >
          <span
            className={cn("h-3 w-3 shrink-0 rounded-full", dotClass(enabled))}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {[true, false].map((value) => (
          <DropdownMenuItem
            className="gap-2"
            key={String(value)}
            onClick={(e) => {
              e.stopPropagation();
              if (value !== enabled) {
                onChange(value);
              }
            }}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center",
                enabled === value && "rounded-md bg-muted"
              )}
            >
              <span
                className={cn("h-2.5 w-2.5 rounded-full", dotClass(value))}
              />
            </span>
            {t(value ? "routines.list.enable" : "routines.list.disable")}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
