/**
 * Category settings dialog — name, slug, template, and sidebar tree layout.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  KbCategory,
  KbCategoryPageSettings,
  KbCategoryViewType,
  KbCommentsModeBinding,
  KbTemplateBindingMode,
} from "../../src/schema/types.js";
import type { UpdateCategoryInput } from "../api.js";
import { resolveKbEffectiveCommentsModeClient } from "../lib/kb-effective-comments-mode.js";
import {
  categoriesQueryOptions,
  kbTemplatesQueryOptions,
  useKbsQuery,
  useUpdateCategoryMutation,
} from "../queries.js";
import {
  CategorySettingsDialogBody,
  sanitizeCategorySlug,
  slugifyCategoryName,
} from "./category-settings-dialog-body.js";

interface CategorySettingsDialogProps {
  category: KbCategory;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CategorySettingsDialog({
  category,
  onOpenChange,
  open,
}: CategorySettingsDialogProps) {
  const { t } = useTranslation("kb");
  const mutation = useUpdateCategoryMutation(category.kb_id);
  const slugTouchedRef = useRef(false);

  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);
  const [viewType, setViewType] = useState<KbCategoryViewType>(
    category.view_type
  );
  const [templateMode, setTemplateMode] = useState<KbTemplateBindingMode>(
    category.template_mode
  );
  const [templateId, setTemplateId] = useState(category.template_id ?? "");
  const [settings, setSettings] = useState<KbCategoryPageSettings>(
    category.page_settings
  );
  const [commentsMode, setCommentsMode] = useState<KbCommentsModeBinding>(
    category.comments_mode
  );

  useEffect(() => {
    if (open) {
      setName(category.name);
      setSlug(category.slug);
      setViewType(category.view_type);
      setTemplateMode(category.template_mode);
      setTemplateId(category.template_id ?? "");
      setSettings(category.page_settings);
      setCommentsMode(category.comments_mode);
      slugTouchedRef.current = false;
    }
  }, [open, category]);

  const { data: templates = [] } = useQuery(
    kbTemplatesQueryOptions(category.kb_id)
  );
  const { data: kbsRaw = [] } = useKbsQuery();
  const { data: categories = [] } = useQuery({
    ...categoriesQueryOptions(category.kb_id),
  });
  const kb = useMemo(
    () =>
      (Array.isArray(kbsRaw) ? kbsRaw : []).find(
        (row) => row.id === category.kb_id
      ),
    [category.kb_id, kbsRaw]
  );
  const effectiveCommentsMode = useMemo(
    () =>
      resolveKbEffectiveCommentsModeClient(kb, categories, {
        category_id: category.id,
        comments_mode: commentsMode,
      }),
    [categories, category.id, commentsMode, kb]
  );

  const selectedTemplate = useMemo(
    () =>
      templateMode === "template" && templateId
        ? (templates.find((template) => template.id === templateId) ?? null)
        : null,
    [templateId, templateMode, templates]
  );

  function handleNameChange(value: string) {
    setName(value);
    if (!(slugTouchedRef.current || category.is_default)) {
      setSlug(slugifyCategoryName(value));
    }
  }

  function handleSlugChange(value: string) {
    slugTouchedRef.current = true;
    setSlug(sanitizeCategorySlug(value));
  }

  function handleSlugRegenerate() {
    slugTouchedRef.current = false;
    setSlug(slugifyCategoryName(name));
  }

  function handleSave() {
    const normalizedSlug =
      sanitizeCategorySlug(slug.trim()).replace(/-+$/, "") || category.slug;
    const input: UpdateCategoryInput = {
      name: name.trim() || category.name,
      template_id: templateMode === "template" ? templateId || null : null,
      template_mode: templateMode,
      view_type: viewType,
      page_settings: settings,
      comments_mode: commentsMode,
    };
    if (normalizedSlug !== category.slug) {
      input.slug = normalizedSlug;
    }
    mutation.mutate(
      { id: category.id, input },
      {
        onSuccess: () => onOpenChange(false),
      }
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="!flex max-h-[min(88vh,720px)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-border border-b px-6 py-4 text-left">
          <DialogTitle>{t("category.settings.title")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <CategorySettingsDialogBody
            category={category}
            commentsMode={commentsMode}
            effectiveCommentsMode={effectiveCommentsMode}
            name={name}
            onCommentsModeChange={setCommentsMode}
            onNameChange={handleNameChange}
            onRegenerateSlug={handleSlugRegenerate}
            onSettingsChange={setSettings}
            onSlugChange={handleSlugChange}
            onTemplateIdChange={setTemplateId}
            onTemplateModeChange={setTemplateMode}
            onViewTypeChange={setViewType}
            selectedTemplate={selectedTemplate}
            settings={settings}
            slug={slug}
            slugFieldResetKey={`${category.id}-${open}`}
            templateId={templateId}
            templateMode={templateMode}
            templates={templates}
            viewType={viewType}
          />
        </div>

        <DialogFooter className="shrink-0 gap-2 border-border border-t px-6 py-4 sm:justify-end">
          <Button
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={handleSave}
            type="button"
          >
            {t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
