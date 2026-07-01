import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Pencil, Tag } from "lucide-react";
import { type SetStateAction, useCallback, useState } from "react";
import type { Article } from "../../../../src/schema/types.js";
import { KbTagPickerBody } from "../../kb-tag-picker-body.js";
import {
  ArticlePropertyEmpty,
  ArticlePropertyShell,
  articlePropertyChipClassName,
  articlePropertyTagChipGroupHoverClassName,
  articlePropertyTagChipToneClassName,
  articlePropertyValueEditButtonClassName,
  articlePropertyValueHoverRowClassName,
} from "../article-property-shell.js";

function resolveTagIds(
  current: string[],
  next: SetStateAction<string[]>
): string[] {
  return typeof next === "function" ? next(current) : next;
}

function sameTagIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, index) => id === right[index]);
}

function TagPropertyChip({ name }: { name: string }) {
  return (
    <Badge
      className={cn(
        articlePropertyChipClassName,
        articlePropertyTagChipToneClassName,
        articlePropertyTagChipGroupHoverClassName,
        "py-0 font-normal"
      )}
      variant="secondary"
    >
      {name}
    </Badge>
  );
}

export function ArticleTagsPropertyEditor({
  article,
  disabled,
  onTagIdsChange,
}: {
  article: Article;
  disabled?: boolean;
  onTagIdsChange: (tagIds: string[]) => void;
}) {
  const { t } = useTranslation("kb");
  const [open, setOpen] = useState(false);

  const selectedTagIds = article.tags?.map((tag) => tag.id) ?? [];

  const handleSelectedTagIdsChange = useCallback(
    (next: SetStateAction<string[]>) => {
      const resolved = resolveTagIds(selectedTagIds, next);
      if (sameTagIds(resolved, selectedTagIds)) {
        return;
      }
      onTagIdsChange(resolved);
    },
    [onTagIdsChange, selectedTagIds]
  );

  const tags = article.tags ?? [];
  const summary =
    tags.length === 0 ? (
      <ArticlePropertyEmpty />
    ) : (
      <span className="inline-flex min-h-5 flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <TagPropertyChip key={tag.id} name={tag.name} />
        ))}
      </span>
    );

  if (disabled) {
    return (
      <ArticlePropertyShell
        icon={Tag}
        label={t("properties.tags")}
        value={summary}
      />
    );
  }

  return (
    <ArticlePropertyShell
      icon={Tag}
      label={t("properties.tags")}
      value={
        <div className={articlePropertyValueHoverRowClassName}>
          <span className="min-w-0 flex-1">{summary}</span>
          <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
              <button
                aria-label={t("properties.edit_tags", "Edit tags")}
                className={articlePropertyValueEditButtonClassName}
                type="button"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[min(24rem,calc(100vw-2rem))] p-2"
              sideOffset={4}
            >
              <KbTagPickerBody
                kbId={article.kb_id}
                onSelectedTagIdsChange={handleSelectedTagIdsChange}
                selectedTagIds={selectedTagIds}
              />
            </PopoverContent>
          </Popover>
        </div>
      }
    />
  );
}
