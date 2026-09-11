import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, Checkbox, Label } from "@engenty/ui-core";
import { type SpaceResourceKind, spaceMountKey } from "@engenty/ui-plugin-sdk";
import type { Dispatch, SetStateAction } from "react";
import { byCategory, type SpaceCatalogItem } from "./space-mount-catalog";
import {
  type SpaceSelection,
  skillPackFullySelected,
  toggleSelection,
  toggleSkillPack,
} from "./space-setup-selection";

export function SpaceResourcePicker({
  items,
  kind,
  lockedKeys,
  selection,
  setSelection,
}: {
  items: SpaceCatalogItem[];
  kind: SpaceResourceKind;
  lockedKeys: ReadonlySet<string>;
  selection: SpaceSelection;
  setSelection: Dispatch<SetStateAction<SpaceSelection>>;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="grid gap-x-6 md:grid-cols-2">
      {byCategory(items).map(([category, groupItems]) => {
        const mountable = groupItems.filter((item) => !item.needsConnect);
        if (mountable.length === 0) {
          return null;
        }
        const packIds = mountable.map((item) => item.id);
        const isLibraryPack =
          kind === "skill" &&
          mountable.length > 0 &&
          mountable.every((item) => item.source === "library");
        const packSelected = skillPackFullySelected(selection, packIds);
        return (
          <div className="mb-3" key={category}>
            <div className="flex items-center justify-between gap-2 px-2 pb-1">
              <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                {t(`spaces.categories.${category}`, {
                  defaultValue: category,
                })}
              </p>
              {isLibraryPack ? (
                <Button
                  className="h-auto px-1.5 py-0 text-[10px]"
                  onClick={() =>
                    setSelection((current) =>
                      toggleSkillPack(current, packIds, !packSelected)
                    )
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {packSelected
                    ? t("spaces.setup.removePackage")
                    : t("spaces.setup.addPackage")}
                </Button>
              ) : null}
            </div>
            {mountable.map((item) => {
              const key = spaceMountKey({
                resourceKey: item.id,
                resourceType: kind,
              });
              const checked = selection.has(key);
              const locked = lockedKeys.has(key);
              const inputId = `space-mount-${key}`;
              return (
                <div
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                  key={key}
                >
                  <Checkbox
                    checked={checked}
                    disabled={locked}
                    id={inputId}
                    onCheckedChange={(value) =>
                      setSelection((current) =>
                        toggleSelection(
                          current,
                          { resourceKey: item.id, resourceType: kind },
                          value === true
                        )
                      )
                    }
                  />
                  <Label
                    className="min-w-0 flex-1 cursor-pointer truncate font-normal"
                    htmlFor={inputId}
                    title={item.description ?? item.id}
                  >
                    {item.name}
                  </Label>
                  {locked ? (
                    <Badge className="shrink-0" variant="secondary">
                      {t("spaces.setup.required")}
                    </Badge>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
