/**
 * The pane's own chrome, applied by the branches that ARE the pane.
 *
 * A component rather than a bare `usePageConfig` call, because whether the
 * pane owns the chrome is decided per branch: a module-contributed view brings
 * its own, and a parent writing `null` actions afterwards would quietly delete
 * them.
 *
 * What is open and what can be done to it belong HERE, in the topbar. An
 * in-content header said the file's name a second time and cost the table a
 * band of vertical space to do it; the bar was already there and already empty.
 *
 * The trailing controls are COMMON, matching the chat's artifact panel: every
 * open thing can expand to the whole window and can be closed, so those live
 * here once instead of per branch beside whatever the branch contributes.
 *
 * `actions` and `menuItems` MUST be memoized by the caller: the shell compares
 * action nodes by identity, so a fresh element every render is an infinite
 * update loop.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { spaceDataSegmentLabel } from "@engenty/plugin-sdk";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import {
  type PageBreadcrumb,
  type PageContentStackBackground,
  usePageConfig,
} from "@engenty/ui-plugin-sdk";
import { Maximize2, Minimize2, MoreVertical, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export const NO_BREADCRUMBS: PageBreadcrumb[] = [];

export function PaneChrome({
  actions,
  breadcrumbs,
  children,
  contentStackBackground = "paper",
  menuItems,
  onClose,
}: {
  actions?: ReactNode;
  breadcrumbs?: PageBreadcrumb[];
  children: ReactNode;
  contentStackBackground?: PageContentStackBackground;
  /** Extra entries for the ⋯ menu; the menu only renders when present. */
  menuItems?: ReactNode;
  onClose?: (() => void) | undefined;
}) {
  const { t } = useTranslation("common");
  const [expanded, setExpanded] = useState(false);

  const expandLabel = t("actions.expand", { defaultValue: "Expand" });
  const collapseLabel = t("actions.collapse", { defaultValue: "Collapse" });
  const closeLabel = t("actions.close", { defaultValue: "Close" });
  const moreLabel = t("actions.more", { defaultValue: "More" });

  const composite = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {actions}
        <div className="ml-1 flex items-center gap-0.5 border-l pl-2">
          <Button
            aria-label={expandLabel}
            onClick={() => setExpanded(true)}
            size="icon-sm"
            variant="ghost"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          {menuItems ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label={moreLabel} size="icon-sm" variant="ghost">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">{menuItems}</DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {onClose ? (
            <Button
              aria-label={closeLabel}
              onClick={onClose}
              size="icon-sm"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
    ),
    [actions, closeLabel, expandLabel, menuItems, moreLabel, onClose]
  );

  usePageConfig({
    actions: composite,
    breadcrumbs: breadcrumbs ?? NO_BREADCRUMBS,
    contentStackBackground,
  });

  // The overlay covers the topbar, so Escape must work without it.
  useEffect(() => {
    if (!expanded) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  // Expanded renders through a PORTAL: the content column is its own stacking
  // context (`relative z-0` in the shell), so a fixed overlay inside it paints
  // UNDER the shell's fixed sidebar no matter its z-index. Body-level, it only
  // has to clear the shell's layout layers (≤ z-50) and stay under the guide
  // overlays (z-180+). The children remount on toggle — draft VALUES live in
  // the branch components above this one, so an edit in progress survives;
  // only transient view state (a grid's selection) resets.
  if (expanded) {
    return createPortal(
      <div
        className={cn(
          "fixed inset-0 z-[120] flex flex-col",
          contentStackBackground === "paper" ? "bg-paper" : "bg-card"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <span className="min-w-0 truncate text-sm">
            {(breadcrumbs ?? [])
              .map((crumb) => crumb.label)
              .filter((label) => typeof label === "string")
              .join(" / ")}
          </span>
          <div className="flex items-center gap-2">
            {actions}
            <div className="ml-1 flex items-center gap-0.5 border-l pl-2">
              <Button
                aria-label={collapseLabel}
                onClick={() => setExpanded(false)}
                size="icon-sm"
                variant="ghost"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              {menuItems ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={moreLabel}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {menuItems}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {onClose ? (
                <Button
                  aria-label={closeLabel}
                  onClick={() => {
                    setExpanded(false);
                    onClose();
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        {children}
      </div>,
      document.body
    );
  }

  return <div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>;
}

/**
 * A node's path as topbar breadcrumbs — `Contacts / contacts.csv`.
 *
 * Labels, not links: a data path addresses a node in the tree, not a route, and
 * a breadcrumb that navigates nowhere is better than one that 404s.
 */
export function useNodeBreadcrumbs(path: string): PageBreadcrumb[] {
  return useMemo(
    () =>
      path
        .split("/")
        .filter(Boolean)
        // Without the id: a segment carries one so the path resolves without a
        // scan, and a breadcrumb reading
        // `kuesten-wissen-2__019fea6b-141a-756b-847d-93c3f7dd5a2d` spends the
        // whole bar on the half nobody reads.
        .map((segment) => ({ label: spaceDataSegmentLabel(segment) })),
    [path]
  );
}
