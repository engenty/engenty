import { useTranslation } from "@engenty/i18n/ui";
import { Badge } from "@engenty/ui-core";
import type { SpaceMountDeclaration } from "@engenty/ui-plugin-sdk";
import { Boxes, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { isModuleSkill } from "./space-capability-recommendations";
import type { SpaceMountCatalog } from "./space-mount-catalog";
import type { SpaceSelection } from "./space-setup-selection";

const GROUPS = [
  { icon: Boxes, kind: "module", titleKey: "spaces.setup.appsTitle" },
  { icon: Sparkles, kind: "skill", titleKey: "spaces.setup.skillsTitle" },
] as const;

export function SpaceCreateReviewStep({
  baseline,
  catalog,
  name,
  selection,
  visibility,
}: {
  baseline: readonly SpaceMountDeclaration[];
  catalog: SpaceMountCatalog;
  name: string;
  selection: SpaceSelection;
  visibility: "open" | "private";
}) {
  const { t } = useTranslation("common");
  const baselineKeys = new Set(
    baseline.map((entry) => `${entry.resourceType}:${entry.resourceKey}`)
  );
  const catalogs = {
    module: catalog.modules,
    skill: catalog.skills,
  };
  const catalogModuleIds = useMemo(
    () => new Set(catalog.modules.map((module) => module.id)),
    [catalog.modules]
  );
  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="font-medium">{name}</p>
        <p className="mt-1 text-muted-foreground text-xs">
          {visibility === "private"
            ? t("spaces.createWizard.reviewPrivate")
            : t("spaces.createWizard.reviewOpen")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {GROUPS.map(({ icon: Icon, kind, titleKey }) => {
          const entries = [...selection.entries()].filter(([, entry]) => {
            if (entry.resourceType !== kind) {
              return false;
            }
            if (kind !== "skill") {
              return true;
            }
            const item = catalog.skills.find(
              (candidate) => candidate.id === entry.resourceKey
            );
            return !isModuleSkill(
              item ?? { id: entry.resourceKey },
              catalogModuleIds
            );
          });
          return (
            <section className="rounded-xl border p-3" key={kind}>
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-[var(--ember-tint)]">
                  <Icon className="size-3.5" />
                </span>
                <h3 className="font-medium text-sm">{t(titleKey)}</h3>
                <Badge className="ml-auto" variant="secondary">
                  {entries.length}
                </Badge>
              </div>
              {entries.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {t("spaces.createWizard.reviewNone")}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {entries.map(([key, entry]) => {
                    const item = catalogs[kind].find(
                      (candidate) => candidate.id === entry.resourceKey
                    );
                    return (
                      <li className="flex items-center gap-2 text-xs" key={key}>
                        <span className="min-w-0 flex-1 truncate">
                          {item?.name ?? entry.resourceKey}
                        </span>
                        {baselineKeys.has(key) ? (
                          <Badge variant="secondary">
                            {t("spaces.setup.required")}
                          </Badge>
                        ) : null}
                        {entry.resourceType === "module" ? (
                          <span className="text-muted-foreground">
                            {t(
                              `spaces.setup.moduleAccess.${entry.agentAccess ?? "none"}`
                            )}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        {visibility === "private"
          ? t("spaces.createWizard.peopleAfterPrivate")
          : t("spaces.createWizard.peopleAfterOpen")}
      </p>
    </div>
  );
}
