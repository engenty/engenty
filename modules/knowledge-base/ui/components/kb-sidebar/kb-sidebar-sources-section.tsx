/**
 * Sources tab in the KB sidebar — each source is a folder, its retrieved
 * items are the leaves. Mirrors the article/category tree chrome (row shell,
 * hover actions, dense 3-dot menus); no drag reorder by design.
 */

import { canonicalModulePathname } from "@engenty/ai-core/browser";
import { shellSecondaryNavItemProps } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarExpandChevronButton,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarRow,
  SidebarRowActions,
  SidebarRowButton,
  SidebarRowLeadingIcon,
  sidebarDenseMenuContentClassName,
  sidebarDenseMenuIconClassName,
  sidebarDenseMenuItemClassName,
  sidebarDenseMenuLabelClassName,
  sidebarSectionLabelPlAlignToRootRowIconClassName,
} from "@engenty/ui-core";
import {
  ExternalLink,
  Eye,
  EyeOff,
  FileUp,
  Globe,
  Link2,
  MoreVertical,
  Network,
  Pause,
  Pencil,
  PenLine,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type {
  KbSource,
  KbSourceAdapterId,
  KbSourceItem,
} from "../../../src/schema/types.js";
import { kbSourceAddSearch } from "../../kb-open-source-add-state.js";
import {
  kbSourceEditPath,
  kbSourceItemPath,
  kbSourcePath,
  kbSourcesPath,
} from "../../kb-paths.js";
import {
  kbSourceItemDetailQueryOptions,
  kbSourceItemsQueryOptions,
  kbSourcesListQueryOptions,
  useKbSourceMutations,
} from "../../queries.js";

const SOURCES_SIDEBAR_PAGE_SIZE = 100;
/** Item list schema caps page_size at 200; overflow gets a "show all" link. */
const SOURCE_ITEMS_SIDEBAR_PAGE_SIZE = 200;
const RUNNING_REFETCH_MS = 3000;

const ADAPTER_ICONS: Record<KbSourceAdapterId, typeof Link2> = {
  url: Link2,
  firecrawl_url: Link2,
  sitemap: Network,
  web_index: Globe,
  manual: PenLine,
  file_upload: FileUp,
};

function isSourceRunning(source: KbSource): boolean {
  return source.last_run_status === "running";
}

/** `<base>/<id>[/…]` → `<id>`; null when the path is not under `base`. */
function activeIdFromPath(pathname: string, base: string): string | null {
  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (!pathOnly.startsWith(`${base}/`)) {
    return null;
  }
  const segment = pathOnly.slice(base.length + 1).split("/")[0];
  if (!segment) {
    return null;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Lifecycle dot in the same slot the article tree uses. Running wins over
 * everything so an active ingest is visible even on a paused/failed source.
 */
function SourceStatusDot({ source }: { source: KbSource }) {
  const { t } = useTranslation("kb");
  if (isSourceRunning(source)) {
    return (
      <span
        aria-hidden
        className="relative flex h-1.5 w-1.5"
        title={t("sources.running")}
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
    );
  }
  if (source.last_run_status === "failed" || source.status === "failed") {
    return (
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-destructive"
        title={source.last_error ?? t("sources.filter_failed")}
      />
    );
  }
  if (!source.enabled || source.status === "paused") {
    return (
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
        title={t("sources.filter_paused")}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 rounded-full bg-emerald-500"
      title={t("sources.filter_active")}
    />
  );
}

function itemDotClassName(status: KbSourceItem["status"]): string {
  switch (status) {
    case "active":
      return "bg-emerald-500";
    case "ignored":
      return "bg-muted-foreground/40";
    case "missing":
      return "bg-destructive/70";
    case "draft":
      return "bg-amber-500/80";
    default:
      return "bg-muted-foreground/50";
  }
}

interface SourceRowProps {
  isActive: boolean;
  isOpen: boolean;
  onRequestDelete: (source: KbSource) => void;
  onRun: (source: KbSource) => void;
  onSetStatus: (source: KbSource, status: "active" | "paused") => void;
  onToggle: (id: string) => void;
  source: KbSource;
}

function KbSidebarSourceRow(props: SourceRowProps) {
  const {
    source,
    isActive,
    isOpen,
    onRequestDelete,
    onRun,
    onSetStatus,
    onToggle,
  } = props;
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const running = isSourceRunning(source);
  const paused = !source.enabled || source.status === "paused";
  const AdapterIcon = ADAPTER_ICONS[source.adapter_id] ?? Link2;

  return (
    <SidebarRow isActive={isActive}>
      <SidebarRowLeadingIcon
        alwaysShowChevron={false}
        chevronSlot={
          <SidebarExpandChevronButton
            ariaLabelCollapsed={t("sidebar.tree_expand_source_branch")}
            ariaLabelExpanded={t("sidebar.tree_collapse_source_branch")}
            isOpen={isOpen}
            onPressToggle={() => onToggle(source.id)}
            {...shellSecondaryNavItemProps}
          />
        }
        icon={<AdapterIcon aria-hidden />}
      />
      <SidebarRowButton
        isActive={isActive}
        onClick={() => navigate(kbSourcePath(source.id))}
        type="button"
        {...shellSecondaryNavItemProps}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="flex w-5 shrink-0 items-center justify-center">
            <SourceStatusDot source={source} />
          </span>
          <span
            className={cn(
              "truncate",
              paused && !isActive && "text-muted-foreground"
            )}
          >
            {source.name}
          </span>
        </span>
      </SidebarRowButton>
      <SidebarRowActions>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("sidebar.tree_source_more_aria")}
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              title={t("sidebar.tree_source_more_aria")}
              type="button"
              variant="ghost"
              {...shellSecondaryNavItemProps}
            >
              <MoreVertical aria-hidden className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={sidebarDenseMenuContentClassName}
          >
            <DropdownMenuLabel className={sidebarDenseMenuLabelClassName}>
              {t("sidebar.tree_menu_section_source")}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                className={sidebarDenseMenuItemClassName}
                {...shellSecondaryNavItemProps}
                onSelect={() => navigate(kbSourcePath(source.id))}
              >
                <ExternalLink
                  aria-hidden
                  className={sidebarDenseMenuIconClassName}
                />
                {t("sidebar.tree_open")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sidebarDenseMenuItemClassName}
                {...shellSecondaryNavItemProps}
                onSelect={() => navigate(kbSourceEditPath(source.id))}
              >
                <Pencil aria-hidden className={sidebarDenseMenuIconClassName} />
                {t("sources.edit_source")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sidebarDenseMenuItemClassName}
                disabled={running}
                {...shellSecondaryNavItemProps}
                onSelect={() => onRun(source)}
              >
                <Play aria-hidden className={sidebarDenseMenuIconClassName} />
                {running ? t("sources.running") : t("sources.run_now")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sidebarDenseMenuItemClassName}
                {...shellSecondaryNavItemProps}
                onSelect={() =>
                  onSetStatus(source, paused ? "active" : "paused")
                }
              >
                {paused ? (
                  <Play aria-hidden className={sidebarDenseMenuIconClassName} />
                ) : (
                  <Pause
                    aria-hidden
                    className={sidebarDenseMenuIconClassName}
                  />
                )}
                {paused ? t("sources.resume") : t("sources.pause")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-0.5" />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className={cn(
                  sidebarDenseMenuItemClassName,
                  "text-destructive focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
                )}
                {...shellSecondaryNavItemProps}
                onSelect={() => onRequestDelete(source)}
              >
                <Trash2 aria-hidden className={sidebarDenseMenuIconClassName} />
                {t("sources.delete")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarRowActions>
    </SidebarRow>
  );
}

interface SourceItemRowProps {
  isActive: boolean;
  item: KbSourceItem;
  onReindex: (source: KbSource, item: KbSourceItem) => void;
  onRequestDelete: (source: KbSource, item: KbSourceItem) => void;
  onToggleIgnored: (source: KbSource, item: KbSourceItem) => void;
  source: KbSource;
}

function KbSidebarSourceItemRow(props: SourceItemRowProps) {
  const {
    isActive,
    item,
    onReindex,
    onRequestDelete,
    onToggleIgnored,
    source,
  } = props;
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const ignored = item.status === "ignored";
  const title = item.title || item.source_url || item.adapter_item_key;

  return (
    <SidebarRow depth={1} indentVariant="noLeadingIcon" isActive={isActive}>
      <SidebarRowButton
        isActive={isActive}
        onClick={() => navigate(kbSourceItemPath(item.id))}
        type="button"
        {...shellSecondaryNavItemProps}
      >
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5",
            ignored && "opacity-60"
          )}
        >
          <span className="flex w-5 shrink-0 items-center justify-center">
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                itemDotClassName(item.status)
              )}
              title={t(`sources.items_filter_status_${item.status}`)}
            />
          </span>
          <span
            className={cn(
              "truncate",
              ignored && !isActive && "text-muted-foreground"
            )}
          >
            {title}
          </span>
        </span>
      </SidebarRowButton>
      <SidebarRowActions>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("sidebar.tree_source_item_more_aria")}
              className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              title={t("sidebar.tree_source_item_more_aria")}
              type="button"
              variant="ghost"
              {...shellSecondaryNavItemProps}
            >
              <MoreVertical aria-hidden className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={sidebarDenseMenuContentClassName}
          >
            <DropdownMenuLabel className={sidebarDenseMenuLabelClassName}>
              {t("sidebar.tree_menu_section_source_item")}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                className={sidebarDenseMenuItemClassName}
                {...shellSecondaryNavItemProps}
                onSelect={() => navigate(kbSourceItemPath(item.id))}
              >
                <ExternalLink
                  aria-hidden
                  className={sidebarDenseMenuIconClassName}
                />
                {t("sidebar.tree_open")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sidebarDenseMenuItemClassName}
                {...shellSecondaryNavItemProps}
                onSelect={() => onToggleIgnored(source, item)}
              >
                {ignored ? (
                  <Eye aria-hidden className={sidebarDenseMenuIconClassName} />
                ) : (
                  <EyeOff
                    aria-hidden
                    className={sidebarDenseMenuIconClassName}
                  />
                )}
                {ignored ? t("sources.activate") : t("sources.ignore")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sidebarDenseMenuItemClassName}
                disabled={isSourceRunning(source)}
                {...shellSecondaryNavItemProps}
                onSelect={() => onReindex(source, item)}
              >
                <RefreshCw
                  aria-hidden
                  className={sidebarDenseMenuIconClassName}
                />
                {t("sources.reindex_item")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-0.5" />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className={cn(
                  sidebarDenseMenuItemClassName,
                  "text-destructive focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
                )}
                {...shellSecondaryNavItemProps}
                onSelect={() => onRequestDelete(source, item)}
              >
                <Trash2 aria-hidden className={sidebarDenseMenuIconClassName} />
                {t("sources.delete")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarRowActions>
    </SidebarRow>
  );
}

