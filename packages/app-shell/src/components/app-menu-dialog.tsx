"use client";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
  cn,
  Dialog,
  DialogContent,
} from "@engenty/ui-core";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  APP_MENU_LABELS,
  type AppMenuLabels,
  type AppMenuSpaceTab,
  appMenuTabStep,
  caretFromKeyTarget,
} from "../lib/app-menu-tabs";
import type { NavigationSection } from "../types/shell";
import { AppMenuAll } from "./app-menu-all";
import type { AppMenuActions } from "./app-topbar";

export interface AppMenuContent {
  labels?: Partial<AppMenuLabels>;
  onAbout?: () => void;
  renderSpace?: (
    space: AppMenuSpaceTab,
    navigate: (to: string) => void
  ) => ReactNode;
  spaces?: readonly AppMenuSpaceTab[];
}

export function AppMenuDialog({
  actions,
  content,
  isSidebarHidden,
  onOpenChange,
  onToggleSidebarHidden,
  open,
  sections,
}: {
  actions?: AppMenuActions;
  content?: AppMenuContent;
  isSidebarHidden?: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleSidebarHidden?: () => void;
  open: boolean;
  sections: NavigationSection[];
}) {
  const navigate = useNavigate();
  const labels = { ...APP_MENU_LABELS, ...content?.labels };
  const spaces = content?.spaces ?? [];
  const tabCount = 1 + spaces.length;
  const [tabIndex, setTabIndex] = useState(0);
  const activeIndex = Math.min(tabIndex, tabCount - 1);
  const activeSpace =
    activeIndex === 0 ? null : (spaces[activeIndex - 1] ?? null);

  useLayoutEffect(() => {
    if (open) {
      setTabIndex(0);
    }
  }, [open]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const go = useCallback(
    (to: string, external?: boolean) => {
      close();
      if (external || to.startsWith("http://") || to.startsWith("https://")) {
        window.open(to, "_blank", "noopener,noreferrer");
        return;
      }
      navigate(to);
    },
    [close, navigate]
  );

  const stepTab = useCallback(
    (step: -1 | 1) => {
      setTabIndex((current) => {
        const index = Math.min(current, tabCount - 1);
        return (index + step + tabCount) % tabCount;
      });
    },
    [tabCount]
  );

  useEffect(() => {
    if (!open || tabCount < 2) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const step = appMenuTabStep(event.key, caretFromKeyTarget(event.target));
      if (step == null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      stepTab(step);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, stepTab, tabCount]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={false}
      >
        <Command
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]]:px-3 [&_[cmdk-input-wrapper]]:py-2"
          key={activeSpace?.id ?? "all"}
        >
          <CommandInput autoFocus placeholder={labels.search} />
          <div
            aria-label={labels.all}
            className="flex gap-1 overflow-x-auto border-b px-2 py-2"
            role="tablist"
          >
            <TabButton
              onSelect={() => setTabIndex(0)}
              selected={activeIndex === 0}
            >
              {labels.all}
            </TabButton>
            {spaces.map((space, index) => (
              <TabButton
                key={space.id}
                onSelect={() => setTabIndex(index + 1)}
                selected={activeIndex === index + 1}
              >
                {space.color ? (
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: space.color }}
                  />
                ) : null}
                <span className="max-w-32 truncate">{space.name}</span>
              </TabButton>
            ))}
          </div>
          <CommandList className="h-[min(60vh,440px)] max-h-[min(60vh,440px)]">
            <CommandEmpty>{labels.empty}</CommandEmpty>
            {activeSpace ? (
              content?.renderSpace?.(activeSpace, go)
            ) : (
              <AppMenuAll
                actions={actions}
                isSidebarHidden={isSidebarHidden}
                labels={labels}
                onAbout={content?.onAbout}
                onClose={close}
                onNavigate={go}
                onToggleSidebarHidden={onToggleSidebarHidden}
                sections={sections}
              />
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  children,
  onSelect,
  selected,
}: {
  children: ReactNode;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-selected={selected}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs",
        selected
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={onSelect}
      onMouseDown={(event) => event.preventDefault()}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}
