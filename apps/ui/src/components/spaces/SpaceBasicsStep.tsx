import { useTranslation } from "@engenty/i18n/ui";
import { cn, Input, Label, Switch } from "@engenty/ui-core";
import {
  Briefcase,
  FlaskConical,
  Lock,
  SquareDashed,
  Users,
} from "lucide-react";
import type { SpaceSetupCatalog } from "@/lib/api/spaces-client";
import { SpaceAppearanceChooser } from "./SpaceAppearanceChooser";
import type { SpaceAppearanceValue } from "./SpaceAppearanceFields";

const TEMPLATE_ICONS = {
  blank: SquareDashed,
  client: Briefcase,
  personal: Lock,
  research: FlaskConical,
  team: Users,
} as const;

export function SpaceBasicsStep({
  appearance,
  derivedKey,
  name,
  onAppearanceChange,
  onNameChange,
  onTemplateChange,
  onVisibilityChange,
  templateId,
  templates,
  visibility,
}: {
  appearance: SpaceAppearanceValue;
  derivedKey: string;
  name: string;
  onAppearanceChange: (
    update: (previous: SpaceAppearanceValue) => SpaceAppearanceValue
  ) => void;
  onNameChange: (name: string) => void;
  onTemplateChange: (templateId: string) => void;
  onVisibilityChange: (visibility: "open" | "private") => void;
  templateId: string;
  templates: SpaceSetupCatalog["templates"];
  visibility: "open" | "private";
}) {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="space-name">{t("spaces.setup.nameLabel")}</Label>
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            className="min-w-0 flex-1"
            id="space-name"
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={t("spaces.setup.namePlaceholder")}
            value={name}
          />
          <SpaceAppearanceChooser
            name={name}
            onChange={onAppearanceChange}
            value={appearance}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          {t("spaces.setup.keyPreview", { key: derivedKey || "—" })}
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="font-medium text-sm">
          {t("spaces.createWizard.purposeTitle")}
        </legend>
        <p className="text-muted-foreground text-xs">
          {t("spaces.createWizard.purposeHint")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {templates.map((template) => {
            const Icon =
              TEMPLATE_ICONS[template.id as keyof typeof TEMPLATE_ICONS] ??
              Briefcase;
            const selected = template.id === templateId;
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:bg-muted/40"
                )}
                key={template.id}
                onClick={() => onTemplateChange(template.id)}
                type="button"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--ember-tint)]">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-sm">
                    {t(`spaces.templates.${template.id}.name`, {
                      defaultValue: template.name,
                    })}
                  </span>
                  <span className="mt-0.5 block text-muted-foreground text-xs">
                    {t(`spaces.templates.${template.id}.description`, {
                      defaultValue: template.description,
                    })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-start justify-between gap-4 rounded-xl border px-3 py-3">
        <div className="space-y-0.5">
          <Label className="cursor-pointer" htmlFor="space-visibility">
            {t("spaces.setup.privateLabel")}
          </Label>
          <p className="text-muted-foreground text-xs">
            {visibility === "private"
              ? t("spaces.setup.privateHint")
              : t("spaces.setup.openHint")}
          </p>
        </div>
        <Switch
          checked={visibility === "private"}
          id="space-visibility"
          onCheckedChange={(checked) =>
            onVisibilityChange(checked ? "private" : "open")
          }
        />
      </div>
    </div>
  );
}
