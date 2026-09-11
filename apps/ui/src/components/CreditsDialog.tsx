import { useTranslation } from "@engenty/i18n/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AboutDockNav, type AboutDockNavItem } from "@/components/AboutDockNav";
import { useAboutSectionScrollSpy } from "@/components/about-scroll-spy";
import {
  AboutDialogSearch,
  countTextMatches,
  createMatchCounter,
  HighlightSearchText,
  SearchEmpty,
  stepMatchIndex,
  useAboutDialogHotkeys,
  useScrollActiveSearchHit,
} from "@/components/about-search";
import {
  CreditRow,
  creditMatchCount,
  groupSectionKey,
  kindLabel,
  type OssCredit,
  type OssCreditGroup,
  type OssCreditsData,
  OssPackageList,
} from "@/components/credits-dialog-parts";
import {
  ENGENTY_CREDITS,
  HIGHLIGHT_CREDITS,
  type ProductCredit,
} from "@/data/product-credits";

interface CreditsDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function filterCredits<T extends ProductCredit | OssCredit>(
  credits: T[],
  query: string
): T[] {
  const q = query.trim();
  if (!q) {
    return credits;
  }
  return credits.filter((credit) => creditMatchCount(credit, q) > 0);
}

export function CreditsDialog({ open, onOpenChange }: CreditsDialogProps) {
  const { t } = useTranslation("common");
  const [data, setData] = useState<OssCreditsData | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || data) {
      return;
    }
    let cancelled = false;
    void import("@/data/oss-credits.json").then((mod) => {
      if (!cancelled) {
        setData(mod.default as OssCreditsData);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, data]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveMatchIndex(0);
    }
  }, [open]);

  const productCredits = useMemo(
    () => filterCredits(ENGENTY_CREDITS, query),
    [query]
  );
  const highlightCredits = useMemo(
    () => filterCredits(HIGHLIGHT_CREDITS, query),
    [query]
  );
  const sharedCredits = useMemo(
    () => filterCredits(data?.shared ?? [], query),
    [data, query]
  );
  const groups = useMemo((): OssCreditGroup[] => {
    if (!data) {
      return [];
    }
    const q = query.trim();
    return data.groups
      .map((group) => {
        const packages = filterCredits(group.packages, q);
        const labelHit = q ? countTextMatches(group.label, q) > 0 : false;
        if (!q) {
          return group;
        }
        if (packages.length === 0 && !labelHit) {
          return null;
        }
        return { ...group, packages: labelHit ? group.packages : packages };
      })
      .filter((group): group is OssCreditGroup => group !== null);
  }, [data, query]);

  const showProduct = !query.trim() || productCredits.length > 0;
  const showHighlights = !query.trim() || highlightCredits.length > 0;
  const showShared = sharedCredits.length > 0;

  const appGroups = useMemo(
    () => groups.filter((group) => group.kind === "app"),
    [groups]
  );
  const packageGroups = useMemo(
    () =>
      groups.filter(
        (group) => group.kind === "package" || group.kind === "root"
      ),
    [groups]
  );
  const moduleGroups = useMemo(
    () => groups.filter((group) => group.kind === "module"),
    [groups]
  );

  const navItems = useMemo((): AboutDockNavItem[] => {
    const items: AboutDockNavItem[] = [];
    if (showProduct) {
      items.push({ key: "product", label: t("about.creditsProduct") });
    }
    if (showHighlights) {
      items.push({ key: "highlights", label: t("about.creditsHighlights") });
    }
    if (showShared) {
      items.push({ key: "shared", label: t("about.creditsShared") });
    }
    // One nav entry for apps / packages; modules stay individual sections.
    if (appGroups.length > 0) {
      items.push({ key: "apps", label: t("about.creditsNavApps") });
    }
    if (packageGroups.length > 0) {
      items.push({ key: "packages", label: t("about.creditsNavPackages") });
    }
    for (const group of moduleGroups) {
      items.push({
        key: groupSectionKey(group.id),
        label: group.label,
      });
    }
    return items;
  }, [
    showProduct,
    showHighlights,
    showShared,
    appGroups,
    packageGroups,
    moduleGroups,
    t,
  ]);

  const matchCount = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return 0;
    }
    let total = 0;
    if (showProduct) {
      total += countTextMatches(t("about.creditsProduct"), q);
      for (const credit of productCredits) {
        total += creditMatchCount(credit, q);
      }
    }
    if (showHighlights) {
      total += countTextMatches(t("about.creditsHighlights"), q);
      for (const credit of highlightCredits) {
        total += creditMatchCount(credit, q);
      }
    }
    if (showShared) {
      total += countTextMatches(t("about.creditsShared"), q);
      for (const credit of sharedCredits) {
        total += creditMatchCount(credit, q);
      }
    }
    if (appGroups.length > 0) {
      total += countTextMatches(t("about.creditsNavApps"), q);
    }
    if (packageGroups.length > 0) {
      total += countTextMatches(t("about.creditsNavPackages"), q);
    }
    for (const group of [...appGroups, ...packageGroups]) {
      total += countTextMatches(group.label, q);
      for (const pkg of group.packages) {
        total += creditMatchCount(pkg, q);
      }
    }
    for (const group of moduleGroups) {
      total += countTextMatches(kindLabel(group.kind, t), q);
      total += countTextMatches(group.label, q);
      for (const pkg of group.packages) {
        total += creditMatchCount(pkg, q);
      }
    }
    return total;
  }, [
    query,
    showProduct,
    showHighlights,
    showShared,
    productCredits,
    highlightCredits,
    sharedCredits,
    appGroups,
    packageGroups,
    moduleGroups,
    t,
  ]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [query]);

  useEffect(() => {
    if (matchCount > 0 && activeMatchIndex >= matchCount) {
      setActiveMatchIndex(0);
    }
  }, [matchCount, activeMatchIndex]);

  useScrollActiveSearchHit(contentRef, activeMatchIndex, query, matchCount);

  useEffect(() => {
    if (!(open && navItems.length)) {
      return;
    }
    setActiveKey(navItems[0]?.key ?? null);
  }, [open, navItems]);

  const { beginProgrammaticScroll } = useAboutSectionScrollSpy({
    open,
    contentRef,
    sectionAttr: "data-credits-section",
    resetKey: navItems,
    onActiveChange: (key) => {
      setActiveKey((prev) => (prev === key ? prev : key));
    },
  });

  const navKeys = useMemo(() => navItems.map((item) => item.key), [navItems]);

  const scrollToSection = useCallback(
    (key: string) => {
      const root = contentRef.current;
      const target = root?.querySelector<HTMLElement>(
        `[data-credits-section="${key.replaceAll('"', '\\"')}"]`
      );
      if (!(root && target)) {
        return;
      }
      beginProgrammaticScroll();
      setActiveKey(key);
      const top =
        root.scrollTop +
        (target.getBoundingClientRect().top - root.getBoundingClientRect().top);
      root.scrollTo({ top, behavior: "smooth" });
    },
    [beginProgrammaticScroll]
  );

  useAboutDialogHotkeys({
    open,
    searchInputRef,
    navKeys,
    activeKey,
    onNavigate: scrollToSection,
  });

  const matchCounter = createMatchCounter();
  const hasAnySection =
    showProduct || showHighlights || showShared || groups.length > 0;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[min(90vh,800px)] max-h-[min(90vh,800px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="relative shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="pr-56">{t("about.creditsTitle")}</DialogTitle>
          <DialogDescription className="pr-56">
            {t("about.creditsDescription")}
          </DialogDescription>
          <div className="absolute top-3.5 right-16">
            <AboutDialogSearch
              activeMatchIndex={activeMatchIndex}
              inputRef={searchInputRef}
              matchCount={matchCount}
              onNext={() =>
                setActiveMatchIndex((i) => stepMatchIndex(i, matchCount, 1))
              }
              onPrev={() =>
                setActiveMatchIndex((i) => stepMatchIndex(i, matchCount, -1))
              }
              onQueryChange={setQuery}
              placeholder={t("about.searchPlaceholder")}
              query={query}
            />
          </div>
        </DialogHeader>

        {data === null ? (
          <p className="px-6 py-4 text-muted-foreground text-sm">
            {t("about.loading")}
          </p>
        ) : (
          <div className="flex min-h-0 flex-1">
            <AboutDockNav
              activeKey={activeKey}
              items={navItems}
              label={t("about.creditsTitle")}
              onSelect={scrollToSection}
              variant="plain"
            />

            <div
              className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
              ref={contentRef}
            >
              {hasAnySection ? (
                <div className="flex flex-col pb-6">
                  {showProduct ? (
                    <section data-credits-section="product">
                      <h3 className="sticky top-0 z-10 border-border-soft border-b bg-popover px-6 py-2.5 font-semibold text-base">
                        <HighlightSearchText
                          activeMatchIndex={activeMatchIndex}
                          matchCounter={matchCounter}
                          query={query}
                          text={t("about.creditsProduct")}
                        />
                      </h3>
                      <ul className="divide-y divide-border-soft px-6">
                        {productCredits.map((credit) => (
                          <CreditRow
                            activeMatchIndex={activeMatchIndex}
                            credit={credit}
                            key={credit.name}
                            matchCounter={matchCounter}
                            query={query}
                          />
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {showHighlights ? (
                    <section className="mt-2" data-credits-section="highlights">
                      <h3 className="sticky top-0 z-10 border-border-soft border-b bg-popover px-6 py-2.5 font-semibold text-base">
                        <HighlightSearchText
                          activeMatchIndex={activeMatchIndex}
                          matchCounter={matchCounter}
                          query={query}
                          text={t("about.creditsHighlights")}
                        />
                      </h3>
                      <ul className="divide-y divide-border-soft px-6">
                        {highlightCredits.map((credit) => (
                          <CreditRow
                            activeMatchIndex={activeMatchIndex}
                            credit={credit}
                            key={credit.name}
                            matchCounter={matchCounter}
                            query={query}
                          />
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {query.trim() ? null : (
                    <p className="px-6 pt-5 pb-1 text-muted-foreground text-xs">
                      {t("about.creditsOpenSourceHint")}
                    </p>
                  )}

                  {showShared ? (
                    <section data-credits-section="shared">
                      <h4 className="sticky top-0 z-10 border-border-soft border-b bg-popover px-6 py-2.5 font-medium text-foreground text-xs tracking-wide">
                        <HighlightSearchText
                          activeMatchIndex={activeMatchIndex}
                          matchCounter={matchCounter}
                          query={query}
                          text={t("about.creditsShared")}
                        />
                      </h4>
                      {query.trim() ? null : (
                        <p className="px-6 pt-2 text-muted-foreground text-xs">
                          {t("about.creditsSharedHint")}
                        </p>
                      )}
                      <OssPackageList
                        activeMatchIndex={activeMatchIndex}
                        matchCounter={matchCounter}
                        packages={sharedCredits}
                        query={query}
                      />
                    </section>
                  ) : null}

                  {appGroups.length > 0 ? (
                    <section className="mt-2" data-credits-section="apps">
                      <h3 className="sticky top-0 z-10 border-border-soft border-b bg-popover px-6 py-2.5 font-semibold text-base">
                        <HighlightSearchText
                          activeMatchIndex={activeMatchIndex}
                          matchCounter={matchCounter}
                          query={query}
                          text={t("about.creditsNavApps")}
                        />
                      </h3>
                      {appGroups.map((group) => (
                        <div className="mt-1" key={group.id}>
                          <h4 className="px-6 pt-3 pb-1 font-medium text-muted-foreground text-xs tracking-wide">
                            <HighlightSearchText
                              activeMatchIndex={activeMatchIndex}
                              matchCounter={matchCounter}
                              query={query}
                              text={group.label}
                            />
                          </h4>
                          <OssPackageList
                            activeMatchIndex={activeMatchIndex}
                            matchCounter={matchCounter}
                            packages={group.packages}
                            query={query}
                          />
                        </div>
                      ))}
                    </section>
                  ) : null}

                  {packageGroups.length > 0 ? (
                    <section className="mt-2" data-credits-section="packages">
                      <h3 className="sticky top-0 z-10 border-border-soft border-b bg-popover px-6 py-2.5 font-semibold text-base">
                        <HighlightSearchText
                          activeMatchIndex={activeMatchIndex}
                          matchCounter={matchCounter}
                          query={query}
                          text={t("about.creditsNavPackages")}
                        />
                      </h3>
                      {packageGroups.map((group) => (
                        <div className="mt-1" key={group.id}>
                          <h4 className="px-6 pt-3 pb-1 font-medium text-muted-foreground text-xs tracking-wide">
                            <HighlightSearchText
                              activeMatchIndex={activeMatchIndex}
                              matchCounter={matchCounter}
                              query={query}
                              text={group.label}
                            />
                          </h4>
                          <OssPackageList
                            activeMatchIndex={activeMatchIndex}
                            matchCounter={matchCounter}
                            packages={group.packages}
                            query={query}
                          />
                        </div>
                      ))}
                    </section>
                  ) : null}

                  {moduleGroups.map((group) => (
                    <section
                      className="mt-2"
                      data-credits-section={groupSectionKey(group.id)}
                      key={group.id}
                    >
                      <h4 className="sticky top-0 z-10 border-border-soft border-b bg-popover px-6 py-2.5 font-medium text-foreground text-xs tracking-wide">
                        <span className="text-muted-foreground">
                          <HighlightSearchText
                            activeMatchIndex={activeMatchIndex}
                            matchCounter={matchCounter}
                            query={query}
                            text={kindLabel(group.kind, t)}
                          />
                        </span>
                        <span className="text-muted-foreground"> · </span>
                        <HighlightSearchText
                          activeMatchIndex={activeMatchIndex}
                          matchCounter={matchCounter}
                          query={query}
                          text={group.label}
                        />
                      </h4>
                      <OssPackageList
                        activeMatchIndex={activeMatchIndex}
                        matchCounter={matchCounter}
                        packages={group.packages}
                        query={query}
                      />
                    </section>
                  ))}
                </div>
              ) : (
                <SearchEmpty>{t("about.searchNoMatches")}</SearchEmpty>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