interface SourceItemsBranchProps {
  activeItemId: string | null;
  onReindex: (source: KbSource, item: KbSourceItem) => void;
  onRequestDelete: (source: KbSource, item: KbSourceItem) => void;
  onToggleIgnored: (source: KbSource, item: KbSourceItem) => void;
  source: KbSource;
}

function KbSidebarSourceItemsBranch(props: SourceItemsBranchProps) {
  const { activeItemId, onReindex, onRequestDelete, onToggleIgnored, source } =
    props;
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const running = isSourceRunning(source);
  const { data, isLoading } = useQuery({
    ...kbSourceItemsQueryOptions({
      page: 1,
      page_size: SOURCE_ITEMS_SIDEBAR_PAGE_SIZE,
      sourceId: source.id,
    }),
    refetchInterval: running ? RUNNING_REFETCH_MS : false,
  });

  // Hard-deleted rows are gone; strategy-deleted ones stay in the API but have
  // nothing left to open, so the tree hides them.
  const items = (data?.data ?? []).filter((item) => item.status !== "deleted");
  const total = data?.total ?? 0;

  // These render inside the section's <SidebarMenu> (a ul), so even the
  // loading/empty hints must be list items.
  if (isLoading) {
    return (
      <li className="py-1 pl-12 text-muted-foreground text-xs">
        {t("sidebar.list_loading")}
      </li>
    );
  }
  if (items.length === 0) {
    return (
      <li className="py-1 pl-12 text-muted-foreground text-xs italic">
        {t("sources.empty")}
      </li>
    );
  }
  return (
    <>
      {items.map((item) => (
        <KbSidebarSourceItemRow
          isActive={item.id === activeItemId}
          item={item}
          key={item.id}
          onReindex={onReindex}
          onRequestDelete={onRequestDelete}
          onToggleIgnored={onToggleIgnored}
          source={source}
        />
      ))}
      {total > SOURCE_ITEMS_SIDEBAR_PAGE_SIZE ? (
        <SidebarRow depth={1} indentVariant="noLeadingIcon">
          <SidebarRowButton
            className="text-muted-foreground text-xs"
            onClick={() => navigate(kbSourcePath(source.id))}
            type="button"
            {...shellSecondaryNavItemProps}
          >
            {t("sidebar.tree_more_source_items", { count: total })}
          </SidebarRowButton>
        </SidebarRow>
      ) : null}
    </>
  );
}

