/**
 * Categories block settings fields.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Checkbox,
  Label,
  NumberStepper,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type { ReactNode } from "react";
import type {
  KbCategoriesBlockScope,
  KbCategoryCountDisplay,
  KbPageBlockSort,
  KbPageCategoriesBlock,
} from "../../../src/schema/page-blocks.js";

const CATEGORY_COUNT_DISPLAY_OPTIONS: KbCategoryCountDisplay[] = [
  "none",
  "direct",
  "recursive",
];

import type { KbCategory } from "../../../src/schema/types.js";

function FieldRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export interface KbPageCategoriesSettingsFieldsProps {
  block: KbPageCategoriesBlock;
  categories: KbCategory[];
  onChange: (
    updater: (prev: KbPageCategoriesBlock) => KbPageCategoriesBlock
  ) => void;
}

export function KbPageCategoriesSettingsFields({
  block,
  onChange,
  categories,
}: KbPageCategoriesSettingsFieldsProps) {
  const { t } = useTranslation("kb");

  return (
    <div className="space-y-4">
      <FieldRow label={t("page_blocks.style")}>
        <Select
          onValueChange={(v) =>
            onChange((prev) => ({
              ...prev,
              style: v as KbPageCategoriesBlock["style"],
            }))
          }
          value={block.style}
        >
          <SelectTrigger className="w-full">
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
            <SelectItem value="list">{t("page_blocks.style_list")}</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label={t("page_blocks.categories.scope")}>
        <Select
          onValueChange={(v) =>
            onChange((prev) => ({
              ...prev,
              scope: v as KbCategoriesBlockScope,
            }))
          }
          value={block.scope}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {block.scope === "direct_children"
                ? t("page_blocks.categories.scope_direct")
                : block.scope === "direct_plus_one"
                  ? t("page_blocks.categories.scope_plus_one")
                  : t("page_blocks.categories.scope_manual")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct_children">
              {t("page_blocks.categories.scope_direct")}
            </SelectItem>
            <SelectItem value="direct_plus_one">
              {t("page_blocks.categories.scope_plus_one")}
            </SelectItem>
            <SelectItem value="manual">
              {t("page_blocks.categories.scope_manual")}
            </SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label={t("page_blocks.categories.sort")}>
        <Select
          onValueChange={(v) =>
            onChange((prev) => ({
              ...prev,
              sort: v as KbPageBlockSort,
            }))
          }
          value={block.sort}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {block.sort === "sort_order"
                ? t("page_blocks.sort_ordered")
                : block.sort === "name_asc"
                  ? t("page_blocks.sort_name")
                  : t("page_blocks.sort_created")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sort_order">
              {t("page_blocks.sort_ordered")}
            </SelectItem>
            <SelectItem value="name_asc">
              {t("page_blocks.sort_name")}
            </SelectItem>
            <SelectItem value="created_at">
              {t("page_blocks.sort_created")}
            </SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label={t("page_blocks.categories.category_count_display")}>
        <Select
          onValueChange={(v) =>
            onChange((prev) => ({
              ...prev,
              category_count_display: v as KbCategoryCountDisplay,
            }))
          }
          value={block.category_count_display}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {t(
                `page_blocks.categories.category_count_display_${block.category_count_display}`
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_COUNT_DISPLAY_OPTIONS.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {t(`page_blocks.categories.category_count_display_${mode}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <div className="space-y-2">
        <Label>{t("page_blocks.categories.display")}</Label>
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
              checked={block.show_articles}
              onCheckedChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  show_articles: v === true,
                }))
              }
            />
            {t("page_blocks.categories.show_articles")}
          </label>
        </div>
      </div>

      {block.show_articles ? (
        <FieldRow label={t("page_blocks.categories.articles_max")}>
          <NumberStepper
            max={50}
            min={1}
            onChange={(v) =>
              onChange((prev) => ({ ...prev, articles_max_items: v }))
            }
            value={block.articles_max_items}
          />
        </FieldRow>
      ) : null}

      {block.scope === "manual" ? (
        <div className="space-y-2">
          <Label>{t("page_blocks.categories.manual_picker")}</Label>
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            <ul className="divide-y divide-border">
              {categories.map((c) => (
                <li className="flex items-center gap-2.5 px-3 py-2" key={c.id}>
                  <Checkbox
                    checked={block.manual_category_ids.includes(c.id)}
                    id={`cat-${c.id}`}
                    onCheckedChange={() =>
                      onChange((prev) => {
                        const set = new Set(prev.manual_category_ids);
                        if (set.has(c.id)) {
                          set.delete(c.id);
                        } else {
                          set.add(c.id);
                        }
                        return {
                          ...prev,
                          manual_category_ids: [...set],
                        };
                      })
                    }
                  />
                  <Label
                    className="min-w-0 flex-1 truncate font-normal text-sm"
                    htmlFor={`cat-${c.id}`}
                  >
                    {c.name}
                  </Label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
