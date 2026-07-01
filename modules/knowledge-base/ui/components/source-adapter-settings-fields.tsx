import { useTranslation } from "@engenty/i18n/ui";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@engenty/ui-core";
import type { KbSourceAdapterDescriptor } from "../api.js";

function deriveBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    segments.pop();
    parsed.pathname = segments.length > 0 ? `/${segments.join("/")}/` : "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function valueToInput(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

export interface SourceAdapterSettingsFieldsProps {
  descriptor: KbSourceAdapterDescriptor | undefined;
  onChange: (next: Record<string, string>) => void;
  settings: Record<string, string>;
}

/** Renders `settings_fields` from a source adapter descriptor (controlled string map). */
export function SourceAdapterSettingsFields({
  descriptor,
  onChange,
  settings,
}: SourceAdapterSettingsFieldsProps) {
  const { t } = useTranslation("kb");

  if (!descriptor?.settings_fields.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-5">
      {descriptor.settings_fields.map((field) => {
        const useHttpStrategyCopy =
          (descriptor.id === "url" ||
            descriptor.id === "sitemap" ||
            descriptor.id === "web_index") &&
          field.key === "strategy";
        const labelText = useHttpStrategyCopy
          ? t("sources.url_http_strategy")
          : field.label;
        const showLabel =
          field.type !== "boolean" &&
          !field.control_only &&
          Boolean(labelText.trim());
        const descriptionText = useHttpStrategyCopy
          ? t("sources.url_http_strategy_desc")
          : (field.description?.trim() ?? "");
        const showDescription =
          !field.control_only && Boolean(descriptionText.trim());
        const controlId = `kb-src-${descriptor.id}-${field.key}`;
        const ariaLabel = labelText.trim() || field.key;
        const isInlineEnd = field.row_layout === "inline_end";
        const selectInlineEnd = field.type === "select" && isInlineEnd;

        const selectControl = (
          <Select
            onValueChange={(value) =>
              onChange({ ...settings, [field.key]: value })
            }
            value={settings[field.key] || field.options?.[0]?.value || ""}
          >
            <SelectTrigger aria-label={ariaLabel} id={controlId}>
              <SelectValue>
                {field.options?.find(
                  (opt) =>
                    opt.value ===
                    (settings[field.key] || field.options?.[0]?.value || "")
                )?.label ?? settings[field.key]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

        if (selectInlineEnd) {
          return (
            <div
              className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              key={field.key}
            >
              <div className="min-w-0 flex-1 space-y-1">
                {showLabel ? (
                  <Label className="text-sm" htmlFor={controlId}>
                    {labelText}
                  </Label>
                ) : null}
                {showDescription ? (
                  <p className="text-muted-foreground text-xs leading-snug">
                    {descriptionText}
                  </p>
                ) : null}
              </div>
              <div className="flex w-full shrink-0 justify-end sm:w-44 sm:max-w-xs">
                {selectControl}
              </div>
            </div>
          );
        }

        if (
          isInlineEnd &&
          field.type !== "select" &&
          field.type !== "boolean" &&
          field.type !== "textarea"
        ) {
          return (
            <div
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              key={field.key}
            >
              <div className="min-w-0 flex-1 space-y-1">
                {showLabel ? (
                  <Label className="text-sm" htmlFor={controlId}>
                    {labelText}
                  </Label>
                ) : null}
                {showDescription ? (
                  <p className="text-muted-foreground text-xs leading-snug">
                    {descriptionText}
                  </p>
                ) : null}
              </div>
              <div className="flex w-full shrink-0 justify-end sm:w-28">
                <Input
                  className="text-right"
                  id={controlId}
                  onChange={(e) =>
                    onChange({ ...settings, [field.key]: e.target.value })
                  }
                  placeholder={
                    field.default_value === undefined
                      ? undefined
                      : String(field.default_value)
                  }
                  type={field.type === "number" ? "number" : "text"}
                  value={settings[field.key] ?? ""}
                />
              </div>
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-2" key={field.key}>
            {field.type === "boolean" ? null : showLabel ? (
              <Label className="text-sm" htmlFor={controlId}>
                {labelText}
              </Label>
            ) : null}
            {showDescription ? (
              <p className="text-muted-foreground text-xs leading-snug">
                {descriptionText}
              </p>
            ) : null}
            {field.type === "select" ? (
              selectControl
            ) : field.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={settings[field.key] === "true"}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      [field.key]: e.target.checked ? "true" : "false",
                    })
                  }
                  type="checkbox"
                />
                {field.label}
              </label>
            ) : field.type === "textarea" ? (
              <Textarea
                className="min-h-[4rem] resize-none overflow-hidden font-mono text-sm"
                id={controlId}
                onChange={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                  onChange({ ...settings, [field.key]: e.target.value });
                }}
                placeholder={
                  field.default_value === undefined
                    ? undefined
                    : String(field.default_value)
                }
                ref={(el) => {
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }
                }}
                value={settings[field.key] ?? ""}
              />
            ) : (
              <Input
                id={controlId}
                onChange={(e) => {
                  const next: Record<string, string> = {
                    ...settings,
                    [field.key]: e.target.value,
                  };
                  if (
                    descriptor?.id === "web_index" &&
                    field.key === "index_url" &&
                    !settings.restrict_to_base_urls?.trim()
                  ) {
                    const base = deriveBaseUrl(e.target.value);
                    if (base) {
                      next.restrict_to_base_urls = base;
                    }
                  }
                  onChange(next);
                }}
                placeholder={
                  field.default_value === undefined
                    ? undefined
                    : String(field.default_value)
                }
                type={
                  field.type === "number"
                    ? "number"
                    : field.type === "url"
                      ? "url"
                      : "text"
                }
                value={settings[field.key] ?? ""}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export { valueToInput };
