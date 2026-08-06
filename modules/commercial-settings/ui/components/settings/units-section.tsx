import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Input,
  SettingsFieldsDataRow,
  SettingsFieldsHeaderRow,
  SettingsFieldsInset,
  SettingsFieldsRowEndSlot,
  settingsFieldsEditableInputClass,
  settingsFieldsLockedInputClass,
} from "@engenty/ui-core";
import { Lock, Plus, Trash2 } from "lucide-react";
import type { Unit } from "../../api.js";
import {
  BUILT_IN_UNIT_KEYS,
  resolveBuiltInUnits,
} from "../../lib/locale-config.js";

interface UnitsSectionProps {
  onUnitsChange: (units: Unit[]) => void;
  units: Unit[];
}

export function UnitsSection({ units, onUnitsChange }: UnitsSectionProps) {
  const { t } = useTranslation("commercial-settings");
  const builtInUnits = resolveBuiltInUnits(t);
  // Custom rows only — built-in keys are rendered from i18n above.
  const customUnits = units.filter(
    (unit) =>
      !BUILT_IN_UNIT_KEYS.includes(
        unit.name as (typeof BUILT_IN_UNIT_KEYS)[number]
      )
  );

  const addUnit = () => {
    onUnitsChange([...customUnits, { name: "", label: "", singular: "" }]);
  };

  const removeUnit = (index: number) => {
    onUnitsChange(customUnits.filter((_, i) => i !== index));
  };

  const updateUnit = (index: number, field: keyof Unit, value: string) => {
    const updated = [...customUnits];
    updated[index] = { ...updated[index], [field]: value };
    onUnitsChange(updated);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t("sections.units")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("sections.unitsDesc")}
        </p>
      </div>
      <SettingsFieldsInset>
        <SettingsFieldsHeaderRow>
          <span className="w-20">{t("sections.abbreviation")}</span>
          <span className="min-w-0 flex-1">{t("sections.description")}</span>
          <span className="min-w-0 flex-1">{t("sections.singular")}</span>
          <div className="w-7" />
        </SettingsFieldsHeaderRow>
        {builtInUnits.map((unit) => (
          <SettingsFieldsDataRow key={`builtin-${unit.name}`}>
            <Input
              className={cn(settingsFieldsLockedInputClass, "w-20")}
              disabled
              value={unit.name}
            />
            <Input
              className={cn(settingsFieldsLockedInputClass, "min-w-0 flex-1")}
              disabled
              value={unit.label}
            />
            <Input
              className={cn(settingsFieldsLockedInputClass, "min-w-0 flex-1")}
              disabled
              value={unit.singular}
            />
            <SettingsFieldsRowEndSlot>
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            </SettingsFieldsRowEndSlot>
          </SettingsFieldsDataRow>
        ))}
        {customUnits.map((unit, index) => (
          <SettingsFieldsDataRow key={`custom-${index}-${unit.name}`}>
            <Input
              className={cn(settingsFieldsEditableInputClass, "w-20")}
              onChange={(e) => updateUnit(index, "name", e.target.value)}
              placeholder={t("sections.abbreviation")}
              value={unit.name}
            />
            <Input
              className={cn(settingsFieldsEditableInputClass, "min-w-0 flex-1")}
              onChange={(e) => updateUnit(index, "label", e.target.value)}
              placeholder={t("sections.description")}
              value={unit.label}
            />
            <Input
              className={cn(settingsFieldsEditableInputClass, "min-w-0 flex-1")}
              onChange={(e) => updateUnit(index, "singular", e.target.value)}
              placeholder={t("sections.singularPlaceholder")}
              value={unit.singular ?? ""}
            />
            <Button
              className="h-7 w-7 shrink-0"
              onClick={() => removeUnit(index)}
              size="icon"
              variant="ghost"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </SettingsFieldsDataRow>
        ))}
        <Button
          className="h-7 text-xs"
          onClick={addUnit}
          size="sm"
          variant="outline"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("sections.addUnit")}
        </Button>
      </SettingsFieldsInset>
    </div>
  );
}
