import { useTranslation } from "@engenty/i18n/ui";
import { useMemo } from "react";

function humanizeSettingKey(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatSettingValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? "✓" : "—";
  }
  return String(value);
}

export function SourceDetailAdapterSettingsPanel({
  settings,
}: {
  settings: Record<string, unknown>;
}) {
  const { t } = useTranslation("kb");

  const rows = useMemo(
    () =>
      Object.entries(settings ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => ({
          key,
          label: humanizeSettingKey(key),
          value: formatSettingValue(value),
        })),
    [settings]
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t("sources.detail_settings")}
      </p>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div
            className="grid min-w-0 grid-cols-[10rem_1fr] items-baseline gap-x-3"
            key={row.key}
          >
            <span className="truncate text-muted-foreground text-xs">
              {row.label}
            </span>
            <span className="break-all text-sm">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
