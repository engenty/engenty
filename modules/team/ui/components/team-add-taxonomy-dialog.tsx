/**
 * TeamAddTaxonomyDialog — create a new custom taxonomy.
 * Derives the slug automatically from the label; user can override it.
 * Plural label is stored in config.plural_label.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@engenty/ui-core";
import { useCallback, useEffect, useState } from "react";
import { createTaxonomy, type TeamTaxonomy } from "../api.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

interface Props {
  onOpenChange: (open: boolean) => void;
  onSuccess: (taxonomy: TeamTaxonomy) => void;
  open: boolean;
}

export function TeamAddTaxonomyDialog({
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const { t } = useTranslation("team");
  const [label, setLabel] = useState("");
  const [pluralLabel, setPluralLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [target, setTarget] = useState<"profile" | "group">("profile");
  const [supportsHierarchy, setSupportsHierarchy] = useState(false);
  const [cardinality, setCardinality] = useState<"single" | "multiple">(
    "single"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setLabel("");
      setPluralLabel("");
      setSlug("");
      setSlugManual(false);
      setTarget("profile");
      setSupportsHierarchy(false);
      setCardinality("single");
      setSaving(false);
      setError(null);
    }
  }, [open]);

  const handleLabelChange = useCallback(
    (val: string) => {
      setLabel(val);
      if (!slugManual) {
        setSlug(slugify(val));
      }
    },
    [slugManual]
  );

  const handleSlugChange = (val: string) => {
    setSlugManual(true);
    setSlug(slugify(val) || val.toLowerCase());
  };

  const handleSubmit = async () => {
    if (!(label.trim() && slug.trim())) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createTaxonomy({
        slug: slug.trim(),
        label: label.trim(),
        target,
        supports_hierarchy: supportsHierarchy,
        supports_order: true,
        cardinality,
        filterable: true,
        config: pluralLabel.trim() ? { plural_label: pluralLabel.trim() } : {},
      });
      onSuccess(result);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.addTaxonomy")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Label */}
          <div className="space-y-1.5">
            <Label>{t("settings.taxonomyName")}</Label>
            <Input
              autoFocus
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder={t("settings.taxonomyNamePlaceholder")}
              value={label}
            />
          </div>

          {/* Plural */}
          <div className="space-y-1.5">
            <Label>{t("settings.taxonomyPlural")}</Label>
            <Input
              onChange={(e) => setPluralLabel(e.target.value)}
              placeholder={pluralLabel || `${label}s`}
              value={pluralLabel}
            />
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <Label>{t("settings.taxonomySlug")}</Label>
            <Input
              className="font-mono text-sm"
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="my-taxonomy"
              value={slug}
            />
            <p className="text-muted-foreground text-xs">
              {t("settings.taxonomySlugHint")}
            </p>
          </div>

          {/* Target */}
          <div className="space-y-1.5">
            <Label>{t("settings.taxonomyTarget")}</Label>
            <Select
              onValueChange={(v) => setTarget(v as "profile" | "group")}
              value={target}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    target === "profile"
                      ? t("settings.targetProfile")
                      : t("settings.targetGroup")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="profile">
                  {t("settings.targetProfile")}
                </SelectItem>
                <SelectItem value="group">
                  {t("settings.targetGroup")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Cardinality */}
          <div className="space-y-1.5">
            <Label>{t("settings.taxonomyCardinality")}</Label>
            <Select
              onValueChange={(v) => setCardinality(v as "single" | "multiple")}
              value={cardinality}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    cardinality === "single"
                      ? t("settings.cardinalitySingle")
                      : t("settings.cardinalityMultiple")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">
                  {t("settings.cardinalitySingle")}
                </SelectItem>
                <SelectItem value="multiple">
                  {t("settings.cardinalityMultiple")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Hierarchical toggle */}
          <div className="flex items-center gap-3">
            <Switch
              checked={supportsHierarchy}
              id="supports-hierarchy"
              onCheckedChange={setSupportsHierarchy}
            />
            <Label htmlFor="supports-hierarchy">
              {t("settings.taxonomyHierarchical")}
            </Label>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={!(label.trim() && slug.trim()) || saving}
            onClick={handleSubmit}
            type="button"
          >
            {saving ? t("loading") : t("settings.createTaxonomy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
