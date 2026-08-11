import {
  DocumentSourceScheduleFields,
  type DocumentSourceScheduleFieldsLabels,
  type DocumentSourceScheduleFieldsValue,
} from "@engenty/document-sources/react/schedule-fields";
import {
  type DocumentSourceSchedule,
  normalizeDocumentSourceSchedule,
} from "@engenty/document-sources/schedule";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@engenty/ui-core";
import type { Ref } from "react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import type { KbSource, KbSourceAdapterId } from "../../src/schema/types.js";
import type { KbSourceAdapterDescriptor, KbSourceIndexEntry } from "../api.js";
import {
  SourceAdapterSettingsFields,
  valueToInput,
} from "./source-adapter-settings-fields.js";

function defaultKbSourceName(
  adapter: KbSourceAdapterDescriptor | undefined,
  normalizedSettings: Record<string, unknown>
): string {
  for (const key of [
    "url",
    "sitemap_url",
    "feed_url",
    "index_url",
    "start_url",
  ] as const) {
    const v = normalizedSettings[key];
    if (typeof v !== "string") {
      continue;
    }
    const trimmed = v.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const host = new URL(trimmed).hostname;
      if (host) {
        return host.slice(0, 256);
      }
    } catch {
      /* use raw */
    }
    return trimmed.slice(0, 256);
  }
  return (adapter?.label?.trim() || "Source").slice(0, 256);
}

