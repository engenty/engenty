/**
 * Knowledge base home — article dashboard with hybrid search.
 * Typing 3+ words morphs the search field into a chat composer;
 * submitting navigates to /mdl/knowledge-base/chat?q=… for a full session.
 */

import {
  COPILOT_DOCK_COMPOSER_CARD_CLASS,
  CopilotComposerSection,
  PromptInputProvider,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import {
  useCanAdministerTenant,
  usePageConfig,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import { BookOpen, Eye, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  KB_HUB_PAGE_LAYOUT_DEFAULTS,
  type KbPageLayoutSettings,
} from "../../src/schema/page-blocks.js";
import type { KbCover } from "../../src/schema/types.js";
import { setUpSpaceKnowledgeBase } from "../api/knowledge-bases.js";
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
  kbArticlePath,
  kbArticlesListPath,
  kbHubChatPath,
  kbHubEditPath,
  kbHubPath,
} from "../kb-paths.js";
import {
  KB_HUB_HERO_SEARCH_HEIGHT_PX,
  kbModuleHubContentInnerClassName,
  kbModulePageScrollAreaShellSectionClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import { KB_LIST_KEY_PREFIX } from "../queries/knowledge-bases.js";
import {
  categoriesQueryOptions,
  kbDetailQueryOptions,
  kbSettingsQueryOptions,
  useKbsQuery,
  useUpdateKbPageLayoutMutation,
} from "../queries.js";
import { spaceKbId } from "../resolve-kb-id.js";

const SEARCH_H = KB_HUB_HERO_SEARCH_HEIGHT_PX;
/** px height of the expanded chat card (dock composer + footer tools). */
const CHAT_H = 160;
/** Extra layout space so `shadow-lg` on the dock composer is not clipped. */
const CHAT_COMPOSER_SHADOW_BLEED_PX = 16;

export function KbHubPage({ mode = "view" }: { mode?: "edit" | "view" }) {
  const isEditMode = mode === "edit";
  const { t } = useTranslation("kb");
  const { t: tc } = useTranslation("common");
  const canAdministerTenant = useCanAdministerTenant();
  const { currentSpace } = useWorkspaceContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setupMut = useMutation({
    mutationFn: () => setUpSpaceKnowledgeBase(currentSpace?.id ?? ""),
    onSuccess: ({ mounted }) => {
      queryClient.invalidateQueries({ queryKey: KB_LIST_KEY_PREFIX });
      queryClient.invalidateQueries({ queryKey: ["kb", "knowledge-bases"] });
      const kb = mounted.find((entry) => entry.module_id === "knowledge-base");
      if (kb?.error) {
        toast.error(kb.error);
      } else if (kb?.needs.includes("ai_gateway")) {
        toast.warning(t("hub.setup_needs_ai_gateway"));
      } else {
        toast.success(t("hub.setup_done"));
      }
    },
    onError: (err) => toast.error(err.message),
  });
  const [searchParams] = useSearchParams();
  const [searchText, setSearchText] = useState("");
  const [coverOverride, setCoverOverride] = useState<{
    cover: KbCover | null;
    kbId: string;
  } | null>(null);
  const composerSurfaceRef = useRef<HTMLDivElement>(null);
  const prevChatMode = useRef(false);

  const { data: kbs = [], isLoading: kbsLoading } = useKbsQuery();
  const { data: kbSettings } = useQuery(kbSettingsQueryOptions);

  const kbId = useMemo(() => spaceKbId(kbs), [kbs]);

  const { data: kbDetail } = useQuery({
    ...kbDetailQueryOptions(kbId),
  });

  const wordCount = useMemo(
    () => searchText.trim().split(/\s+/).filter(Boolean).length,
    [searchText]
  );
  const chatMode = wordCount >= 3;

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
      if (!q) {
        return;
      }
      const params = new URLSearchParams();
      params.set("q", q);
      // Fresh client + server session per hub launch (stable chat store id would otherwise reuse).
      params.set("hub_run", crypto.randomUUID());
      navigate(`${kbHubChatPath()}?${params.toString()}`);
    },
    [kbId, navigate]
  );

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId,
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
    if (!isEditMode) {
      return root;
    }
    return [
      ...root.map((crumb) =>
        crumb.to ? crumb : { ...crumb, to: kbHubPath() }
      ),
      { label: t("category.actions.edit") },
    ];
  }, [isEditMode, kbShellNav.kbRootCrumb, t]);

  const pageActions = useMemo(() => {
    if (kbsLoading || !activeKbBase) {
      return kbsLoading ? null : <KbModuleShellActions />;
    }
    if (isEditMode) {
      return (
        <div className="flex items-center gap-1">
          <Button
            className={topbarIconButtonClassName}
            onClick={() => navigate(kbHubPath())}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Eye aria-hidden className="h-4 w-4" />
            <TopbarActionLabel>{t("category.actions.view")}</TopbarActionLabel>
          </Button>
          <KbModuleShellActions hideKbSettings />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1">
        <Button
          aria-label={t("category.actions.edit")}
          className={topbarIconButtonClassName}
          onClick={() => navigate(kbHubEditPath())}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Pencil aria-hidden className="h-4 w-4" />
        </Button>
        <KbModuleShellActions hideKbSettings />
      </div>
    );
  }, [activeKbBase, isEditMode, kbsLoading, navigate, t]);

  usePageConfig({
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

  if (kbsLoading) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="mt-4 h-40 w-full" />
      </section>
    );
  }

  if (kbs.length === 0) {
    // The library is created when the module is mounted (kb_space_mount).
    // Reaching this state means that setup did not finish; re-adding the
    // module is the retry, offered only to someone who can act on it.
    return (
      <section
        className={`${kbModulePageShellSectionClassName} items-center justify-center text-center`}
      >
        <BookOpen aria-hidden className="h-10 w-10 text-muted-foreground" />
        <div className="max-w-md space-y-1">
          <h1 className="font-semibold text-lg">{t("hub.empty_title")}</h1>
          <p className="text-muted-foreground text-sm">
            {canAdministerTenant
              ? t("hub.empty_description")
              : t("hub.empty_no_permission")}
          </p>
        </div>
        {canAdministerTenant && currentSpace ? (
          <Button
            disabled={setupMut.isPending}
            onClick={() => setupMut.mutate()}
            type="button"
          >
            <Plus className="mr-1.5 size-4" />
            {setupMut.isPending ? t("actions.saving") : t("hub.empty_cta")}
          </Button>
        ) : null}
      </section>
    );
  }

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
                kbId={kbId}
                onOpenArticle={(articleId) => {
                  navigate(kbArticlePath(articleId));
                }}
                onSeeAll={(q) =>
                  navigate(
                    `${kbArticlesListPath()}?search=${encodeURIComponent(q)}`
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

          {activeKb ? (
            <KbPageBlocksEditor
              categories={categoryRows}
              isEditMode={isEditMode}
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
