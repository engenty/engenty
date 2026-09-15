/**
 * What a hire comes with, before it exists: the catalog floor every Engenty
 * keeps (read-only — not on the row, applied at every run) and, once a
 * template is picked, the tools and skills that template adds on top.
 */
import {
  LIVE_HIRE_SKILL_IDS,
  LIVE_HIRE_TOOL_IDS,
} from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { Badge } from "@engenty/ui-core";
import type { SpaceAgentHireTemplate } from "./space-agent-hire";

const FLOOR_TOOLS = new Set<string>(LIVE_HIRE_TOOL_IDS);
const FLOOR_SKILLS = new Set<string>(LIVE_HIRE_SKILL_IDS);

function ChipRow({
  ids,
  label,
  muted,
}: {
  ids: readonly string[];
  label: string;
  muted?: boolean;
}) {
  if (ids.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-1.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {ids.map((id) => (
          <li key={id}>
            <Badge
              className="font-mono font-normal text-xxs"
              variant={muted ? "outline" : "secondary"}
            >
              {id}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SpaceAgentHireCapabilities({
  template,
}: {
  template: SpaceAgentHireTemplate | null;
}) {
  const { t } = useTranslation("common");
  const extraTools = (template?.toolIds ?? []).filter(
    (id) => !FLOOR_TOOLS.has(id)
  );
  const extraSkills = (template?.skillIds ?? []).filter(
    (id) => !FLOOR_SKILLS.has(id)
  );
  return (
    <details className="group rounded-md border border-border-soft">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm">
        {t("spaces.agents.wizard.comesWith", { defaultValue: "Comes with" })}
        <span className="ml-2 text-muted-foreground text-xs">
          {t("spaces.agents.wizard.comesWithCount", {
            count: FLOOR_TOOLS.size + extraTools.length,
            defaultValue: "{{count}} tools",
          })}
        </span>
      </summary>
      <div className="grid gap-3 border-border-soft border-t px-3 py-3">
        <ChipRow
          ids={LIVE_HIRE_TOOL_IDS}
          label={t("spaces.agents.wizard.floorTools", {
            defaultValue:
              "Every Engenty has these — catalog, Space Data, colleagues, surface. Not editable.",
          })}
          muted
        />
        <ChipRow
          ids={extraTools}
          label={t("spaces.agents.wizard.templateTools", {
            defaultValue: "This role adds",
          })}
        />
        <ChipRow
          ids={[...LIVE_HIRE_SKILL_IDS, ...extraSkills]}
          label={t("spaces.agents.wizard.skills", { defaultValue: "Skills" })}
          muted
        />
      </div>
    </details>
  );
}
