// Searchable multi-select over the skills catalog (replaces free-text skillIds).

import { useTranslation } from "@engenty/i18n/ui";
import { MultiSelect } from "@engenty/ui-core";
import { useMemo } from "react";
import { useAiSkillsQuery } from "../../lib/admin/ai-runtime-queries";
import { getSkillModuleId } from "../agents-workspace/skill-record-utils";
import { UnknownReferenceChips } from "./unknown-reference-chips";

export function SkillPicker({
  onChange,
  value,
}: {
  onChange: (skillIds: string[]) => void;
  value: string[];
}) {
  const { t } = useTranslation("ai-ui");
  const skillsQuery = useAiSkillsQuery();
  const skills = skillsQuery.data?.skills;

  const options = useMemo(
    () =>
      (skills ?? []).map((skill) => ({
        label: skill.title
          ? `${skill.title} (${getSkillModuleId(skill)})`
          : `${skill.name} (${getSkillModuleId(skill)})`,
        value: skill.name,
      })),
    [skills]
  );

  const knownNames = useMemo(
    () => new Set((skills ?? []).map((skill) => skill.name)),
    [skills]
  );
  // Saved references the catalog no longer knows. Only meaningful once the
  // catalog has loaded — otherwise everything would flash as unknown.
  const unknownIds = skills ? value.filter((id) => !knownNames.has(id)) : [];
  const knownSelected = skills
    ? value.filter((id) => knownNames.has(id))
    : value;

  return (
    <div className="grid gap-2">
      <UnknownReferenceChips
        ids={unknownIds}
        label={t("agentForm.skills.unknownWarning")}
        onRemove={(id) => onChange(value.filter((entry) => entry !== id))}
        removeLabel={t("agentForm.skills.removeUnknown")}
      />
      <MultiSelect
        defaultValue={knownSelected}
        disabled={skillsQuery.isLoading}
        onValueChange={(selected) => onChange([...selected, ...unknownIds])}
        options={options}
        placeholder={t("agentForm.skills.placeholder")}
        searchable
      />
      <p className="text-muted-foreground text-xs">
        {t("agentForm.skills.hint")}
      </p>
    </div>
  );
}
