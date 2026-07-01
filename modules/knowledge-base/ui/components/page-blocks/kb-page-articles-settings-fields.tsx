/**
 * Articles block settings fields.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Checkbox,
  Input,
  Label,
  NumberStepper,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type {
  Article,
  KbArticleTemplate,
  KbPageArticlesBlock,
  KbPageArticlesBlockSource,
} from "../../../src/schema/types.js";

const ARTICLE_SOURCES: KbPageArticlesBlockSource[] = [
  "direct_sorted",
  "latest_created",
  "recent_updated",
  "latest_created_recursive",
  "recent_updated_recursive",
  "manual_pick",
  "grouped_by_category",
];

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

export interface KbPageArticlesSettingsFieldsProps {
  articles: Article[];
  block: KbPageArticlesBlock;
  onChange: (
    updater: (prev: KbPageArticlesBlock) => KbPageArticlesBlock
  ) => void;
  selectedTemplate: KbArticleTemplate | null;
}

export function KbPageArticlesSettingsFields({
  block,
  onChange,
  selectedTemplate,
  articles,
}: KbPageArticlesSettingsFieldsProps) {
  const { t } = useTranslation("kb");
  const [search, setSearch] = useState("");
  const showManualPicker = block.source === "manual_pick";
  const selectedIds = useMemo(
    () => new Set(block.manual_article_ids),
    [block.manual_article_ids]
  );

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return articles;
    }
    return articles.filter((a) => a.title.toLowerCase().includes(q));
  }, [articles, search]);

  function toggleArticle(id: string) {
    onChange((prev) => {
      const next = new Set(prev.manual_article_ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...prev, manual_article_ids: [...next] };
    });
  }

  return (
    <div className="space-y-4">
      <FieldRow label={t("page_blocks.articles.source")}>
        <Select
          onValueChange={(v) =>
            onChange((prev) => ({
              ...prev,
              source: v as KbPageArticlesBlockSource,
              grouped_by_category: v === "grouped_by_category",
            }))
          }
          value={block.source}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {t(`page_blocks.articles.source_${block.source}`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ARTICLE_SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`page_blocks.articles.source_${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <div className="grid gap-3 sm:grid-cols-2">
        <FieldRow label={t("page_blocks.style")} labelFor="articles-style">
          <Select
            onValueChange={(v) =>
              onChange((prev) => ({
                ...prev,
                style: v as KbPageArticlesBlock["style"],
              }))
            }
            value={block.style}
          >
            <SelectTrigger className="w-full" id="articles-style">
              <SelectValue>
                {block.style === "cards"
                  ? t("page_blocks.style_cards")
                  : t("page_blocks.style_list")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cards">
                {t("page_blocks.style_cards")}
              </SelectItem>
              <SelectItem value="list">
                {t("page_blocks.style_list")}
              </SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
        <FieldRow
          label={t("page_blocks.articles.max_items")}
          labelFor="articles-max"
        >
          <NumberStepper
            id="articles-max"
            max={200}
            min={1}
            onChange={(v) => onChange((prev) => ({ ...prev, max_items: v }))}
            value={block.max_items}
          />
        </FieldRow>
      </div>

      <div className="space-y-2">
        <Label>{t("page_blocks.articles.display")}</Label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={block.show_icon}
              onCheckedChange={(v) =>
                onChange((prev) => ({ ...prev, show_icon: v === true }))
              }
            />
            {t("page_blocks.show_icon")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={block.show_description}
              onCheckedChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  show_description: v === true,
                }))
              }
            />
            {t("page_blocks.show_description")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={block.include_drafts}
              onCheckedChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  include_drafts: v === true,
                }))
              }
            />
            {t("page_blocks.include_drafts")}
          </label>
        </div>
      </div>

      {selectedTemplate?.property_definitions.length ? (
        <div className="space-y-2">
          <Label>{t("templates.property_filters", "Property filters")}</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {selectedTemplate.property_definitions.map((def) => (
              <div className="space-y-1.5" key={def.key}>
                <Label className="text-muted-foreground text-xs">
                  {def.label}
                </Label>
                <Input
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    onChange((prev) => {
                      const nextFilters = { ...prev.property_filters };
                      if (value) {
                        nextFilters[def.key] = value;
                      } else {
                        delete nextFilters[def.key];
                      }
                      return { ...prev, property_filters: nextFilters };
                    });
                  }}
                  placeholder={def.description || def.label}
                  value={String(block.property_filters[def.key] ?? "")}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showManualPicker ? (
        <div className="space-y-2">
          <Label>{t("page_blocks.articles.manual_picker")}</Label>
          <div className="relative">
            <Search
              aria-hidden
              className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
            />
            <Input
              className="pl-8"
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page_blocks.articles.search_placeholder")}
              value={search}
            />
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            {filteredArticles.length === 0 ? (
              <p className="px-3 py-3 text-muted-foreground text-sm">
                {t("page_blocks.articles.manual_picker_empty")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filteredArticles.map((a) => (
                  <li
                    className="flex items-center gap-2.5 px-3 py-2"
                    key={a.id}
                  >
                    <Checkbox
                      checked={selectedIds.has(a.id)}
                      id={`pick-${a.id}`}
                      onCheckedChange={() => toggleArticle(a.id)}
                    />
                    <Label
                      className="min-w-0 flex-1 truncate font-normal text-sm"
                      htmlFor={`pick-${a.id}`}
                    >
                      {a.title}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
