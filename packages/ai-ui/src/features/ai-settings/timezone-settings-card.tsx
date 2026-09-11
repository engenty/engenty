import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormSection,
} from "@engenty/ui-core";
import { useMemo } from "react";
import type { AiConfig } from "../../lib/admin/ai-settings-api";

/** What a container does with no `TZ` — the same string the server falls back to. */
const INHERIT_VALUE = "__inherit";

/**
 * Every zone the browser knows, when it will say. `supportedValuesOf` is
 * recent enough that a fallback matters: without it the field would be empty
 * and unusable, so a short list of common zones plus whatever the viewer is in
 * keeps it working.
 */
function zoneOptions(browserZone: string): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  const all = supported ? supported("timeZone") : [];
  if (all.length > 0) {
    return all;
  }
  return [
    ...new Set(
      [
        browserZone,
        "UTC",
        "Europe/Vienna",
        "Europe/Berlin",
        "Europe/London",
        "America/New_York",
        "America/Los_Angeles",
        "Asia/Singapore",
        "Australia/Sydney",
      ].filter(Boolean)
    ),
  ];
}

/** The zone's current wall clock, so the choice can be checked at a glance. */
function nowIn(zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: zone,
      timeZoneName: "short",
    }).format(new Date());
  } catch {
    return "";
  }
}

interface TimezoneSettingsCardProps {
  settings: AiConfig;
  t: (key: string) => string;
  updateSettings: <K extends keyof AiConfig>(
    key: K,
    value: AiConfig[K]
  ) => void;
}

/**
 * The timezone agents' machines run on.
 *
 * It is here rather than under a display heading because it is not a display
 * preference: it rides into the sandbox as `TZ`, so it changes what `date` and
 * `new Date()` RETURN inside a run. An agent asked what time it is answers from
 * this.
 */
export function TimezoneSettingsCard({
  settings,
  t,
  updateSettings,
}: TimezoneSettingsCardProps) {
  const browserZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);
  const zones = useMemo(() => zoneOptions(browserZone), [browserZone]);
  const value = settings.timezone?.trim() || INHERIT_VALUE;
  const effective = settings.timezone?.trim() || "UTC";
  const clock = nowIn(effective);

  return (
    <SettingsFormSection
      description={t("sections.timezoneDesc")}
      title={t("sections.timezone")}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Label
          className="shrink-0 sm:w-32 md:w-40"
          htmlFor="workspace-timezone"
        >
          {t("timezone.label")}
        </Label>
        <Select
          onValueChange={(next) =>
            updateSettings("timezone", next === INHERIT_VALUE ? null : next)
          }
          value={value}
        >
          <SelectTrigger className="sm:max-w-sm" id="workspace-timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={INHERIT_VALUE}>
              {t("timezone.inherit")}
            </SelectItem>
            {zones.map((zone) => (
              <SelectItem key={zone} value={zone}>
                {zone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {settings.timezone?.trim() === browserZone ? null : (
          <Button
            onClick={() => updateSettings("timezone", browserZone)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("timezone.useBrowser")} ({browserZone})
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        {clock
          ? t("timezone.nowHint").replace("{{time}}", `${effective} · ${clock}`)
          : t("timezone.hint")}
      </p>
    </SettingsFormSection>
  );
}
