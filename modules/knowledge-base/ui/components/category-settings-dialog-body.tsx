/**
 * Category settings dialog — name, slug, template, and sidebar tree layout.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  Input,
  Label,
  NumberStepper,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormRow,
} from "@engenty/ui-core";
import { Folder, LayoutList } from "lucide-react";
import type { ReactNode } from "react";
import type {
  KbArticleTemplate,
  KbCategory,
  KbCategoryCollectionSortBy,
  KbCategoryPageSettings,
  KbCategoryViewType,
  KbCommentsModeBinding,
  KbEffectiveCommentsMode,
  KbTemplateBindingMode,
} from "../../src/schema/types.js";
import { CategorySlugField } from "./category-slug-field.js";
import { KbCommentsModeSelect } from "./kb-comments-mode-fields.js";

const COLLECTION_SORT_BY: KbCategoryCollectionSortBy[] = [
  "sort_order",
  "created_at",
  "updated_at",
  "name",
];

export function slugifyCategoryName(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 128);
}

/** Manual slug edits — keep dashes, strip other invalid characters. */
export function sanitizeCategorySlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 128);
}

function ViewTypePicker({
  onChange,
  value,
}: {
  onChange: (viewType: KbCategoryViewType) => void;
  value: KbCategoryViewType;
}) {
  const { t } = useTranslation("kb");

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {(["collection", "folder"] as const).map((vt) => {
        const selected = value === vt;
        const Icon = vt === "folder" ? Folder : LayoutList;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "flex gap-3 rounded-lg border p-3 text-left transition-colors",
              selected
                ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                : "border-border hover:bg-muted/30"
            )}
            key={vt}
            onClick={() => onChange(vt)}
            type="button"
          >
            <Icon
              aria-hidden
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                selected ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span className="min-w-0 font-medium text-sm">
              {t(`category.settings.view_type_${vt}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FieldRow({
  children,
  label,
  labelFor,
}: {
  children: ReactNode;
  label: string;
  labelFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={labelFor}>{label}</Label>
      {children}
    </div>
  );
}

function CategorySortByField({
  id,
  onChange,
  selectedTemplate,
  sortBy,
}: {
  id: string;
  onChange: (value: KbCategoryCollectionSortBy) => void;
  selectedTemplate: KbArticleTemplate | null;
  sortBy: KbCategoryCollectionSortBy;
}) {
  const { t } = useTranslation("kb");

  return (
    <FieldRow label={t("category.settings.collection_sort_by")} labelFor={id}>
      <Select
        onValueChange={(v) => onChange(v as KbCategoryCollectionSortBy)}
        value={sortBy}
      >
        <SelectTrigger id={id}>
          <SelectValue>
            {sortBy.startsWith("custom:")
              ? (selectedTemplate?.property_definitions.find(
                  (d) => `custom:${d.key}` === sortBy
                )?.label ?? sortBy)
              : t(`category.settings.collection_sort_${sortBy}`)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {COLLECTION_SORT_BY.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`category.settings.collection_sort_${s}`)}
            </SelectItem>
          ))}
          {selectedTemplate?.property_definitions.map((def) => (
            <SelectItem key={def.key} value={`custom:${def.key}`}>
              {def.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

function FormSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="font-medium text-sm">{title}</p>
        {description ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export interface CategorySettingsDialogBodyProps {
  category: KbCategory;
  commentsMode: KbCommentsModeBinding;
  effectiveCommentsMode?: KbEffectiveCommentsMode;
  name: string;
  onCommentsModeChange: (value: KbCommentsModeBinding) => void;
  onNameChange: (value: string) => void;
  onRegenerateSlug?: () => void;
  onSettingsChange: (
    updater: (prev: KbCategoryPageSettings) => KbCategoryPageSettings
  ) => void;
  onSlugChange: (value: string) => void;
  onTemplateIdChange: (value: string) => void;
  onTemplateModeChange: (mode: KbTemplateBindingMode) => void;
  onViewTypeChange: (viewType: KbCategoryViewType) => void;
  selectedTemplate: KbArticleTemplate | null;
  settings: KbCategoryPageSettings;
  slug: string;
  slugFieldResetKey: string;
  templateId: string;
  templateMode: KbTemplateBindingMode;
  templates: KbArticleTemplate[];
  viewType: KbCategoryViewType;
}

export function CategorySettingsDialogBody({
  category,
  commentsMode,
  effectiveCommentsMode,
  name,
  onCommentsModeChange,
  onNameChange,
  onRegenerateSlug,
  onSettingsChange,
  onSlugChange,
  onTemplateIdChange,
  onTemplateModeChange,
  onViewTypeChange,
  selectedTemplate,
  settings,
  slug,
  slugFieldResetKey,
  templateId,
  templateMode,
  templates,
  viewType,
}: CategorySettingsDialogBodyProps) {
  const { t } = useTranslation("kb");
  const slugDisabled = category.is_default;

  const templateSelectValue =
    templateMode === "template" && templateId
      ? templateId
      : templateMode === "none"
        ? "__none__"
        : "__inherit__";

  return (
    <div className="space-y-5">
      <FieldRow label={t("category.settings.name")} labelFor="cat-name">
        <Input
          disabled={category.is_default}
          id="cat-name"
          maxLength={256}
          onChange={(e) => onNameChange(e.target.value)}
          value={name}
        />
        <CategorySlugField
          disabled={slugDisabled}
          name={name}
          onRegenerate={onRegenerateSlug}
          onSlugChange={onSlugChange}
          resetKey={slugFieldResetKey}
          slug={slug}
        />
      </FieldRow>

      <FormSection
        description={t("category.settings.category_organization_description")}
        title={t("category.settings.category_organization")}
      >
        <ViewTypePicker onChange={onViewTypeChange} value={viewType} />

        {viewType === "collection" ? (
          <div className="space-y-3 pt-1">
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t("category.settings.collection_list_options_description")}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
              <CategorySortByField
                id="col-sort"
                onChange={(v) =>
                  onSettingsChange((prev) => ({
                    ...prev,
                    collection: { ...prev.collection, sort_by: v },
                  }))
                }
                selectedTemplate={selectedTemplate}
                sortBy={settings.collection.sort_by}
              />
              <FieldRow
                label={t("category.settings.collection_max_items")}
                labelFor="col-max"
              >
                <NumberStepper
                  id="col-max"
                  max={500}
                  min={1}
                  onChange={(v) =>
                    onSettingsChange((prev) => ({
                      ...prev,
                      collection: { ...prev.collection, max_items: v },
                    }))
                  }
                  value={settings.collection.max_items}
                />
              </FieldRow>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <CategorySortByField
              id="folder-sort"
              onChange={(v) =>
                onSettingsChange((prev) => ({
                  ...prev,
                  collection: { ...prev.collection, sort_by: v },
                }))
              }
              selectedTemplate={selectedTemplate}
              sortBy={settings.collection.sort_by}
            />
            {settings.collection.sort_by === "sort_order" ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {t("category.settings.folder_manual_order_hint")}
              </p>
            ) : null}
          </div>
        )}
      </FormSection>

      <div className="divide-y divide-border">
        <SettingsFormRow
          controlSizing="wide"
          hint={t("category.settings.section_template_description")}
          label={t("category.settings.section_template", "Template")}
          labelFor="cat-template"
        >
          <Select
            onValueChange={(value) => {
              if (value === "__inherit__") {
                onTemplateModeChange("inherit");
                onTemplateIdChange("");
                return;
              }
              if (value === "__none__") {
                onTemplateModeChange("none");
                onTemplateIdChange("");
                return;
              }
              onTemplateModeChange("template");
              onTemplateIdChange(value);
            }}
            value={templateSelectValue}
          >
            <SelectTrigger id="cat-template">
              <SelectValue>
                {templateSelectValue === "__none__"
                  ? t("templates.none", "No template")
                  : templateSelectValue === "__inherit__"
                    ? t("templates.inherit", "Inherit from category")
                    : (templates.find((tpl) => tpl.id === templateSelectValue)
                        ?.name ?? templateSelectValue)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit__">
                {t("templates.inherit", "Inherit from category")}
              </SelectItem>
              <SelectItem value="__none__">
                {t("templates.none", "No template")}
              </SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsFormRow>

        <SettingsFormRow
          controlSizing="wide"
          hint={
            <>
              <span>{t("category.settings.comments_description")}</span>
              {commentsMode === "inherit" && effectiveCommentsMode ? (
                <span className="mt-1 block">
                  {t("comments.mode.effective_hint", {
                    mode: t(`comments.mode.${effectiveCommentsMode}`),
                  })}
                </span>
              ) : null}
            </>
          }
          label={t("category.settings.comments_title")}
          labelFor="cat-comments-mode"
        >
          <KbCommentsModeSelect
            id="cat-comments-mode"
            onChange={(value) =>
              onCommentsModeChange(value as KbCommentsModeBinding)
            }
            value={commentsMode}
          />
        </SettingsFormRow>
      </div>
    </div>
  );
}
