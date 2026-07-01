/**
 * Shared KB context menu (sidebar header + breadcrumb when secondary nav is closed).
 * Knowledge bases list, optional search, and scoped nav shortcuts when a KB slug is active.
 */

import { matchesPath } from "@engenty/app-shell/navigation";
import { useTranslation } from "@engenty/i18n/ui";
import {
  type ContextPopoverItem,
  ContextPopoverList,
  type ContextPopoverRenderLink,
  type ContextPopoverSection,
  cn,
  Input,
} from "@engenty/ui-core";
import {
  ChevronDown,
  Database,
  FileText,
  HelpCircle,
  House,
  Library,
  Network,
  Search,
  Settings,
} from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { kbDisplayName } from "../kb-display-name.js";
import {
  kbArticlesListPath,
  kbBrowsePath,
  kbFaqsListPath,
  kbGraphPath,
  kbHubPath,
  kbScopedSettingsPath,
  kbSourcesPath,
} from "../kb-paths.js";

/** Show search in KB switcher menus at this count and above. */
export const KB_SWITCHER_SEARCH_THRESHOLD = 3;

export function buildKbSwitcherItems(
  kbs: KnowledgeBase[],
  activeKbId: string,
  onSelect: (kbId: string) => void,
  t: (key: string) => string
): ContextPopoverItem[] {
  // Drive selection through `onSelect` only (no `to`): the caller's handler is
  // route-preserving, so a `to` link would double-navigate to the hub instead.
  return kbs.map((kb) => ({
    id: kb.id,
    label: kbDisplayName(kb, t),
    icon: <Library className="size-4" />,
    isActive: kb.id === activeKbId,
    onClick: () => onSelect(kb.id),
  }));
}

function filterKbsForSearch(
  kbs: KnowledgeBase[],
  query: string,
  t: (key: string) => string
): KnowledgeBase[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return kbs;
  }
  return kbs.filter((kb) => {
    const name = kbDisplayName(kb, t).toLowerCase();
    return name.includes(q) || kb.slug.toLowerCase().includes(q);
  });
}

export function buildKbSwitcherSections(options: {
  activeKbId: string;
  kbs: KnowledgeBase[];
  onSelect: (kbId: string) => void;
  pathname: string;
  locationSearch: string;
  searchQuery: string;
  showSearch: boolean;
  t: (key: string) => string;
}): ContextPopoverSection[] | undefined {
  const {
    activeKbId,
    kbs,
    onSelect,
    pathname,
    locationSearch,
    searchQuery,
    showSearch,
    t,
  } = options;

  if (kbs.length === 0) {
    return;
  }

  const activeKb = kbs.find((k) => k.id === activeKbId) ?? kbs[0];
  const slug = activeKb?.slug ?? "";
  const filteredKbs = showSearch
    ? filterKbsForSearch(kbs, searchQuery, t)
    : kbs;
  const kbItems = buildKbSwitcherItems(filteredKbs, activeKbId, onSelect, t);

  if (!slug) {
    return [
      {
        id: "knowledge-bases",
        contextLabel: t("sidebar.kb_switcher_section"),
        items: kbItems,
      },
    ];
  }

  const hubTo = kbHubPath(slug);
  const hubActive = pathname === hubTo;

  const articlesTo = kbArticlesListPath(slug);
  const articlesActive =
    matchesPath(pathname, locationSearch, articlesTo) ||
    matchesPath(pathname, locationSearch, kbBrowsePath(slug));

  const faqsTo = kbFaqsListPath(slug);
  const faqsActive = matchesPath(pathname, locationSearch, faqsTo);

  const sourcesTo = kbSourcesPath(slug);
  const sourcesActive = matchesPath(pathname, locationSearch, sourcesTo);

  const graphTo = kbGraphPath(slug);
  const graphActive = matchesPath(pathname, locationSearch, graphTo);

  const settingsTo = kbScopedSettingsPath(slug);
  const settingsActive = matchesPath(pathname, locationSearch, settingsTo);

  return [
    {
      id: "knowledge-bases",
      contextLabel: t("sidebar.kb_switcher_section"),
      items: kbItems,
    },
    {
      id: "shortcuts",
      contextLabel: t("sidebar.switcher_section_nav"),
      items: [
        {
          id: "hub",
          label: t("sidebar.switcher_hub"),
          icon: <House className="size-4" />,
          to: hubTo,
          isActive: hubActive,
        },
        {
          id: "articles",
          label: t("inbox.nav_articles"),
          icon: <FileText className="size-4" />,
          to: articlesTo,
          isActive: articlesActive,
        },
        {
          id: "faqs",
          label: t("inbox.nav_faqs"),
          icon: <HelpCircle className="size-4" />,
          to: faqsTo,
          isActive: faqsActive,
        },
        {
          id: "sources",
          label: t("sources.nav_sources"),
          icon: <Database className="size-4" />,
          to: sourcesTo,
          isActive: sourcesActive,
        },
        {
          id: "graph",
          label: t("inbox.nav_graph"),
          icon: <Network className="size-4" />,
          to: graphTo,
          isActive: graphActive,
        },
        {
          id: "settings",
          label: t("scoped_settings.nav_link"),
          icon: <Settings className="size-4" />,
          to: settingsTo,
          isActive: settingsActive,
        },
      ],
    },
  ];
}

