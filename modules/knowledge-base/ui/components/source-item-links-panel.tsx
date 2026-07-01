import { useTranslation } from "@engenty/i18n/ui";
import { Button, Input } from "@engenty/ui-core";
import { useMemo, useState } from "react";
import type { KbSourceItemLink } from "../../src/schema/types.js";

type LinkFilter = "all" | "internal" | "external" | "anchor" | "asset";

const FILTERS: LinkFilter[] = [
  "all",
  "internal",
  "external",
  "anchor",
  "asset",
];

export function SourceItemLinksPanel({ links }: { links: KbSourceItemLink[] }) {
  const { t } = useTranslation("kb");
  const [filter, setFilter] = useState<LinkFilter>("all");
  const [query, setQuery] = useState("");

  const visibleLinks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return links.filter((link) => {
      if (filter !== "all" && link.link_type !== filter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return [link.text, link.title, link.normalized_href, link.href]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [filter, links, query]);

  if (links.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("sources.source_item_no_links")}
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 max-w-xs"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("sources.links_filter_placeholder")}
          value={query}
        />
        {FILTERS.map((value) => (
          <Button
            key={value}
            onClick={() => setFilter(value)}
            size="sm"
            type="button"
            variant={filter === value ? "default" : "outline"}
          >
            {t(`sources.link_filter_${value}`)}
          </Button>
        ))}
      </div>
      <div className="flex min-w-0 flex-col divide-y rounded-md border">
        {visibleLinks.length === 0 ? (
          <p className="p-3 text-muted-foreground text-sm">
            {t("sources.links_filter_empty")}
          </p>
        ) : (
          visibleLinks.map((link) => (
            <div className="flex min-w-0 flex-col gap-1 p-3" key={link.id}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                  {link.link_type}
                </span>
                <span className="truncate text-sm">
                  {link.text || link.title || link.href}
                </span>
              </div>
              <a
                className="break-all font-mono text-primary text-xs hover:underline"
                href={link.normalized_href}
                rel="noreferrer"
                target="_blank"
              >
                {link.normalized_href}
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
