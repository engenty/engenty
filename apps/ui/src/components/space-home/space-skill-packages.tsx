/**
 * Skills as packages: one card per category. Opening a package shows its
 * playbooks. Adding a package mounts the whole set; a playbook can still
 * be toggled on its own.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { spaceMountKey } from "@engenty/ui-plugin-sdk";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { SpaceCatalogItem } from "@/components/spaces/space-mount-catalog";
import { byCategory } from "@/components/spaces/space-mount-catalog";
import {
  type SpaceSelection,
  skillPackFullySelected,
  toggleSelection,
  toggleSkillPack,
} from "@/components/spaces/space-setup-selection";

export function SpaceSkillPackages({
  onChange,
  selection,
  skills,
}: {
  onChange: (selection: SpaceSelection) => void;
  selection: SpaceSelection;
  skills: SpaceCatalogItem[];
}) {
  const { t } = useTranslation("common");
  const packs = useMemo(() => byCategory(skills), [skills]);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const open = packs.find(([category]) => category === openCategory);

  if (open) {
    const [category, items] = open;
    const ids = items.map((item) => item.id);
    const full = skillPackFullySelected(selection, ids);
    return (
      <div className="flex flex-col gap-3">
        <button
          className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
          onClick={() => setOpenCategory(null)}
          type="button"
        >
          <ArrowLeft className="size-3.5" />
          {t("spaces.home.extensions.tabSkills", { defaultValue: "Skills" })}
        </button>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium text-sm">
            {t(`spaces.categories.${category}`, { defaultValue: category })}
          </h3>
          <Button
            onClick={() => onChange(toggleSkillPack(selection, ids, !full))}
            size="sm"
            type="button"
            variant="outline"
          >
            {full
              ? t("spaces.setup.removePackage")
              : t("spaces.setup.addPackage")}
          </Button>
        </div>
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const selected = selection.has(
              spaceMountKey({ resourceKey: item.id, resourceType: "skill" })
            );
            return (
              <li key={item.id}>
                <button
                  className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent/50"
                  onClick={() =>
                    onChange(
                      toggleSelection(
                        selection,
                        { resourceKey: item.id, resourceType: "skill" },
                        !selected
                      )
                    )
                  }
                  type="button"
                >
                  <span
                    className={
                      selected
                        ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                        : "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border"
                    }
                  >
                    {selected ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-sm">
                      {item.name}
                    </span>
                    {item.description ? (
                      <span className="line-clamp-2 text-muted-foreground text-xs">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {packs.map(([category, items]) => {
        const ids = items.map((item) => item.id);
        const selectedCount = ids.filter((id) =>
          selection.has(
            spaceMountKey({ resourceKey: id, resourceType: "skill" })
          )
        ).length;
        const full = selectedCount === ids.length && ids.length > 0;
        return (
          <div
            className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-3"
            key={category}
          >
            <Sparkles className="size-8 shrink-0 text-muted-foreground" />
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => setOpenCategory(category)}
              type="button"
            >
              <p className="truncate font-medium text-sm">
                {t(`spaces.categories.${category}`, {
                  defaultValue: category,
                })}
              </p>
              <p className="text-muted-foreground text-xs">
                {selectedCount > 0 && !full
                  ? t("spaces.home.extensions.skillsPartial", {
                      count: ids.length,
                      selected: selectedCount,
                    })
                  : t(
                      ids.length === 1
                        ? "spaces.home.extensions.skillsCountOne"
                        : "spaces.home.extensions.skillsCount",
                      { count: ids.length }
                    )}
              </p>
            </button>
            {full ? (
              <button
                aria-label={t("spaces.setup.removePackage")}
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                onClick={() => onChange(toggleSkillPack(selection, ids, false))}
                type="button"
              >
                <Check className="size-4" />
              </button>
            ) : (
              <Button
                className="shrink-0"
                onClick={() => onChange(toggleSkillPack(selection, ids, true))}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("spaces.setup.addPackage")}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
