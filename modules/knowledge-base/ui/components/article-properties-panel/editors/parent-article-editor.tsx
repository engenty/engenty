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
import { Check, FileText, Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Article } from "../../../../src/schema/types.js";
import {
  ArticlePropertyEmpty,
  ArticlePropertyShell,
  ArticlePropertyValueText,
  articlePropertyValueTriggerClassName,
} from "../article-property-shell.js";

export function ArticleParentPropertyEditor({
  article,
  candidateParents,
  disabled,
  onSave,
}: {
  article: Article;
  candidateParents: Array<{ id: string; title: string }>;
  disabled?: boolean;
  onSave: (patch: Partial<Pick<Article, "parent_article_id">>) => void;
}) {
  const { t } = useTranslation("kb");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(
    article.parent_article_id ?? null
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setPending(article.parent_article_id ?? null);
  }, [open, article.parent_article_id]);

  const chain = article.parent_chain ?? [];
  const immediate = chain.length > 0 ? chain.at(-1) : null;

  const summary = immediate ? (
    <ArticlePropertyValueText>{immediate.title}</ArticlePropertyValueText>
  ) : (
    <ArticlePropertyEmpty />
  );

  const handleSave = () => {
    const next = pending;
    if (next !== (article.parent_article_id ?? null)) {
      onSave({ parent_article_id: next });
    }
    setOpen(false);
  };

  if (disabled) {
    return (
      <ArticlePropertyShell
        icon={FileText}
        label={t("properties.parent_page")}
        value={summary}
      />
    );
  }

  return (
    <ArticlePropertyShell
      icon={FileText}
      label={t("properties.parent_page")}
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
                {t("properties.edit_parent", "Edit parent page")}
              </h4>
              <Command shouldFilter>
                <CommandInput
                  placeholder={t("properties.search_article", "Search…")}
                />
                <CommandList className="max-h-48">
                  <CommandEmpty>
                    {t("properties.no_article_match", "No match")}
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => setPending(null)}
                      value="__none__"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          pending === null ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {t("properties.no_parent", "None")}
                    </CommandItem>
                    {candidateParents.map((a) => (
                      <CommandItem
                        key={a.id}
                        keywords={[a.title]}
                        onSelect={() => setPending(a.id)}
                        value={a.title}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            pending === a.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {a.title}
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