function missingItemStrategyLabel(
  strategyId: string,
  translate: (key: string) => string
): string {
  const key = `sources.missing_item_strategy.${strategyId}`;
  const label = translate(key);
  if (!label.trim() || label === key) {
    return strategyId
      .split("_")
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return label;
}

function scheduleToFieldsValue(
  raw: Record<string, unknown> | undefined,
  defaultIntervalMinutes: number
): DocumentSourceScheduleFieldsValue {
  const n = normalizeDocumentSourceSchedule({
    ...(raw ?? {}),
    interval_minutes:
      raw &&
      typeof raw === "object" &&
      "interval_minutes" in raw &&
      (raw as { interval_minutes?: unknown }).interval_minutes != null
        ? (raw as { interval_minutes: number | null }).interval_minutes
        : defaultIntervalMinutes,
  } as Partial<DocumentSourceSchedule>);
  return {
    // `normalizeDocumentSourceSchedule` always sets these; its return type
    // (`DocumentSourceSchedule`) keeps them optional, so re-apply its defaults.
    cron_expression: n.cron_expression ?? null,
    enabled: n.enabled,
    interval_minutes: n.interval_minutes ?? defaultIntervalMinutes,
    kind: n.kind ?? "interval",
  };
}

/** Type alias (not interface) so it satisfies `Record<string, unknown>` mutation inputs. */
// biome-ignore lint/style/useConsistentTypeDefinitions: type alias required for Record<string, unknown> mutation inputs
export type SourceAdapterDialogInput = {
  adapter_id: KbSourceAdapterId;
  enabled: boolean;
  ignored_item_keys?: string[];
  initial_index_entries?: KbSourceIndexEntry[];
  missing_item_strategy: string;
  name: string;
  schedule: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export interface SourceAdapterEditorHandle {
  submit: () => void;
}

export interface SourceAdapterEditorProps {
  /** When false, skip syncing form from `source` / preset (e.g. dialog closed). */
  active: boolean;
  adapters: KbSourceAdapterDescriptor[];
  /** When false, omit Cancel/Save footer (e.g. topbar actions on edit page). */
  inlineFooter?: boolean;
  onCancel: () => void;
  /** Fired when required-field validity changes (for topbar Save enablement). */
  onCanSubmitChange?: (canSubmit: boolean) => void;
  onSubmit: (input: SourceAdapterDialogInput) => void;
  /** When creating from the list “add” dropdown, locks the adapter and shapes the form. */
  presetAdapterId?: string | null;
  saving?: boolean;
  source?: KbSource | null;
  /** Override the create/save button label (e.g. "Indexierung starten" for wizard step 1). */
  submitLabel?: string;
  /** Full-page edit: no inner scroll cap; lighter section chrome. */
  variant?: "dialog" | "page";
}

export function SourceAdapterEditor({
  adapters,
  active,
  inlineFooter = true,
  onCancel,
  onCanSubmitChange,
  onSubmit,
  presetAdapterId,
  saving,
  source,
  submitLabel,
  variant = "dialog",
  ref,
}: SourceAdapterEditorProps & {
  ref?: Ref<SourceAdapterEditorHandle | null>;
}) {
  const { t } = useTranslation("kb");
  const isPage = variant === "page";
  const [adapterId, setAdapterId] = useState("url");
  /** Row `kb_sources.enabled` (runs / webhooks); not the same as missing-item strategy UI. */
  const [sourceEnabled, setSourceEnabled] = useState(true);
  /** When false, missing items use the default `ignore` (dropdown hidden). */
  const [missingStrategyCustomize, setMissingStrategyCustomize] =
    useState(false);
  const [name, setName] = useState("");
  const [scheduleFields, setScheduleFields] =
    useState<DocumentSourceScheduleFieldsValue>({
      cron_expression: null,
      enabled: false,
      interval_minutes: 1440,
      kind: "interval",
    });
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [strategy, setStrategy] = useState("ignore");

  const adapter = useMemo(
    () => adapters.find((item) => item.id === adapterId) ?? adapters[0],
    [adapterId, adapters]
  );

  const adapterLockedFromPreset = Boolean(!source && presetAdapterId);
  const adapterLocked = Boolean(source) || adapterLockedFromPreset;

  useEffect(() => {
    if (!active) {
      return;
    }
    const fromPreset =
      !source &&
      presetAdapterId &&
      adapters.some((item) => item.id === presetAdapterId);
    const nextAdapterId = source
      ? source.adapter_id
      : fromPreset
        ? presetAdapterId
        : (adapters[0]?.id ?? "url");
    const descriptor = adapters.find((item) => item.id === nextAdapterId);
    setAdapterId(nextAdapterId);
    setSourceEnabled(source?.enabled ?? true);
    const initialStrategy = source?.missing_item_strategy ?? "ignore";
    setStrategy(initialStrategy);
    setMissingStrategyCustomize(source ? initialStrategy !== "ignore" : false);
    const defaultInterval =
      descriptor?.schedule_default_minutes == null
        ? 1440
        : descriptor.schedule_default_minutes;
    setScheduleFields(
      scheduleToFieldsValue(
        source?.schedule as Record<string, unknown> | undefined,
        defaultInterval
      )
    );
    const nextSettings: Record<string, string> = {};
    for (const field of descriptor?.settings_fields ?? []) {
      const raw = source?.settings[field.key];
      if (field.type === "boolean") {
        nextSettings[field.key] =
          raw === true || raw === "true"
            ? "true"
            : raw === false || raw === "false"
              ? "false"
              : "";
      } else if (field.type === "select") {
        const asString = valueToInput(raw);
        nextSettings[field.key] =
          asString ||
          valueToInput(field.default_value) ||
          field.options?.[0]?.value ||
          "";
      } else {
        const asString = valueToInput(raw);
        nextSettings[field.key] =
          asString !== "" || raw !== undefined
            ? asString
            : field.default_value === undefined
              ? ""
              : String(field.default_value);
      }
    }
    setSettings(nextSettings);
  }, [active, adapters, presetAdapterId, source]);

  useEffect(() => {
    if (!active || source || presetAdapterId) {
      return;
    }
    const descriptor = adapters.find((item) => item.id === adapterId);
    if (!descriptor) {
      return;
    }
    const next: Record<string, string> = {};
    for (const field of descriptor.settings_fields) {
      if (field.type === "boolean") {
        next[field.key] = "false";
      } else if (field.type === "select") {
        next[field.key] =
          valueToInput(field.default_value) || field.options?.[0]?.value || "";
      } else {
        next[field.key] = "";
      }
    }
    setSettings(next);
  }, [active, adapterId, adapters, presetAdapterId, source]);

  const submit = useCallback(() => {
    if (!adapter) {
      return;
    }
    const normalizedSettings: Record<string, unknown> = {};
    for (const field of adapter.settings_fields) {
      const raw = settings[field.key]?.trim() ?? "";
      if (field.type === "number") {
        normalizedSettings[field.key] = raw
          ? Number.parseInt(raw, 10)
          : undefined;
      } else if (field.type === "boolean") {
        normalizedSettings[field.key] = raw === "true" || raw === "1";
      } else {
        normalizedSettings[field.key] = raw || undefined;
      }
    }
    onSubmit({
      adapter_id: adapter.id as KbSourceAdapterId,
      enabled: sourceEnabled,
      missing_item_strategy: missingStrategyCustomize ? strategy : "ignore",
      name: name.trim() || defaultKbSourceName(adapter, normalizedSettings),
      schedule: {
        cron_expression:
          scheduleFields.enabled && scheduleFields.kind === "cron"
            ? scheduleFields.cron_expression?.trim() || null
            : null,
        enabled: scheduleFields.enabled,
        interval_minutes:
          scheduleFields.enabled && scheduleFields.kind === "interval"
            ? scheduleFields.interval_minutes
            : null,
        kind: scheduleFields.enabled ? scheduleFields.kind : "interval",
      },
      settings: normalizedSettings,
    });
  }, [
    adapter,
    missingStrategyCustomize,
    name,
    onSubmit,
    scheduleFields,
    settings,
    sourceEnabled,
    strategy,
  ]);

  const requiredSettingsSatisfied = useMemo(() => {
    if (!adapter) {
      return false;
    }
    return adapter.settings_fields
      .filter((f) => f.required)
      .every((f) => Boolean((settings[f.key] ?? "").toString().trim()));
  }, [adapter, settings]);

  useImperativeHandle(ref, () => ({ submit }), [submit]);

  useEffect(() => {
    if (!onCanSubmitChange) {
      return;
    }
    onCanSubmitChange(requiredSettingsSatisfied);
  }, [onCanSubmitChange, requiredSettingsSatisfied]);

  const scheduleFieldLabels: DocumentSourceScheduleFieldsLabels = {
    cronBuilderLink: t("sources.schedule_cron_builder_link"),
    cronExpression: t("sources.schedule_cron_expression"),
    cronHint: t("sources.schedule_cron_hint"),
    intervalMinutes: t("sources.interval_minutes"),
    presetDailyNine: t("sources.schedule_preset_daily_nine"),
    presetEveryFifteen: t("sources.schedule_preset_every_fifteen"),
    presetHourly: t("sources.schedule_preset_hourly"),
    presetWeekdayNine: t("sources.schedule_preset_weekday_nine"),
    preview: t("sources.schedule_preview"),
    tabCron: t("sources.schedule_tab_cron"),
    tabInterval: t("sources.schedule_tab_interval"),
  };

  /** Matches create-dialog sections: bordered card on `bg-background`. */
  const settingsCardClass =
    "rounded-lg border-0 bg-card p-4 sm:p-5 ui-canvas-panel";

  return (
    <>
      <div
        className={cn(
          "space-y-5 pr-1",
          isPage ? "sm:pr-0" : "max-h-[min(70vh,36rem)] overflow-y-auto"
        )}
      >
        <div className="grid gap-2">
          <Label>{t("sources.name_optional")}</Label>
          <Input onChange={(e) => setName(e.target.value)} value={name} />
        </div>
        {adapterLocked ? null : (
          <div className="grid gap-2">
            <Label>{t("sources.adapter")}</Label>
            <Select
              disabled={!!source}
              onValueChange={setAdapterId}
              value={adapterId}
            >
              <SelectTrigger>
                <SelectValue>
                  {adapters.find((a) => a.id === adapterId)?.label ?? adapterId}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {adapters.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {(adapter?.settings_fields.length ?? 0) > 0 ? (
          <div className={settingsCardClass}>
            <SourceAdapterSettingsFields
              descriptor={adapter}
              onChange={setSettings}
              settings={settings}
            />
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-semibold text-sm leading-none">
                {t("sources.section_update_strategy")}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t("sources.section_update_strategy_desc")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
              <Label
                className="cursor-pointer font-normal text-sm"
                htmlFor="kb-missing-strategy-customize"
              >
                {t("sources.missing_strategy_customize_switch")}
              </Label>
              <Switch
                checked={missingStrategyCustomize}
                id="kb-missing-strategy-customize"
                onCheckedChange={(v) => {
                  const on = v === true;
                  setMissingStrategyCustomize(on);
                  if (!on) {
                    setStrategy("ignore");
                  }
                }}
              />
            </div>
          </div>
          {missingStrategyCustomize ? (
            <div className={settingsCardClass}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <Label
                  className="shrink-0 text-sm sm:min-w-[10rem]"
                  htmlFor="kb-source-missing-strategy"
                >
                  {t("sources.missing_items")}
                </Label>
                <Select onValueChange={setStrategy} value={strategy}>
                  <SelectTrigger
                    className="w-full sm:max-w-xs"
                    id="kb-source-missing-strategy"
                  >
                    <SelectValue>
                      {missingItemStrategyLabel(strategy, t)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(adapter?.missing_item_strategies ?? ["ignore"]).map(
                      (item) => (
                        <SelectItem key={item} value={item}>
                          {missingItemStrategyLabel(item, t)}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="font-semibold text-sm leading-none">
                {t("sources.section_schedule")}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t("sources.section_schedule_desc")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
              <Label
                className="cursor-pointer font-normal text-sm"
                htmlFor="kb-source-schedule-enabled"
              >
                {t("sources.refresh_on_schedule")}
              </Label>
              <Switch
                checked={scheduleFields.enabled}
                id="kb-source-schedule-enabled"
                onCheckedChange={(v) =>
                  setScheduleFields((cur) => ({
                    ...cur,
                    enabled: v === true,
                  }))
                }
              />
            </div>
          </div>
          {scheduleFields.enabled ? (
            <DocumentSourceScheduleFields
              disabled={false}
              labels={scheduleFieldLabels}
              onChange={setScheduleFields}
              value={scheduleFields}
            />
          ) : null}
        </div>
      </div>
      {inlineFooter ? (
        <div
          className={cn(
            "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
            isPage && "mt-8 border-border border-t pt-6"
          )}
        >
          <Button onClick={onCancel} size="sm" type="button" variant="outline">
            {t("inbox.cancel")}
          </Button>
          <Button
            disabled={saving || !requiredSettingsSatisfied}
            onClick={submit}
            size="sm"
            type="button"
            variant={source ? "outline" : "default"}
          >
            {source
              ? t("sources.save")
              : (submitLabel ?? t("sources.create_source"))}
          </Button>
        </div>
      ) : null}
    </>
  );
}
