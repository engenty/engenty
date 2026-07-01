import {
  Button,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { useMemo } from "react";
import { describeDocumentSourceCronExpression } from "../schedule.js";
import type { DocumentSourceScheduleKind } from "../types.js";

export interface DocumentSourceScheduleFieldsValue {
  cron_expression: string | null;
  enabled: boolean;
  interval_minutes: number | null;
  kind: DocumentSourceScheduleKind;
}

export interface DocumentSourceScheduleFieldsLabels {
  cronBuilderLink: string;
  cronExpression: string;
  cronHint: string;
  intervalMinutes: string;
  presetDailyNine: string;
  presetEveryFifteen: string;
  presetHourly: string;
  presetWeekdayNine: string;
  preview: string;
  tabCron: string;
  tabInterval: string;
}

export interface DocumentSourceScheduleFieldsProps {
  disabled?: boolean;
  labels: DocumentSourceScheduleFieldsLabels;
  onChange: (next: DocumentSourceScheduleFieldsValue) => void;
  value: DocumentSourceScheduleFieldsValue;
}

const DEFAULT_PRESETS: Array<{
  cron: string;
  labelKey: keyof DocumentSourceScheduleFieldsLabels;
}> = [
  { cron: "0 * * * *", labelKey: "presetHourly" },
  { cron: "*/15 * * * *", labelKey: "presetEveryFifteen" },
  { cron: "0 9 * * *", labelKey: "presetDailyNine" },
  { cron: "0 9 * * 1", labelKey: "presetWeekdayNine" },
];

export function DocumentSourceScheduleFields({
  disabled,
  labels,
  onChange,
  value,
}: DocumentSourceScheduleFieldsProps) {
  const tab = value.kind === "cron" ? "cron" : "interval";

  const cronPreview = useMemo(() => {
    if (!value.cron_expression?.trim()) {
      return null;
    }
    return describeDocumentSourceCronExpression(value.cron_expression, {
      locale: "en",
    });
  }, [value.cron_expression]);

  const setKind = (kind: DocumentSourceScheduleKind) => {
    onChange({ ...value, kind });
  };

  const applyPreset = (cron: string) => {
    onChange({
      ...value,
      cron_expression: cron,
      kind: "cron",
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <Tabs
        onValueChange={(next) => {
          if (next === "cron") {
            setKind("cron");
          } else {
            setKind("interval");
          }
        }}
        value={tab}
      >
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger disabled={disabled} value="interval">
            {labels.tabInterval}
          </TabsTrigger>
          <TabsTrigger disabled={disabled} value="cron">
            {labels.tabCron}
          </TabsTrigger>
        </TabsList>
        <TabsContent className="mt-3 space-y-3" value="interval">
          <div className="grid gap-2">
            <Label htmlFor="ds-schedule-interval">
              {labels.intervalMinutes}
            </Label>
            <Input
              disabled={disabled}
              id="ds-schedule-interval"
              min={5}
              onChange={(e) =>
                onChange({
                  ...value,
                  interval_minutes: Number.parseInt(e.target.value, 10) || null,
                  kind: "interval",
                })
              }
              type="number"
              value={value.interval_minutes ?? ""}
            />
          </div>
        </TabsContent>
        <TabsContent className="mt-3 space-y-3" value="cron">
          <div className="flex flex-wrap gap-2">
            {DEFAULT_PRESETS.map((preset) => (
              <Button
                disabled={disabled}
                key={preset.cron}
                onClick={() => applyPreset(preset.cron)}
                size="sm"
                type="button"
                variant="outline"
              >
                {labels[preset.labelKey]}
              </Button>
            ))}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ds-schedule-cron">{labels.cronExpression}</Label>
            <Input
              className="font-mono text-sm"
              disabled={disabled}
              id="ds-schedule-cron"
              onChange={(e) =>
                onChange({
                  ...value,
                  cron_expression: e.target.value || null,
                  kind: "cron",
                })
              }
              placeholder="0 9 * * *"
              spellCheck={false}
              value={value.cron_expression ?? ""}
            />
            <p className="text-muted-foreground text-xs">
              {labels.cronHint}{" "}
              <a
                className="text-primary underline underline-offset-2"
                href="https://crontab.cronhub.io/"
                rel="noreferrer"
                target="_blank"
              >
                {labels.cronBuilderLink}
              </a>
            </p>
            {cronPreview ? (
              <p className="text-muted-foreground text-xs">
                <span className="font-medium text-foreground">
                  {labels.preview}
                </span>{" "}
                {cronPreview}
              </p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
