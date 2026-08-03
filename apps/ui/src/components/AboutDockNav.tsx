import { cn } from "@engenty/ui-core";
import { useEffect, useRef, useState } from "react";

/** Beyond this index distance from the dock center, entries collapse to a stroke. */
const STROKE_DISTANCE = 10;

export interface AboutDockNavItem {
  key: string;
  label: string;
}

interface AboutDockNavProps {
  activeKey: string | null;
  items: AboutDockNavItem[];
  label: string;
  onSelect: (key: string) => void;
  /**
   * `dock` — Apple-style scale + stroke falloff (Changelog).
   * `plain` — fixed size; active/hover only get bolder weight (Credits).
   */
  variant?: "dock" | "plain";
}

/** Matches sticky section headlines in Changelog (`font-semibold text-base`). */
const ACTIVE_CLASS = "py-1 font-semibold text-base text-foreground";
/** Same size as active on hover, without the headline weight. */
const HOVER_CLASS = "py-1 font-normal text-base text-foreground";

/** Distance → size steps away from the dock center (active, or hover when set). */
const DISTANCE_CLASS: Record<number, string> = {
  1: "py-0.5 font-medium text-sm text-foreground",
  2: "py-0.5 text-[13px] leading-tight text-foreground/90",
  3: "py-0.5 text-xs leading-tight text-foreground/80",
  4: "py-px text-[11px] leading-tight text-muted-foreground",
  5: "py-px text-[11px] leading-none text-muted-foreground/90",
  6: "py-px text-[10px] leading-none text-muted-foreground/85",
  7: "py-px text-[10px] leading-none text-muted-foreground/75",
  8: "py-px text-[9px] leading-none text-muted-foreground/65",
  9: "py-px text-[9px] leading-none text-muted-foreground/55",
};

function dockItemClass({
  active,
  distance,
  hovered,
}: {
  active: boolean;
  distance: number;
  hovered: boolean;
}): string {
  if (distance >= STROKE_DISTANCE) {
    // Keep the smallest dock font-size while collapsed to a stroke so the
    // stroke→label transition does not animate from the inherited base size.
    return "h-3.5 py-0 text-[9px] leading-none";
  }
  if (active && distance === 0) {
    return ACTIVE_CLASS;
  }
  if (hovered && distance === 0) {
    return HOVER_CLASS;
  }
  const step = DISTANCE_CLASS[distance] ?? DISTANCE_CLASS[9];
  // Keep the current section readable when it sits in the hover falloff band.
  if (active) {
    return cn(step, "font-semibold text-foreground");
  }
  return step;
}

function plainItemClass({
  active,
  hovered,
}: {
  active: boolean;
  hovered: boolean;
}): string {
  return cn(
    "py-1 text-sm",
    active
      ? "font-semibold text-foreground"
      : hovered
        ? "font-medium text-foreground"
        : "font-normal text-muted-foreground"
  );
}

function isTypingTarget(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) {
    return false;
  }
  if (el.isContentEditable) {
    return true;
  }
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function AboutDockNav({
  activeKey,
  items,
  label,
  onSelect,
  variant = "dock",
}: AboutDockNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const ignoreFocusSelectRef = useRef(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const activeIndex = items.findIndex((item) => item.key === activeKey);
  const hoveredIndex = items.findIndex((item) => item.key === hoveredKey);
  // Pointer hover only — keyboard/tab focus must not pin the dock center.
  const centerIndex = hoveredIndex >= 0 ? hoveredIndex : activeIndex;
  const plain = variant === "plain";

  // Keep tab focus + scrollspy active item aligned when arrows / scroll change activeKey.
  useEffect(() => {
    if (!activeKey) {
      return;
    }
    const el = navRef.current?.querySelector<HTMLButtonElement>(
      `[data-nav-key="${activeKey.replaceAll('"', '\\"')}"]`
    );
    if (!el) {
      return;
    }

    el.scrollIntoView({ block: "nearest", behavior: "smooth" });

    if (isTypingTarget(document.activeElement)) {
      return;
    }
    if (document.activeElement === el) {
      return;
    }

    ignoreFocusSelectRef.current = true;
    el.focus({ preventScroll: true });
    queueMicrotask(() => {
      ignoreFocusSelectRef.current = false;
    });
  }, [activeKey]);

  return (
    <nav
      aria-label={label}
      className={cn(
        "hidden shrink-0 overflow-y-auto overscroll-contain border-border border-r py-3 sm:block",
        plain ? "w-36" : "w-40"
      )}
      onMouseLeave={() => setHoveredKey(null)}
      ref={navRef}
    >
      <ul className="flex flex-col items-stretch px-2">
        {items.map((item, index) => {
          const distance =
            centerIndex < 0 ? STROKE_DISTANCE : Math.abs(index - centerIndex);
          const active = item.key === activeKey;
          const hovered = item.key === hoveredKey;
          const asStroke = !plain && distance >= STROKE_DISTANCE;

          return (
            <li className="leading-none" key={item.key}>
              <button
                aria-current={active ? "true" : undefined}
                aria-label={item.label}
                className={cn(
                  "flex w-full items-center justify-start rounded-sm px-1.5",
                  plain
                    ? "transition-colors duration-150"
                    : "transition-[font-size,font-weight,color,padding,opacity,height] duration-150",
                  plain
                    ? plainItemClass({ active, hovered })
                    : dockItemClass({ active, distance, hovered })
                )}
                data-nav-key={item.key}
                onClick={() => onSelect(item.key)}
                onFocus={() => {
                  // Tab into a row → sync the content section. Skip when we
                  // moved focus ourselves after an arrow / scrollspy update.
                  if (ignoreFocusSelectRef.current) {
                    return;
                  }
                  onSelect(item.key);
                }}
                onMouseEnter={() => setHoveredKey(item.key)}
                type="button"
              >
                {asStroke ? (
                  <span
                    aria-hidden
                    className="h-[3px] w-4 rounded-[1px] bg-muted-foreground/40"
                  />
                ) : (
                  <span className="truncate">{item.label}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
