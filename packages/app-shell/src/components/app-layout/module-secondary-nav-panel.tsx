import { cn, Separator, sidebarColumnGutterClassName } from "@engenty/ui-core";
import { usePageHeader } from "@engenty/ui-plugin-sdk";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useRef,
} from "react";
import { Link } from "react-router-dom";
import {
  focusShellSecondaryNavNeighbor,
  shellSecondaryNavItemProps,
} from "../../lib/module-secondary-nav-keyboard";
import { matchesPath } from "../../lib/navigation";
import type { SecondaryNavLinkItem } from "./types";

export function ModuleSecondaryNavPanel(props: {
  onNavigate?: () => void;
  pathname: string;
  search: string;
  secondaryItems: SecondaryNavLinkItem[];
}) {
  const { onNavigate, pathname, search, secondaryItems } = props;
  const { secondaryNavAfterItems, secondaryNavSearchResultsOnly } =
    usePageHeader();
  const hideContactsExtras = secondaryNavSearchResultsOnly;
  const panelRef = useRef<HTMLDivElement>(null);
  const onSecondaryNavKeyDownCapture = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") {
        return;
      }
      const root = panelRef.current;
      if (!root?.contains(e.target as Node)) {
        return;
      }
      const moved = focusShellSecondaryNavNeighbor(
        root,
        e.key === "ArrowDown" ? "down" : "up"
      );
      if (moved) {
        e.preventDefault();
      }
    },
    []
  );

  const showShellItems = !hideContactsExtras && secondaryItems.length > 0;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 pt-3 pb-3 outline-none",
        sidebarColumnGutterClassName
      )}
      onKeyDownCapture={onSecondaryNavKeyDownCapture}
      ref={panelRef}
    >
      {showShellItems ? (
        <div className="shrink-0 space-y-1">
          {secondaryItems.map((item, idx) => {
            if (item.type === "separator") {
              return (
                <Separator
                  className="mx-3 my-2 bg-border/40"
                  key={`sep-${idx}`}
                />
              );
            }

            if (item.type === "heading") {
              return (
                <div
                  className="px-3 pt-3 pb-1 font-medium text-[11px] text-muted-foreground/80 uppercase tracking-wide"
                  key={`heading-${item.label}-${idx}`}
                >
                  {item.label}
                </div>
              );
            }

            const active = matchesPath(pathname, search, item.to);
            const isExternal =
              Boolean(item.external) || item.to.startsWith("http");
            const Icon = item.icon;

            const itemClass = cn(
              "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
            );

            const content = (
              <>
                {Icon && <Icon className="size-3.5 shrink-0" />}
                <span className="truncate">{item.label}</span>
              </>
            );

            if (isExternal) {
              return (
                <a
                  className={itemClass}
                  href={item.to}
                  key={item.to}
                  onClick={onNavigate}
                  {...shellSecondaryNavItemProps}
                >
                  {content}
                </a>
              );
            }
            return (
              <Link
                className={itemClass}
                key={item.to}
                onClick={onNavigate}
                to={item.to}
                {...shellSecondaryNavItemProps}
              >
                {content}
              </Link>
            );
          })}
        </div>
      ) : null}
      {secondaryNavAfterItems ? (
        <div
          className="flex min-h-0 flex-1 flex-col"
          onClickCapture={(e) => {
            if (!onNavigate) {
              return;
            }
            const link = (e.target as HTMLElement).closest("a[href]");
            if (link) {
              onNavigate();
            }
          }}
        >
          {secondaryNavAfterItems}
        </div>
      ) : null}
    </div>
  );
}
