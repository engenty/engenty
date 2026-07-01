/**
 * Per-block settings dialog in edit mode.
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
import { useEffect, useMemo, useState } from "react";
import type { KbCategory, KbPageBlock } from "../../../src/schema/types.js";
import { resolveKbEffectiveTemplateForCategoryClient } from "../../lib/kb-effective-template.js";
import {
  articlesQueryOptions,
  kbTemplatesQueryOptions,
} from "../../queries.js";
import { KbPageArticlesSettingsFields } from "./kb-page-articles-settings-fields.js";
import { KbPageCategoriesSettingsFields } from "./kb-page-categories-settings-fields.js";
import { KbPageFaqsSettingsFields } from "./kb-page-faqs-settings-fields.js";

interface KbPageBlockSettingsDialogProps {
  block: KbPageBlock | null;
  categories: KbCategory[];
  categoryContext?: KbCategory | null;
  onOpenChange: (open: boolean) => void;
  onSave: (block: KbPageBlock) => void;
  open: boolean;
}

export function KbPageBlockSettingsDialog({
  block,
  categories,
  categoryContext,
  onOpenChange,
  onSave,
  open,
}: KbPageBlockSettingsDialogProps) {
  const { t } = useTranslation("kb");
  const [draft, setDraft] = useState<KbPageBlock | null>(block);

  useEffect(() => {
    if (open) {
      setDraft(block);
    }
  }, [open, block]);

  const kbId = categoryContext?.kb_id ?? categories[0]?.kb_id ?? "";

  const { data: templates = [] } = useQuery(kbTemplatesQueryOptions(kbId));
  const { data: articlesPage } = useQuery(
    articlesQueryOptions({
      kb_id: kbId,
      page_size: 200,
      sort_by: "title",
      sort_order: "asc",
    })
  );
  const articles = articlesPage?.data ?? [];

  const selectedTemplate = useMemo(() => {
    if (!categoryContext) {
      return null;
    }
    return resolveKbEffectiveTemplateForCategoryClient(
      categories,
      templates,
      categoryContext
    );
  }, [categoryContext, categories, templates]);

  if (!draft || draft.type === "content") {
    return null;
  }

  const titleKey =
    draft.type === "categories"
      ? "page_blocks.settings_title_categories"
      : draft.type === "faqs"
        ? "page_blocks.settings_title_faqs"
        : "page_blocks.settings_title_articles";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[min(88vh,640px)] max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-border border-b px-5 py-4 text-left">
          <DialogTitle>{t(titleKey)}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[min(60vh,480px)] overflow-y-auto px-5 py-4">
          {draft.type === "categories" ? (
            <KbPageCategoriesSettingsFields
              block={draft}
              categories={categories}
              onChange={(updater) =>
                setDraft((prev) =>
                  prev?.type === "categories" ? updater(prev) : prev
                )
              }
            />
          ) : draft.type === "faqs" ? (
            <KbPageFaqsSettingsFields
              block={draft}
              onChange={(updater) =>
                setDraft((prev) =>
                  prev?.type === "faqs" ? updater(prev) : prev
                )
              }
            />
          ) : (
            <KbPageArticlesSettingsFields
              articles={articles}
              block={draft}
              onChange={(updater) =>
                setDraft((prev) =>
                  prev?.type === "articles" ? updater(prev) : prev
                )
              }
              selectedTemplate={selectedTemplate}
            />
          )}
        </div>

        <DialogFooter className="gap-2 border-border border-t px-5 py-4 sm:justify-end">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
            type="button"
          >
            {t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
