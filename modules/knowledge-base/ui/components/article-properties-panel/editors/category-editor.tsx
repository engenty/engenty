import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, Folder, Pencil, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Article, KbCategory } from "../../../../src/schema/types.js";
import { buildCategoryDisplayPaths } from "../../../lib/category-display-paths.js";
import {
  ArticlePropertyEmpty,
  ArticlePropertyShell,
  ArticlePropertyValueText,
  articlePropertyValueTriggerClassName,
} from "../article-property-shell.js";

export function ArticleCategoryPropertyEditor({
  article,
  categories,
  disabled,
  onSave,
}: {
  article: Article;
  categories: KbCategory[];
  disabled?: boolean;
  onSave: (patch: Partial<Pick<Article, "category_id">>) => void;
}) {
  const { t } = useTranslation("kb");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(
    article.category_id ?? null
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setPending(article.category_id ?? null);
  }, [open, article.category_id]);

  const decorated = useMemo(
    () => buildCategoryDisplayPaths(categories),
    [categories]
  );

  const current = decorated.find((c) => c.id === article.category_id);

  const summary = current ? (
    <ArticlePropertyValueText>{current.display_path}</ArticlePropertyValueText>
  ) : (
    <ArticlePropertyEmpty />
  );

  const handleSave = () => {
    const next = pending;
    if (next !== (article.category_id ?? null)) {
      onSave({ category_id: next });
    }
    setOpen(false);
  };

  if (disabled) {
    return (
      <ArticlePropertyShell
        icon={Folder}
        label={t("properties.category")}
        value={summary}
      />
    );
  }

  return (
    <ArticlePropertyShell
      icon={Folder}
      label={t("properties.category")}
      value={
        <Popover onOpenChange={setOpen} open={open}>
          <PopoverTrigger asChild>
            <button
              className={articlePropertyValueTriggerClassName}
              type="button"
            >
              <span className="min-w-0 flex-1">{summary}</span>
              <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/val:opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[min(22rem,calc(100vw-2rem))] p-3"
            sideOffset={4}
          >
            <Button
              className="absolute top-1 right-1 h-6 w-6"
              onClick={() => setOpen(false)}
              size="icon"
              variant="ghost"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <div className="space-y-3 pr-6">
              <h4 className="font-medium text-sm">
                {t("properties.edit_category", "Move to category")}
              </h4>
              <Command shouldFilter>
                <CommandInput
                  placeholder={t("properties.search_category", "Search…")}
                />
                <CommandList className="max-h-48">
                  <CommandEmpty>
                    {t("properties.no_category_match", "No match")}
                  </CommandEmpty>
                  <CommandGroup>
                    {decorated.map((c) => (
                      <CommandItem
                        key={c.id}
                        keywords={[c.display_path, c.name, c.slug]}
                        onSelect={() => setPending(c.id)}
                        value={c.display_path}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            pending === c.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {c.display_path}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
              <div className="flex justify-end">
                <Button className="h-7 px-2" onClick={handleSave} size="sm">
                  <Check className="mr-1 h-3.5 w-3.5" />
                  {t("article.actions.save")}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      }
    />
  );
}
