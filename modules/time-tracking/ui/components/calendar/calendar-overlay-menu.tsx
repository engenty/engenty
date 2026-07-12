import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Checkbox,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Separator,
  Switch,
} from "@engenty/ui-core";
import { CalendarClock } from "lucide-react";
import type {
  CalendarSource,
  CalendarSyncSettings,
  OverlaySettings,
  OverlayTarget,
} from "../../api.js";
import type { SetSyncInput } from "../../hooks/use-calendar-overlay.js";
import { overlayBlockStyle } from "./calendar-utils.js";

interface CalendarOverlayMenuProps {
  hasErrors: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsChange: (next: OverlaySettings) => void;
  onSyncChange: (input: SetSyncInput) => void;
  open: boolean;
  settings: OverlaySettings;
  sources: CalendarSource[];
  sourcesLoading: boolean;
  syncSettings: CalendarSyncSettings;
}

function sameTarget(
  a: OverlayTarget,
  connectionId: string,
  calendarId: string
) {
  return (
    a.connection_id === connectionId &&
    (a.calendar_id ?? "primary") === calendarId
  );
}

export function CalendarOverlayMenu({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  onSyncChange,
  sources,
  sourcesLoading,
  hasErrors,
  syncSettings,
}: CalendarOverlayMenuProps) {
  const { t } = useTranslation("time-tracking");
  const activeCount = settings.targets.length;
  const isActive = settings.enabled && activeCount > 0;

  const toggleCalendar = (connectionId: string, calendarId: string) => {
    const exists = settings.targets.some((target) =>
      sameTarget(target, connectionId, calendarId)
    );
    const targets = exists
      ? settings.targets.filter(
          (target) => !sameTarget(target, connectionId, calendarId)
        )
      : [
          ...settings.targets,
          { connection_id: connectionId, calendar_id: calendarId },
        ];
    // Turning on the first calendar enables the overlay for convenience.
    onSettingsChange({
      enabled: targets.length > 0 ? true : settings.enabled,
      targets,
    });
  };

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("calendar.overlayTitle")}
          size="sm"
          title={t("calendar.overlayTitle")}
          variant={isActive ? "secondary" : "outline"}
        >
          <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
          {t("calendar.overlay")}
          {isActive ? (
            <span className="ml-1 rounded-full bg-primary/15 px-1 text-[10px] text-primary tabular-nums">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <Label className="text-sm" htmlFor="overlay-enabled">
            {t("calendar.overlayShow")}
          </Label>
          <Switch
            checked={settings.enabled}
            id="overlay-enabled"
            onCheckedChange={(checked) =>
              onSettingsChange({ ...settings, enabled: checked })
            }
          />
        </div>
        <Separator />
        <ScrollArea className="max-h-64">
          <div className="px-3 py-2">
            {sourcesLoading ? (
              <p className="py-4 text-center text-muted-foreground text-xs">
                {t("calendar.overlayLoading")}
              </p>
            ) : sources.length === 0 ? (
              <p className="py-4 text-center text-muted-foreground text-xs leading-relaxed">
                {t("calendar.overlayEmpty")}
              </p>
            ) : (
              sources.map((source) => (
                <div className="mb-2 last:mb-0" key={source.connection_id}>
                  <p className="mb-1 truncate font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                    {source.label}
                  </p>
                  {source.calendars.length === 0 ? (
                    <p className="px-1 text-[11px] text-muted-foreground">
                      {t("calendar.overlayNoCalendars")}
                    </p>
                  ) : (
                    source.calendars.map((calendar) => {
                      const checked = settings.targets.some((target) =>
                        sameTarget(target, source.connection_id, calendar.id)
                      );
                      const swatchKey = `${source.connection_id}:${calendar.id}`;
                      return (
                        <label
                          className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent"
                          key={calendar.id}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              toggleCalendar(source.connection_id, calendar.id)
                            }
                          />
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm border"
                            style={overlayBlockStyle(swatchKey)}
                          />
                          <span className="truncate text-sm">
                            {calendar.summary ?? calendar.id}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <Separator />
        <div className="px-3 py-2.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <Label className="font-medium text-sm">
              {t("calendar.syncTitle")}
            </Label>
            <Switch
              checked={syncSettings.sync_enabled}
              disabled={!syncSettings.target_calendar_id}
              onCheckedChange={(checked) => {
                if (
                  syncSettings.connection_id &&
                  syncSettings.target_calendar_id
                ) {
                  onSyncChange({
                    connection_id: syncSettings.connection_id,
                    target_calendar_id: syncSettings.target_calendar_id,
                    time_zone: syncSettings.time_zone,
                    sync_enabled: checked,
                  });
                }
              }}
            />
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground leading-snug">
            {t("calendar.syncHint")}
          </p>
          {sources.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {t("calendar.overlayEmpty")}
            </p>
          ) : (
            sources.map((source) => (
              <div className="mb-1 last:mb-0" key={source.connection_id}>
                <p className="mb-0.5 truncate font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  {source.label}
                </p>
                {source.calendars.map((calendar) => {
                  const selected =
                    syncSettings.connection_id === source.connection_id &&
                    syncSettings.target_calendar_id === calendar.id;
                  return (
                    <label
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent"
                      key={calendar.id}
                    >
                      <input
                        checked={selected}
                        className="accent-primary"
                        name="calendar-sync-target"
                        onChange={() =>
                          onSyncChange({
                            connection_id: source.connection_id,
                            target_calendar_id: calendar.id,
                            time_zone: calendar.time_zone,
                            sync_enabled: true,
                          })
                        }
                        type="radio"
                      />
                      <span className="truncate text-sm">
                        {calendar.summary ?? calendar.id}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))
          )}
        </div>
        {hasErrors ? (
          <>
            <Separator />
            <p className="px-3 py-2 text-[11px] text-destructive">
              {t("calendar.overlayError")}
            </p>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
