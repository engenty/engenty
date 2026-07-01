import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, Hash, Pencil, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type {
  Article,
  ArticlePropertyDefinition,
} from "../../../../src/schema/types.js";
import { formatKbDate } from "../../../article-datetime.js";
import {
  ArticlePropertyEmpty,
  ArticlePropertyShell,
  ArticlePropertyValueText,
  articlePropertyValueTriggerClassName,
} from "../article-property-shell.js";

function formatDisplay(
  def: ArticlePropertyDefinition,
  raw: string | number | null | undefined,
  locale?: string
): ReactNode {
  if (raw === null || raw === undefined || raw === "") {
    return <ArticlePropertyEmpty />;
  }
  if (def.type === "date" && typeof raw === "string") {
    const label = formatKbDate(raw, locale);
    return (
      <ArticlePropertyValueText title={raw}>{label}</ArticlePropertyValueText>
    );
  }
  return <ArticlePropertyValueText>{String(raw)}</ArticlePropertyValueText>;
}

export function ArticleCustomFieldEditor({
  article,
  def,
  disabled,
  onSave,
}: {
  article: Article;
  def: ArticlePropertyDefinition;
  disabled?: boolean;
  onSave: (next: Record<string, string | number | null>) => void;
}) {
  const { t, i18n } = useTranslation("kb");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const value = article.custom_properties?.[def.key];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (def.type === "select") {
      setPendingSelect(
        value === null || value === undefined ? null : String(value)
      );
      return;
    }
    if (def.type === "number") {
      setText(value === null || value === undefined ? "" : String(value));
    } else if (def.type === "date") {
      setText(value === null || value === undefined ? "" : String(value));
    } else if (def.type === "url" || def.type === "text") {
      setText(value === null || value === undefined ? "" : String(value));
    }
  }, [open, def.type, value]);

  const persist = (nextVal: string | number | null) => {
    const base = article.custom_properties ?? {};
    const next = { ...base, [def.key]: nextVal };
    onSave(next);
    setOpen(false);
  };

  const summary = formatDisplay(def, value, locale);

  if (disabled) {
    return (
      <ArticlePropertyShell icon={Hash} label={def.label} value={summary} />
    );
  }

  if (def.type === "select") {
    const opts = def.options ?? [];
    return (
      <ArticlePropertyShell
        icon={Hash}
        label={def.label}
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
              className="w-[min(20rem,calc(100vw-2rem))] p-3"
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
                <h4 className="font-medium text-sm">{def.label}</h4>
                <Command shouldFilter>
                  <CommandInput
                    placeholder={t("properties.search", "Search…")}
                  />
                  <CommandList className="max-h-48">
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => setPendingSelect(null)}
                        value="__clear__"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            pendingSelect === null ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {t("properties.clear_value", "Clear")}
                      </CommandItem>
                      {opts.map((o) => (
                        <CommandItem
                          key={o}
                          onSelect={() => setPendingSelect(o)}
                          value={o}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              pendingSelect === o ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {o}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
                <div className="flex justify-end">
                  <Button
                    className="h-7 px-2"
                    onClick={() => {
                      const nextVal = pendingSelect;
                      const cur =
                        value === null || value === undefined
                          ? null
                          : String(value);
                      if (nextVal !== cur) {
                        persist(nextVal);
                      }
                      setOpen(false);
                    }}
                    size="sm"
                  >
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

  const inputType =
    def.type === "number"
      ? "number"
      : def.type === "date"
        ? "date"
        : def.type === "url"
          ? "url"
          : "text";

  return (
    <ArticlePropertyShell
      icon={Hash}
      label={def.label}
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
          <PopoverContent align="start" className="w-80 p-3" sideOffset={4}>
            <Button
              className="absolute top-1 right-1 h-6 w-6"
              onClick={() => setOpen(false)}
              size="icon"
              variant="ghost"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <div className="space-y-3 pr-6">
              <h4 className="font-medium text-sm">{def.label}</h4>
              <Input
                className="text-sm"
                onChange={(e) => setText(e.target.value)}
                placeholder={def.label}
                step={def.type === "number" ? "any" : undefined}
                type={inputType}
                value={text}
              />
              {def.type === "url" ? (
                <p className="text-muted-foreground text-xs">
                  {t("properties.url_hint", "https://…")}
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button
                  className="h-7 px-2"
                  onClick={() => {
                    const trimmed = text.trim();
                    if (def.type === "number") {
                      if (!trimmed) {
                        persist(null);
                        return;
                      }
                      const n = Number.parseFloat(trimmed);
                      if (Number.isNaN(n)) {
                        return;
                      }
                      persist(n);
                      return;
                    }
                    persist(trimmed || null);
                  }}
                  size="sm"
                >
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
