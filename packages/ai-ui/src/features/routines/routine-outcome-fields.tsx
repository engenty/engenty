import { useTranslation } from "@engenty/i18n/ui";
import { Input, Label, Switch } from "@engenty/ui-core";
import { OutcomeConfigFields } from "./routine-outcome-config-fields.js";
import {
  defaultConfigFromSchema,
  type OutcomeFormValue,
} from "./routine-outcome-form-value.js";
import type { OutcomeProviderDto } from "./routines-api.js";

function providerLabel(
  provider: OutcomeProviderDto,
  t: (key: string, options?: { defaultValue: string }) => string
): string {
  return t(`routines.outcomes.providers.${provider.id}`, {
    defaultValue: provider.label,
  });
}

export function OutcomeFields({
  idPrefix,
  onChange,
  providers,
  value,
}: {
  idPrefix: string;
  onChange: (next: OutcomeFormValue) => void;
  providers: OutcomeProviderDto[];
  value: OutcomeFormValue;
}) {
  const { t } = useTranslation("ai-ui");
  const provider =
    providers.find((entry) => entry.id === value.providerId) ?? null;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-provider`}>
          {t("routines.outcomes.provider")}
        </Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          id={`${idPrefix}-provider`}
          onChange={(e) => {
            const next = providers.find((entry) => entry.id === e.target.value);
            onChange({
              ...value,
              config: defaultConfigFromSchema(next?.config_schema),
              providerId: e.target.value,
            });
          }}
          value={value.providerId}
        >
          <option value="">{t("routines.outcomes.chooseProvider")}</option>
          {providers.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {providerLabel(entry, t)}
            </option>
          ))}
        </select>
        {provider ? (
          <p className="text-muted-foreground text-xs">
            {t(`routines.outcomes.providerHints.${provider.id}`, {
              defaultValue: provider.description,
            })}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-description`}>
          {t("routines.outcomes.purpose")}
        </Label>
        <Input
          id={`${idPrefix}-description`}
          maxLength={160}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder={t("routines.outcomes.purposePlaceholder")}
          value={value.description}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-mode`}>
          {t("routines.outcomes.mode")}
        </Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          id={`${idPrefix}-mode`}
          onChange={(e) =>
            onChange({
              ...value,
              mode: e.target.value as OutcomeFormValue["mode"],
            })
          }
          value={value.mode}
        >
          <option value="always">{t("routines.outcomes.modes.always")}</option>
          <option value="agent">{t("routines.outcomes.modes.agent")}</option>
        </select>
        <p className="text-muted-foreground text-xs">
          {t(`routines.outcomes.modeHints.${value.mode}`)}
        </p>
      </div>

      <OutcomeConfigFields
        idPrefix={idPrefix}
        onChange={onChange}
        provider={provider}
        value={value}
      />

      <div className="flex items-center justify-between rounded-md border border-border-soft px-3 py-2">
        <span className="text-sm">{t("routines.outcomes.enabled")}</span>
        <Switch
          checked={value.enabled}
          onCheckedChange={(checked) =>
            onChange({ ...value, enabled: checked })
          }
        />
      </div>
    </div>
  );
}
