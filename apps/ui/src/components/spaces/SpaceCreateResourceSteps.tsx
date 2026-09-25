import { useTranslation } from "@engenty/i18n/ui";
import type { SpaceMountDeclaration } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { SpaceModulePicker } from "./SpaceModulePicker";
import { SpaceOptionalResourcePicker } from "./SpaceOptionalResourcePicker";
import { isModuleSkill } from "./space-capability-recommendations";
import { optionalCount } from "./space-create-wizard-state";
import type { SpaceMountCatalog } from "./space-mount-catalog";
import type { SpaceSelection } from "./space-setup-selection";

interface StepProps {
  baseline: readonly SpaceMountDeclaration[];
  catalog: SpaceMountCatalog;
  onSelectionChange: (selection: SpaceSelection) => void;
  recommendedKeys: ReadonlySet<string>;
  selection: SpaceSelection;
}

function FocusHint({ count, kind }: { count: number; kind: "modules" }) {
  const { t } = useTranslation("common");
  const broad = count > 4;
  return (
    <p
      className={
        broad
          ? "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"
          : "text-muted-foreground text-xs"
      }
    >
      {t(
        broad
          ? `spaces.createWizard.focus.${kind}Broad`
          : `spaces.createWizard.focus.${kind}`,
        { count }
      )}
    </p>
  );
}

export function SpaceCreateModulesStep(props: StepProps) {
  const { t } = useTranslation("common");
  const count = optionalCount(props.selection, props.baseline, "module");
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">{t("spaces.setup.appsTitle")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("spaces.createWizard.modulesHint")}
        </p>
      </div>
      <FocusHint count={count} kind="modules" />
      <SpaceModulePicker
        commit={async (selection) => {
          props.onSelectionChange(selection);
          return true;
        }}
        items={props.catalog.modules}
        lockedKeys={props.catalog.lockedKeys}
        recommendedKeys={props.recommendedKeys}
        saving={false}
        selection={props.selection}
      />
    </div>
  );
}

/**
 * Optional skills for the new Space. Accounts are not picked here: a new
 * Space owns none yet — connect them from the Space once it exists.
 */
export function SpaceCreateOptionalStep({
  catalog,
  onSelectionChange,
  selection,
}: Pick<StepProps, "catalog" | "onSelectionChange" | "selection">) {
  const catalogModuleIds = useMemo(
    () => new Set(catalog.modules.map((module) => module.id)),
    [catalog.modules]
  );
  const pickerSkills = useMemo(
    () =>
      catalog.skills.filter((skill) => !isModuleSkill(skill, catalogModuleIds)),
    [catalog.skills, catalogModuleIds]
  );
  return (
    <SpaceOptionalResourcePicker
      commit={async (next) => {
        onSelectionChange(next);
        return true;
      }}
      items={pickerSkills}
      kind="skill"
      selection={selection}
    />
  );
}
