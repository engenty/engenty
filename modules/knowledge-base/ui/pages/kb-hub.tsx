/**
 * Knowledge base home — article dashboard with hybrid search.
 * Typing 3+ words morphs the search field into a chat composer;
 * submitting navigates to /kb/:slug/chat?q=…&chat_kb=… for a full session.
 */

import {
  COPILOT_DOCK_COMPOSER_CARD_CLASS,
  CopilotComposerSection,
  PromptInputProvider,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { ArrowRight, BookOpen, Eye, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  KB_HUB_PAGE_LAYOUT_DEFAULTS,
  type KbPageLayoutSettings,
} from "../../src/schema/page-blocks.js";
import type { KbCover } from "../../src/schema/types.js";
import { listCategories } from "../api.js";
import type { KbChatScopeValue } from "../components/kb-chat-kb-scope-control.js";
import { KbChatKbScopeControl } from "../components/kb-chat-kb-scope-control.js";
import { KbHubCover } from "../components/kb-hub-cover.js";
import { KbHubKbHeaderInline } from "../components/kb-hub-kb-header-inline.js";
import { KbHubSearchCombobox } from "../components/kb-hub-search-combobox.js";
import { KbModuleShellActions } from "../components/kb-module-shell-actions.js";
import { KbPageBlocksEditor } from "../components/page-blocks/kb-page-blocks-editor.js";
import { useKbHubAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-shell.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { kbCoverIsLight } from "../kb-cover-theme-presets.js";
import { kbDisplayName } from "../kb-display-name.js";
import {
  KB_MODULE_BASE,
  kbArticlePath,
  kbArticlesListPath,
  kbCategoryPath,
  kbHubChatPath,
  kbHubEditPath,
  kbHubPath,
  searchStringWithoutKbId,
} from "../kb-paths.js";
import {
  kbFlatRowLinkClass,
  kbFlatRowTitleClass,
  kbHubOverviewCardClassName,
} from "../lib/kb-flat-list-styles.js";
import { listTopLevelCategories } from "../lib/kb-hub-top-level-categories.js";
import {
  KB_HUB_HERO_SEARCH_HEIGHT_PX,
  kbHubSectionHeadingClassName,
  kbModuleHubContentInnerClassName,
  kbModulePageScrollAreaShellSectionClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import {
  categoriesQueryOptions,
  kbDetailQueryOptions,
  kbSettingsQueryOptions,
  kbsQueryOptions,
  useUpdateKbPageLayoutMutation,
} from "../queries.js";
import {
  kbIdFromSlug,
  resolveKbIdFromUrl,
  slugFromKbId,
  tenantDefaultKbId,
} from "../resolve-kb-id.js";

const SEARCH_H = KB_HUB_HERO_SEARCH_HEIGHT_PX;
/** px height of the expanded chat card (dock composer + footer tools). */
const CHAT_H = 160;
/** Extra layout space so `shadow-lg` on the dock composer is not clipped. */
const CHAT_COMPOSER_SHADOW_BLEED_PX = 16;

export function KbHubPage({ mode = "view" }: { mode?: "edit" | "view" }) {
  const isEditMode = mode === "edit";
  const { t } = useTranslation("kb");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { kbSlug: kbSlugParam } = useParams<{ kbSlug?: string }>();
  const [searchParams] = useSearchParams();
  const [searchText, setSearchText] = useState("");
  const [hubChatKbScope, setHubChatKbScope] = useState<KbChatScopeValue>("");
  const [coverOverride, setCoverOverride] = useState<{
    cover: KbCover | null;
    kbId: string;
  } | null>(null);
  const composerSurfaceRef = useRef<HTMLDivElement>(null);
  const prevChatMode = useRef(false);

  const { data: kbs = [], isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const { data: kbSettings } = useQuery(kbSettingsQueryOptions);
  const tenantDefault = tenantDefaultKbId(kbSettings);

  const kbId = useMemo(() => {
    if (kbSlugParam?.trim()) {
      return kbIdFromSlug(kbs, kbSlugParam);
    }
    return resolveKbIdFromUrl(searchParams, kbs, tenantDefault);
  }, [kbSlugParam, searchParams, kbs, tenantDefault]);

  const kbSlug = useMemo(() => slugFromKbId(kbs, kbId), [kbs, kbId]);

  const { data: kbDetail } = useQuery({
    ...kbDetailQueryOptions(kbId),
  });

  useEffect(() => {
    if (kbsLoading || kbs.length === 0) {
      return;
    }
    const rest = searchStringWithoutKbId(searchParams);
    if (kbSlugParam?.trim() && !kbIdFromSlug(kbs, kbSlugParam)) {
      navigate(`${KB_MODULE_BASE}${rest}`, { replace: true });
      return;
    }
    // Stay on `/mdl/knowledge-base` (module root) — do not redirect a single KB
    // into `/kb/:slug` so the shell module icon and module home stay addressable.
  }, [kbsLoading, kbs, kbSlugParam, searchParams, navigate]);

  const wordCount = useMemo(
    () => searchText.trim().split(/\s+/).filter(Boolean).length,
    [searchText]
  );
  const chatMode = wordCount >= 3;

  useEffect(() => {
    if (kbId) {
      setHubChatKbScope(kbId);
    }
  }, [kbId]);

  const hubStarterPrompts = useMemo(
    () => [
      {
        id: "find-contacts",
        label: tc("copilot.empty.starters.findContacts.label"),
        prompt: tc("copilot.empty.starters.findContacts.prompt"),
      },
      {
        id: "draft-follow-up",
        label: tc("copilot.empty.starters.draftFollowUp.label"),
        prompt: tc("copilot.empty.starters.draftFollowUp.prompt"),
      },
      {
        id: "plan-work",
        label: tc("copilot.empty.starters.planWork.label"),
        prompt: tc("copilot.empty.starters.planWork.prompt"),
      },
      {
        id: "what-can-you-do",
        label: tc("copilot.empty.starters.whatCanYouDo.label"),
        prompt: tc("copilot.empty.starters.whatCanYouDo.prompt"),
      },
    ],
    [tc]
  );

  // Move focus to the composer textarea, caret at end, when crossing into chat mode.
  useEffect(() => {
    const was = prevChatMode.current;
    prevChatMode.current = chatMode;
    if (chatMode && !was) {
      const id = requestAnimationFrame(() => {
        const el = composerSurfaceRef.current?.querySelector("textarea");
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
      return () => cancelAnimationFrame(id);
    }
  }, [chatMode]);

  const submitToChat = useCallback(
    (messageText: string) => {
      const q = messageText.trim();
      if (!(q && kbSlug)) {
        return;
      }
      const params = new URLSearchParams();
      params.set("q", q);
      const scope = hubChatKbScope === "" ? kbId : hubChatKbScope;
      params.set("chat_kb", scope === "all" ? "all" : scope);
      // Fresh client + server session per hub launch (stable chat store id would otherwise reuse).
      params.set("hub_run", crypto.randomUUID());
      navigate(`${kbHubChatPath(kbSlug)}?${params.toString()}`);
    },
    [hubChatKbScope, kbId, kbSlug, navigate]
  );

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId,
    kbSlug: kbSlug ?? "",
  });

  const activeKbBase = useMemo(() => {
    const row = kbs.find((k) => k.id === kbId || String(k.id) === String(kbId));
    if (!row) {
      return;
    }
    if (!kbDetail || kbDetail.id !== kbId) {
      return row;
    }
    return { ...row, ...kbDetail };
  }, [kbs, kbId, kbDetail]);

  const activeKb = useMemo(() => {
    if (!activeKbBase) {
      return;
    }
    if (coverOverride?.kbId !== activeKbBase.id) {
      return activeKbBase;
    }
    return { ...activeKbBase, cover: coverOverride.cover };
  }, [activeKbBase, coverOverride]);

  const breadcrumbs = useMemo(() => {
    const root = kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : [];
    if (!(isEditMode && kbSlug)) {
      return root;
    }
    return [
      ...root.map((crumb) =>
        crumb.to ? crumb : { ...crumb, to: kbHubPath(kbSlug) }
      ),
      { label: t("category.actions.edit") },
    ];
  }, [isEditMode, kbShellNav.kbRootCrumb, kbSlug, t]);

  const pageActions = useMemo(() => {
    if (!kbSlug || kbsLoading || !activeKbBase) {
      return kbSlug && !kbsLoading ? (
        <KbModuleShellActions kbSlug={kbSlug} />
      ) : null;
    }
    if (isEditMode) {
      return (
        <div className="flex items-center gap-1">
          <Button
            className={topbarIconButtonClassName}
            onClick={() => navigate(kbHubPath(kbSlug))}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Eye aria-hidden className="h-4 w-4" />
            <TopbarActionLabel>{t("category.actions.view")}</TopbarActionLabel>
          </Button>
          <KbModuleShellActions hideKbSettings kbSlug={kbSlug} />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <Button
          aria-label={t("category.actions.edit")}
          className={topbarIconButtonClassName}
          onClick={() => navigate(kbHubEditPath(kbSlug))}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Pencil aria-hidden className="h-4 w-4" />
        </Button>
        <KbModuleShellActions hideKbSettings kbSlug={kbSlug} />
      </div>
    );
  }, [activeKbBase, isEditMode, kbSlug, kbsLoading, navigate, t]);

  usePageConfig({
    topbarChrome: "contentBlend",
    topbarOverlap: true,
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs,
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  const kbName = activeKb ? kbDisplayName(activeKb, t) : t("hub.title");
  useKbHubAgentUiSlice({
    isEditMode,
    kbId: kbId ?? "",
    kbName,
  });

  const pageLayoutMutation = useUpdateKbPageLayoutMutation(kbId ?? "");

  const hubPageLayout: KbPageLayoutSettings = useMemo(
    () => activeKb?.page_layout ?? KB_HUB_PAGE_LAYOUT_DEFAULTS,
    [activeKb?.page_layout]
  );

  const { data: categoryRows = [] } = useQuery(categoriesQueryOptions(kbId));

  const kbCardsData = useQuery({
    queryKey: ["kb", "hub", "kb-cards", kbs.map((k) => k.id).join(",")],
    enabled: kbs.length > 1,
    queryFn: async () => {
      const out: Array<{
        categories: { name: string; slug: string }[];
        id: string;
        name: string;
        slug: string;
      }> = [];
      for (const kb of kbs.slice(0, 12)) {
        const categories = await listCategories(kb.id);
        out.push({
          id: kb.id,
          name: kb.name,
          slug: kb.slug,
          categories: listTopLevelCategories(categories, 4).map((c) => ({
            name: c.name,
            slug: c.slug,
          })),
        });
      }
      return out;
    },
  });

  if (kbsLoading) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="mt-4 h-40 w-full" />
      </section>
    );
  }

  if (kbs.length === 0) {
    return (
      <section
        className={`${kbModulePageShellSectionClassName} items-center justify-center text-center`}
      >
        <BookOpen aria-hidden className="h-10 w-10 text-muted-foreground" />
        <div className="max-w-md space-y-1">
          <h1 className="font-semibold text-lg">{t("hub.empty_title")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("hub.empty_description")}
          </p>
        </div>
        <Button asChild>
          <Link to="/settings/knowledge-base">{t("hub.empty_cta")}</Link>
        </Button>
      </section>
    );
  }

  if (!(kbId && kbSlug)) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="mt-4 h-40 w-full" />
      </section>
    );
  }

  const multiKb = kbs.length > 1;
  const showMultiKbCards = multiKb && !kbSlugParam;

  return (
    <section className={kbModulePageScrollAreaShellSectionClassName}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeKb ? (
          <KbHubCover
            editable={isEditMode}
            header={
              <KbHubKbHeaderInline
                editable={isEditMode}
                kb={activeKb}
                onCoverMutationError={(cover) =>
                  setCoverOverride({ cover, kbId: activeKb.id })
                }
                onOptimisticCoverChange={(cover) =>
                  setCoverOverride({ cover, kbId: activeKb.id })
                }
                showAddCoverShortcut={isEditMode}
                surface={
                  kbCoverIsLight(activeKb.cover) ? "default" : "on-cover"
                }
              />
            }
            kb={activeKb}
            onCoverMutationError={(cover) =>
              setCoverOverride({ cover, kbId: activeKb.id })
            }
            onOptimisticCoverChange={(cover) =>
              setCoverOverride({ cover, kbId: activeKb.id })
            }
          />
        ) : null}

        <div className={kbModuleHubContentInnerClassName}>
          {activeKb ? null : (
            <h1 className="font-heading font-semibold text-[28px] text-foreground leading-9 tracking-tight">
              {kbName}
            </h1>
          )}

          <div
            className="relative"
            style={{
              height: chatMode
                ? CHAT_H + CHAT_COMPOSER_SHADOW_BLEED_PX
                : SEARCH_H,
              transition: "height 200ms ease-out",
            }}
          >
            <div
              aria-hidden={chatMode}
              className="absolute inset-x-0 top-0"
              style={{
                opacity: chatMode ? 0 : 1,
                pointerEvents: chatMode ? "none" : "auto",
                transition: "opacity 160ms ease-out",
              }}
            >
              <KbHubSearchCombobox
                kbId={showMultiKbCards ? undefined : kbId}
                kbIds={showMultiKbCards ? kbs.map((k) => k.id) : undefined}
                onOpenArticle={(articleId, articleKbId) => {
                  const targetKbSlug = articleKbId
                    ? (slugFromKbId(kbs, articleKbId) ?? kbSlug)
                    : kbSlug;
                  navigate(kbArticlePath(targetKbSlug, articleId));
                }}
                onSeeAll={(q) =>
                  navigate(
                    `${kbArticlesListPath(kbSlug)}?search=${encodeURIComponent(q)}`
                  )
                }
                onValueChange={setSearchText}
                value={searchText}
              />
            </div>

            <div
              aria-hidden={!chatMode}
              className="absolute inset-x-0 top-0 overflow-visible"
              ref={composerSurfaceRef}
              style={{
                opacity: chatMode ? 1 : 0,
                pointerEvents: chatMode ? "auto" : "none",
                transition: "opacity 160ms ease-out",
              }}
            >
              <PromptInputProvider initialInput={searchText}>
                <div className={COPILOT_DOCK_COMPOSER_CARD_CLASS}>
                  <CopilotComposerSection
                    compact
                    compactLeadingControl={
                      <KbChatKbScopeControl
                        kbs={kbs}
                        kbsLoading={kbsLoading}
                        onKbChange={setHubChatKbScope}
                        selected={hubChatKbScope === "" ? kbId : hubChatKbScope}
                      />
                    }
                    composerPlaceholder={tc("copilot.typeMessage")}
                    draft={searchText}
                    setDraft={setSearchText}
                    showStarterPrompts={false}
                    status="ready"
                    submitMessage={submitToChat}
                  />
                </div>
              </PromptInputProvider>
            </div>
          </div>

          {chatMode ? (
            <div className="flex flex-wrap gap-2">
              {hubStarterPrompts.map((s) => (
                <Button
                  className="ui-canvas-outline-control h-8 rounded-[4px] px-3 font-normal text-sm shadow-none"
                  key={s.id}
                  onClick={() => {
                    setSearchText(s.prompt);
                    void requestAnimationFrame(() => {
                      const ta =
                        composerSurfaceRef.current?.querySelector("textarea");
                      ta?.focus();
                      if (ta) {
                        const len = ta.value.length;
                        ta.setSelectionRange(len, len);
                      }
                    });
                  }}
                  type="button"
                  variant="outline"
                >
                  {s.label}
                </Button>
              ))}
            </div>
          ) : null}

          {showMultiKbCards ? (
            <section className="space-y-3">
              <h2 className={kbHubSectionHeadingClassName}>
                {t("hub.your_kbs")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {kbCardsData.isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton className="h-28 w-full rounded-lg" key={i} />
                    ))
                  : (kbCardsData.data ?? []).map((row) => {
                      const rowKb = kbs.find((k) => k.id === row.id);
                      const rowTitle = rowKb
                        ? kbDisplayName(rowKb, t)
                        : row.name;
                      return (
                        <div
                          className={kbHubOverviewCardClassName}
                          key={row.id}
                        >
                          <p className="font-medium text-foreground text-sm">
                            {rowTitle}
                          </p>
                          {row.categories.length > 0 ? (
                            <ul className="divide-y divide-border/50">
                              {row.categories.map((c) => (
                                <li key={c.slug}>
                                  <Link
                                    className={kbFlatRowLinkClass}
                                    to={kbCategoryPath(row.slug, c.slug)}
                                  >
                                    <span className={kbFlatRowTitleClass}>
                                      {c.name}
                                    </span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <Button
                            asChild
                            className="h-8 px-0"
                            size="sm"
                            variant="link"
                          >
                            <Link to={kbHubPath(row.slug)}>
                              {t("hub.open_kb")}
                              <ArrowRight className="ml-1 h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      );
                    })}
              </div>
            </section>
          ) : activeKb ? (
            <KbPageBlocksEditor
              categories={categoryRows}
              isEditMode={isEditMode}
              kbSlug={kbSlug}
              layout={hubPageLayout}
              onLayoutChange={(next) => pageLayoutMutation.mutate(next)}
              target={{ kind: "hub", kb: activeKb }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