export function KbSwitcherPopover({
  activeKbId,
  kbs,
  onSelect,
  openOn = "hover",
  renderLink,
  trigger,
  triggerClassName,
  popoverClassName,
  controlledOpen,
  onOpenChange,
  chevronClassName,
}: {
  activeKbId: string;
  kbs: KnowledgeBase[];
  onSelect: (kbId: string) => void;
  openOn?: "click" | "hover";
  renderLink: ContextPopoverRenderLink;
  /** Custom trigger; default is compact breadcrumb-style label + chevron. */
  trigger?: ReactElement;
  triggerClassName?: string;
  popoverClassName?: string;
  controlledOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  chevronClassName?: string;
}): ReactElement | null {
  const { t } = useTranslation("kb");
  const { pathname, search: locationSearch } = useLocation();
  const [search, setSearch] = useState("");
  const showSearch = kbs.length >= KB_SWITCHER_SEARCH_THRESHOLD;

  const activeKb = kbs.find((k) => k.id === activeKbId) ?? kbs[0];
  const label = activeKb ? kbDisplayName(activeKb, t) : t("sidebar.pick_kb");

  const sections = useMemo(
    () =>
      buildKbSwitcherSections({
        activeKbId,
        kbs,
        locationSearch,
        onSelect,
        pathname,
        searchQuery: search,
        showSearch,
        t,
      }),
    [activeKbId, kbs, locationSearch, onSelect, pathname, search, showSearch, t]
  );

  const searchHeader = showSearch ? (
    <div className="pb-1">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label={t("sidebar.kb_search_placeholder")}
          autoComplete="off"
          className="h-8 border-border/60 bg-muted/40 pl-8 text-sm"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          placeholder={t("sidebar.kb_search_placeholder")}
          value={search}
        />
      </div>
    </div>
  ) : null;

  if (kbs.length === 0) {
    return null;
  }

  const defaultTrigger = (
    <button
      aria-label={t("sidebar.pick_kb")}
      className={cn(
        "group/picker inline-flex max-w-[min(20rem,85vw)] items-center gap-0.5 rounded px-0.5 font-medium text-foreground text-sm transition-colors hover:text-foreground",
        triggerClassName
      )}
      type="button"
    >
      <span className="min-w-0 truncate">{label}</span>
      <ChevronDown
        aria-hidden
        className={cn(
          "size-3 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover/picker:opacity-100 group-data-[state=open]/picker:opacity-100",
          chevronClassName
        )}
      />
    </button>
  );

  return (
    <ContextPopoverList
      align="start"
      className={cn("min-w-56 p-1.5", showSearch && "w-72", popoverClassName)}
      emptyMessage={
        showSearch && search.trim() ? t("sidebar.kb_search_empty") : undefined
      }
      header={searchHeader}
      onOpenChange={(open) => {
        onOpenChange?.(open);
        if (!open) {
          setSearch("");
        }
      }}
      open={controlledOpen}
      openOn={openOn}
      renderLink={renderLink}
      sections={sections}
      trigger={trigger ?? defaultTrigger}
    />
  );
}