export function KbSidebarSourcesSection({ kbId }: { kbId: string }) {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  // Canonical, not raw: in a space this is `/s/<key>/kb/…`, and
  // the path helpers below build `/mdl/knowledge-base/…` paths.
  const pathname = canonicalModulePathname(useLocation().pathname);

  const listQuery = useMemo(
    () => ({
      kb_id: kbId,
      page: 1,
      page_size: SOURCES_SIDEBAR_PAGE_SIZE,
      sort_by: "name",
      sort_order: "asc",
    }),
    [kbId]
  );
  const listOptions = kbSourcesListQueryOptions(listQuery);
  const { data, isLoading } = useQuery({
    ...listOptions,
    // While any source ingests, poll so the animated dot and fresh items
    // appear without a manual refresh (same cadence as the detail panel).
    refetchInterval: (query) =>
      query.state.data?.data?.some(isSourceRunning)
        ? RUNNING_REFETCH_MS
        : false,
  });
  const mutations = useKbSourceMutations(listQuery);
  const sources = data?.data ?? [];

  const sourcesBase = kbSourcesPath();
  const scopedRoot = sourcesBase.slice(0, -"/sources".length);
  const activeSourceId = activeIdFromPath(pathname, sourcesBase);
  const activeItemId = activeIdFromPath(pathname, `${scopedRoot}/source-items`);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sourceDeleteTarget, setSourceDeleteTarget] = useState<KbSource | null>(
    null
  );
  const [itemDeleteTarget, setItemDeleteTarget] = useState<{
    item: KbSourceItem;
    source: KbSource;
  } | null>(null);

  // A source-item route only names the item — resolve its source so the tree
  // can reveal the right branch when landing on (or navigating to) that page.
  const { data: activeItemDetail } = useQuery({
    ...kbSourceItemDetailQueryOptions(activeItemId ?? ""),
    enabled: Boolean(activeItemId),
  });
  const activeItemSourceId = activeItemDetail?.item.source_id ?? null;

  // Reveal the branch of the source (or the active item's source) whose page
  // is open.
  useEffect(() => {
    const revealId = activeSourceId ?? activeItemSourceId;
    if (!revealId) {
      return;
    }
    setExpanded((prev) => {
      if (prev.has(revealId)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(revealId);
      return next;
    });
  }, [activeSourceId, activeItemSourceId]);

  const toggleSource = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const onRun = (source: KbSource) => {
    mutations.run.mutate(source.id, {
      onError: (err) =>
        toast.error(
          err instanceof Error ? err.message : t("sources.save_failed")
        ),
    });
  };

  const onSetStatus = (source: KbSource, status: "active" | "paused") => {
    mutations.update.mutate(
      { id: source.id, input: { enabled: status === "active", status } },
      {
        onError: (err) =>
          toast.error(
            err instanceof Error ? err.message : t("sources.save_failed")
          ),
      }
    );
  };

  const onToggleIgnored = (source: KbSource, item: KbSourceItem) => {
    mutations.updateItemStatus.mutate(
      {
        itemId: item.id,
        sourceId: source.id,
        status: item.status === "ignored" ? "active" : "ignored",
      },
      {
        onError: (err) =>
          toast.error(
            err instanceof Error ? err.message : t("sources.save_failed")
          ),
      }
    );
  };

  const onReindexItem = (source: KbSource, item: KbSourceItem) => {
    mutations.reindex.mutate(
      { selectedItemKeys: [item.adapter_item_key], sourceId: source.id },
      {
        onError: (err) =>
          toast.error(
            err instanceof Error ? err.message : t("sources.save_failed")
          ),
      }
    );
  };

  const pathOnly = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const listActive = pathOnly === sourcesBase && !activeSourceId;

  return (
    <>
      <SidebarGroup className="min-h-0 flex-1 p-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {/* Above the list, not buried in the add menu: this is the tab's
                primary action and an empty Sources tab has nothing else. */}
            <SidebarRow>
              <SidebarRowLeadingIcon icon={<Plus aria-hidden />} />
              <SidebarRowButton
                onClick={() =>
                  navigate(`${sourcesBase}${kbSourceAddSearch("wizard")}`)
                }
                type="button"
                {...shellSecondaryNavItemProps}
              >
                <span className="truncate">{t("sources.wizard_add")}</span>
              </SidebarRowButton>
            </SidebarRow>
            {isLoading ? (
              <li
                className={cn(
                  "py-1.5 text-muted-foreground text-xs",
                  sidebarSectionLabelPlAlignToRootRowIconClassName
                )}
              >
                {t("sidebar.list_loading")}
              </li>
            ) : sources.length === 0 ? (
              <li
                className={cn(
                  "py-1.5 text-muted-foreground text-xs",
                  sidebarSectionLabelPlAlignToRootRowIconClassName
                )}
              >
                {t("sidebar.empty_sources")}
              </li>
            ) : (
              <>
                {sources.map((source) => (
                  <Fragment key={source.id}>
                    <KbSidebarSourceRow
                      isActive={source.id === activeSourceId}
                      isOpen={expanded.has(source.id)}
                      onRequestDelete={setSourceDeleteTarget}
                      onRun={onRun}
                      onSetStatus={onSetStatus}
                      onToggle={toggleSource}
                      source={source}
                    />
                    {expanded.has(source.id) ? (
                      <KbSidebarSourceItemsBranch
                        activeItemId={activeItemId}
                        onReindex={onReindexItem}
                        onRequestDelete={(src, item) =>
                          setItemDeleteTarget({ item, source: src })
                        }
                        onToggleIgnored={onToggleIgnored}
                        source={source}
                      />
                    ) : null}
                  </Fragment>
                ))}
                <SidebarRow isActive={listActive}>
                  <SidebarRowButton asChild isActive={listActive} size="sm">
                    <Link
                      className="text-muted-foreground text-xs"
                      to={sourcesBase}
                      {...shellSecondaryNavItemProps}
                    >
                      {t("sidebar.view_all_sources")}
                    </Link>
                  </SidebarRowButton>
                </SidebarRow>
              </>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setSourceDeleteTarget(null);
          }
        }}
        open={sourceDeleteTarget !== null}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sources.delete_source_confirm")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {sourceDeleteTarget?.name ? (
                <span className="line-clamp-2 font-medium text-foreground">
                  {sourceDeleteTarget.name}
                </span>
              ) : null}
              <span className="block">
                {t("sources.delete_source_confirm_desc")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutations.delete.isPending}>
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutations.delete.isPending || !sourceDeleteTarget}
              onClick={() => {
                if (!sourceDeleteTarget) {
                  return;
                }
                mutations.delete.mutate(sourceDeleteTarget.id, {
                  onSuccess: () => {
                    toast.success(t("sources.deleted"));
                    setSourceDeleteTarget(null);
                  },
                  onError: (err) =>
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : t("sources.save_failed")
                    ),
                });
              }}
            >
              {t("sources.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setItemDeleteTarget(null);
          }
        }}
        open={itemDeleteTarget !== null}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sources.items_delete_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {itemDeleteTarget ? (
                <span className="line-clamp-2 font-medium text-foreground">
                  {itemDeleteTarget.item.title ||
                    itemDeleteTarget.item.source_url ||
                    itemDeleteTarget.item.adapter_item_key}
                </span>
              ) : null}
              <span className="block">
                {t("sources.items_delete_description", { count: 1 })}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutations.deleteItem.isPending}>
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mutations.deleteItem.isPending || !itemDeleteTarget}
              onClick={() => {
                if (!itemDeleteTarget) {
                  return;
                }
                mutations.deleteItem.mutate(
                  {
                    itemId: itemDeleteTarget.item.id,
                    sourceId: itemDeleteTarget.source.id,
                  },
                  {
                    onSuccess: () => {
                      toast.success(t("sources.items_deleted", { count: 1 }));
                      setItemDeleteTarget(null);
                    },
                    onError: (err) =>
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : t("sources.save_failed")
                      ),
                  }
                );
              }}
            >
              {t("sources.items_delete_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
