// Standing config for one destination, driven by the provider's config_schema.
import { useTranslation } from "@engenty/i18n/ui";
import { Input, Label, Switch, Textarea } from "@engenty/ui-core";
import { RoutineAgentSelect } from "./routine-agent-select.js";
import type { OutcomeFormValue } from "./routine-outcome-form-value.js";
import {
  type JsonSchemaProperty,
  schemaObject,
} from "./routine-outcome-form-value.js";
import type { OutcomeProviderDto } from "./routines-api.js";

function primaryType(type: string | string[] | undefined): string | undefined {
  if (Array.isArray(type)) {
    return type.find((entry) => entry !== "null");
  }
  return type;
}

function fieldLabel(name: string, prop: JsonSchemaProperty): string {
  return typeof prop.title === "string" && prop.title.trim()
    ? prop.title
    : name.replaceAll("_", " ");
}

function isSecretField(name: string, prop: JsonSchemaProperty): boolean {
  return (
    name.toLowerCase().includes("secret") ||
    prop.format === "password" ||
    name === "secret"
  );
}

export function OutcomeConfigFields({
  idPrefix,
  onChange,
  provider,
  value,
}: {
  idPrefix: string;
  onChange: (next: OutcomeFormValue) => void;
  provider: OutcomeProviderDto | null;
  value: OutcomeFormValue;
}) {
  const { t } = useTranslation("ai-ui");
  if (!provider) {
    return null;
  }
  const { properties } = schemaObject(provider.config_schema);
  const entries = Object.entries(properties ?? {});
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("routines.outcomes.noConfig")}
      </p>
    );
  }

  const setConfig = (key: string, next: unknown) =>
    onChange({ ...value, config: { ...value.config, [key]: next } });

  return (
    <div className="space-y-3">
      {entries.map(([name, prop]) => {
        const fieldId = `${idPrefix}-${name}`;
        const type = primaryType(prop.type);
        const current = value.config[name];
        if (name === "agent_id" && (type === "string" || type === undefined)) {
          return (
            <div className="space-y-1.5" key={name}>
              <Label htmlFor={fieldId}>{fieldLabel(name, prop)}</Label>
              <RoutineAgentSelect
                hideLabel
                id={fieldId}
                onChange={(agentId) => setConfig(name, agentId)}
                value={typeof current === "string" ? current : ""}
              />
              {prop.description ? (
                <p className="text-muted-foreground text-xs">
                  {prop.description}
                </p>
              ) : null}
            </div>
          );
        }
        if (type === "boolean") {
          return (
            <div
              className="flex items-center justify-between rounded-md border border-border-soft px-3 py-2"
              key={name}
            >
              <Label htmlFor={fieldId}>{fieldLabel(name, prop)}</Label>
              <Switch
                checked={current === true}
                id={fieldId}
                onCheckedChange={(checked) => setConfig(name, checked)}
              />
            </div>
          );
        }
        if (Array.isArray(prop.enum) && prop.enum.length > 0) {
          return (
            <div className="space-y-1.5" key={name}>
              <Label htmlFor={fieldId}>{fieldLabel(name, prop)}</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                id={fieldId}
                onChange={(e) => setConfig(name, e.target.value)}
                value={typeof current === "string" ? current : ""}
              >
                <option value="">{t("routines.outcomes.choose")}</option>
                {prop.enum.map((option) => (
                  <option key={String(option)} value={String(option)}>
                    {String(option)}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        if (type === "number" || type === "integer") {
          return (
            <div className="space-y-1.5" key={name}>
              <Label htmlFor={fieldId}>{fieldLabel(name, prop)}</Label>
              <Input
                id={fieldId}
                inputMode="decimal"
                onChange={(e) =>
                  setConfig(
                    name,
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                type="number"
                value={typeof current === "number" ? String(current) : ""}
              />
            </div>
          );
        }
        if (type === "object" || type === "array") {
          return (
            <div className="space-y-1.5" key={name}>
              <Label htmlFor={fieldId}>{fieldLabel(name, prop)}</Label>
              <Textarea
                className="min-h-[64px] font-mono text-xs"
                id={fieldId}
                onChange={(e) => setConfig(name, e.target.value)}
                value={
                  typeof current === "string"
                    ? current
                    : current
                      ? JSON.stringify(current, null, 2)
                      : ""
                }
              />
            </div>
          );
        }
        const inputType = isSecretField(name, prop)
          ? "password"
          : prop.format === "email" || name === "to"
            ? "email"
            : prop.format === "uri" || name === "url"
              ? "url"
              : "text";
        return (
          <div className="space-y-1.5" key={name}>
            <Label htmlFor={fieldId}>{fieldLabel(name, prop)}</Label>
            <Input
              autoComplete="off"
              id={fieldId}
              onChange={(e) => setConfig(name, e.target.value)}
              type={inputType}
              value={typeof current === "string" ? current : ""}
            />
            {prop.description ? (
              <p className="text-muted-foreground text-xs">
                {prop.description}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
