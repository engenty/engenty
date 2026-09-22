import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { Check } from "lucide-react";
import type { AiSkillRecord } from "../../lib/admin/ai-runtime-types.js";
import type { SkillPack } from "./agent-skill-packages-model.js";
import { PackIcon } from "./agent-skill-pack-icon.js";

export function AgentSkillPackageDetail({
  emoji,
  onToggle,
  onTogglePack,
  pack,
  selected,
}: {
  emoji: string | null;
  onToggle: (name: string, on: boolean) => void;
  onTogglePack: (names: string[], on: boolean) => void;
  pack: SkillPack;
  selected: ReadonlySet<string>;
}) {
  const { t } = useTranslation("ai-ui");
  const names = pack.skills.map((skill) => skill.name);
  const full = names.every((name) => selected.has(name));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <PackIcon emoji={emoji} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-base">{pack.title}</h2>
          {pack.description ? (
            <p className="text-muted-foreground text-sm">{pack.description}</p>
          ) : null}
        </div>
        <Button
          onClick={() => onTogglePack(names, !full)}
          size="sm"
          type="button"
          variant={full ? "outline" : "default"}
        >
          {full
            ? t("agentDesk.manage.skillsRemovePackage")
            : t("agentDesk.manage.skillsAddPackage")}
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-muted-foreground text-sm">
          {t("agentDesk.skills")}
        </h3>
        <ul className="overflow-hidden rounded-xl bg-muted/70">
          {pack.skills.map((skill) => (
            <li className="border-border/70 border-b last:border-b-0" key={skill.name}>
              <SkillRow
                onToggle={onToggle}
                selected={selected.has(skill.name)}
                skill={skill}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SkillRow({
  onToggle,
  selected,
  skill,
}: {
  onToggle: (name: string, on: boolean) => void;
  selected: boolean;
  skill: AiSkillRecord;
}) {
  return (
    <button
      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/40"
      onClick={() => onToggle(skill.name, !selected)}
      type="button"
    >
      <span
        className={
          selected
            ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border"
        }
      >
        {selected ? <Check className="size-3" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-sm">
          {skill.title?.trim() || skill.name}
        </span>
        {skill.description ? (
          <span className="line-clamp-2 text-muted-foreground text-xs">
            {skill.description}
          </span>
        ) : null}
      </span>
    </button>
  );
}
