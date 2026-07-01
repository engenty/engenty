/**
 * Category cover inheritance — shown when a cover is set on the category page.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type { KbCategory, KbCoverInheritance } from "../../src/schema/types.js";
import { useUpdateCategoryMutation } from "../queries.js";

const MODES: KbCoverInheritance[] = ["none", "direct_articles", "all_children"];

export function CategoryCoverInheritanceField({
  category,
  onCover = false,
}: {
  category: KbCategory;
  onCover?: boolean;
}) {
  const { t } = useTranslation("kb");
  const mutation = useUpdateCategoryMutation(category.kb_id);

  if (!category.cover) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex max-w-md flex-col gap-1.5 px-1",
        onCover && "drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
      )}
    >
      <Label
        className={cn(
          "font-normal text-xs",
          onCover ? "text-white/80" : "text-muted-foreground"
        )}
        htmlFor={`category-cover-inheritance-${category.id}`}
      >
        {t("category.cover_inheritance_label")}
      </Label>
      <Select
        disabled={mutation.isPending}
        onValueChange={(value) =>
          mutation.mutate({
            id: category.id,
            input: { cover_inheritance: value as KbCoverInheritance },
          })
        }
        value={category.cover_inheritance}
      >
        <SelectTrigger
          className={cn(
            "h-8 w-full max-w-md text-xs",
            onCover &&
              "border-white/25 bg-white/10 text-white hover:bg-white/15 [&_svg]:text-white/80"
          )}
          id={`category-cover-inheritance-${category.id}`}
        >
          <SelectValue>
            {t(`category.cover_inheritance_${category.cover_inheritance}`)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {t(`category.cover_inheritance_${mode}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p
        className={cn(
          "text-xs leading-relaxed",
          onCover ? "text-white/70" : "text-muted-foreground"
        )}
      >
        {t(`category.cover_inheritance_${category.cover_inheritance}_hint`)}
      </p>
    </div>
  );
}
