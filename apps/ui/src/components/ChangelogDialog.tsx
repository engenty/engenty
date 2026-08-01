import { useTranslation } from "@engenty/i18n/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AboutDockNav } from "@/components/AboutDockNav";
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

interface ChangelogCommit {
  breaking: boolean;
  group: string | null;
  id: string;
  message: string;
}

interface ChangelogRelease {
  commits: ChangelogCommit[];
  timestamp: number | null;
  version: string | null;
}

interface ChangelogDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const GROUP_DOT: Record<string, string> = {
  Added: "bg-emerald-500",
  Deploy: "bg-sky-500",
  Docs: "bg-muted-foreground",
  Fixed: "bg-amber-500",
  Other: "bg-muted-foreground",
  Performance: "bg-violet-500",
};

function formatDate(timestamp: number | null): string {
  if (!timestamp) {
    return "";
  }
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function releaseKey(release: ChangelogRelease): string {
  return release.version ?? "unreleased";
}

function releaseLabel(release: ChangelogRelease, unreleased: string): string {
  return release.version ? release.version.replace(/^v/, "") : unreleased;
}

/** git-cliff `message` can include the body; UI + search use the subject line only. */
function commitSubject(message: string): string {
  return message.split(/\r?\n/, 1)[0] ?? message;
}

function commitMatchesQuery(
  commit: ChangelogCommit,
  query: string,
  otherGroup: string
): boolean {
  const q = query.trim();
  if (!q) {
    return true;
  }
  return (
    countTextMatches(commitSubject(commit.message), q) > 0 ||
    countTextMatches(commit.group ?? otherGroup, q) > 0
  );
}

/** Prefer unique subjects — cliff history can list the same subject twice. */
function dedupeCommitsBySubject(commits: ChangelogCommit[]): ChangelogCommit[] {
  const seen = new Set<string>();
  const out: ChangelogCommit[] = [];
  for (const commit of commits) {
    const subject = commitSubject(commit.message);
    if (seen.has(subject)) {
      continue;
    }
    seen.add(subject);
    out.push(commit);
  }
  return out;
}

function releaseMatchesQuery(
  release: ChangelogRelease,
  label: string,
  query: string,
  otherGroup: string
): boolean {
  const q = query.trim();
  if (!q) {
    return true;
  }
  if (countTextMatches(label, q) > 0) {
    return true;
  }
  if (
    release.timestamp &&
    countTextMatches(formatDate(release.timestamp), q) > 0
  ) {
    return true;
  }
  return release.commits.some((commit) =>
    commitMatchesQuery(commit, q, otherGroup)
  );
}

export function ChangelogDialog({ open, onOpenChange }: ChangelogDialogProps) {
  const { t } = useTranslation("common");
  const [releases, setReleases] = useState<ChangelogRelease[] | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const unreleasedLabel = t("about.unreleased");
  const otherGroup = t("about.changelogOther");

  useEffect(() => {
    if (!open || releases) {
      return;
    }
    let cancelled = false;
    void import("@/data/changelog.json").then((mod) => {
      if (!cancelled) {
        setReleases(mod.default as ChangelogRelease[]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, releases]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveMatchIndex(0);
    }
  }, [open]);

  const visibleReleases = useMemo(() => {
    if (!releases) {
      return [];
    }
    const q = query.trim();
    return releases
      .filter((release) =>
        releaseMatchesQuery(
          release,
          releaseLabel(release, unreleasedLabel),
          query,
          otherGroup
        )
      )
      .map((release) => {
        const commits = dedupeCommitsBySubject(release.commits);
        if (!q) {
          return { ...release, commits };
        }
        // Keep commits that match; if only the version/date matched, keep all.
        const matching = commits.filter((commit) =>
          commitMatchesQuery(commit, q, otherGroup)
        );
        return {
          ...release,
          commits: matching.length > 0 ? matching : commits,
        };
      });
  }, [releases, query, unreleasedLabel, otherGroup]);

  const matchCount = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return 0;
    }
    let total = 0;
    for (const release of visibleReleases) {
      const label = releaseLabel(release, unreleasedLabel);
      total += countTextMatches(label, q);
      if (release.timestamp) {
        total += countTextMatches(formatDate(release.timestamp), q);
      }
      for (const commit of release.commits) {
        total += countTextMatches(commit.group ?? otherGroup, q);
        total += countTextMatches(commitSubject(commit.message), q);
      }
    }
    return total;
  }, [visibleReleases, query, unreleasedLabel, otherGroup]);

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
    if (!(open && visibleReleases.length)) {
      return;
    }
    setActiveKey(releaseKey(visibleReleases[0]));
  }, [open, visibleReleases]);

  const { beginProgrammaticScroll } = useAboutSectionScrollSpy({
    open,
    contentRef,
    sectionAttr: "data-changelog-section",
    resetKey: visibleReleases,
    onActiveChange: (key) => {
      setActiveKey((prev) => (prev === key ? prev : key));
    },
  });

  const navItems = useMemo(
    () =>
      visibleReleases.map((release) => ({
        key: releaseKey(release),
        label: releaseLabel(release, unreleasedLabel),
      })),
    [visibleReleases, unreleasedLabel]
  );
  const navKeys = useMemo(() => navItems.map((item) => item.key), [navItems]);

  const scrollToRelease = useCallback(
    (key: string) => {
      const root = contentRef.current;
      const target = root?.querySelector<HTMLElement>(
        `[data-changelog-section="${key}"]`
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
    onNavigate: scrollToRelease,
  });

  const matchCounter = createMatchCounter();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[min(90vh,800px)] max-h-[min(90vh,800px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="relative shrink-0 border-b px-6 py-4 pr-12">
          <DialogTitle className="pr-56">
            {t("about.changelogTitle")}
          </DialogTitle>
          <DialogDescription className="pr-56">
            {t("about.changelogDescription")}
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

        {releases === null ? (
          <p className="px-6 py-4 text-muted-foreground text-sm">
            {t("about.loading")}
          </p>
        ) : releases.length === 0 ? (
          <p className="px-6 py-4 text-muted-foreground text-sm">
            {t("about.changelogEmpty")}
          </p>
        ) : (
          <div className="flex min-h-0 flex-1">
            <AboutDockNav
              activeKey={activeKey}
              items={navItems}
              label={t("about.changelogTitle")}
              onSelect={scrollToRelease}
            />

            <div
              className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
              ref={contentRef}
            >
              {visibleReleases.length === 0 ? (
                <SearchEmpty>{t("about.searchNoMatches")}</SearchEmpty>
              ) : (
                <div className="flex flex-col pb-6">
                  {visibleReleases.map((release) => {
                    const key = releaseKey(release);
                    const label = releaseLabel(release, unreleasedLabel);
                    return (
                      <section
                        className="scroll-mt-0"
                        data-changelog-section={key}
                        key={key}
                      >
                        <h3 className="sticky top-0 z-10 flex items-baseline gap-3 border-border/60 border-b bg-popover px-6 py-2.5 font-semibold text-base">
                          <HighlightSearchText
                            activeMatchIndex={activeMatchIndex}
                            matchCounter={matchCounter}
                            query={query}
                            text={label}
                          />
                          {release.timestamp ? (
                            <span className="font-normal text-muted-foreground text-sm">
                              <HighlightSearchText
                                activeMatchIndex={activeMatchIndex}
                                matchCounter={matchCounter}
                                query={query}
                                text={formatDate(release.timestamp)}
                              />
                            </span>
                          ) : null}
                        </h3>
                        <ul className="flex flex-col gap-1.5 px-6 pt-3 pb-8">
                          {release.commits.map((commit) => {
                            const group = commit.group ?? otherGroup;
                            const subject = commitSubject(commit.message);
                            return (
                              <li
                                className="flex items-start gap-2 text-sm"
                                key={commit.id}
                              >
                                <span
                                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                                    GROUP_DOT[commit.group ?? "Other"] ??
                                    GROUP_DOT.Other
                                  }`}
                                />
                                <span>
                                  <span className="font-medium">
                                    <HighlightSearchText
                                      activeMatchIndex={activeMatchIndex}
                                      matchCounter={matchCounter}
                                      query={query}
                                      text={group}
                                    />
                                    :
                                  </span>{" "}
                                  <HighlightSearchText
                                    activeMatchIndex={activeMatchIndex}
                                    matchCounter={matchCounter}
                                    query={query}
                                    text={subject}
                                  />
                                  {commit.breaking ? (
                                    <span className="ml-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-medium text-red-500 text-xs">
                                      {t("about.breaking")}
                                    </span>
                                  ) : null}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
