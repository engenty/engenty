// A picker as a carousel: the item in the middle is the chosen one — framed
// and magnified — and its neighbours shrink and fade toward the edges like a
// dock. The arrows (or ←/→, or a click on a neighbour) move the next one into
// the middle. It wraps around. The copilot's face and the space's icon use it.

import { cn } from "@engenty/ui-core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

/** Horizontal place, scale and opacity by distance from the middle. */
const SLOTS = [
  { opacity: 1, scale: 1, x: 0 },
  { opacity: 0.8, scale: 0.46, x: 94 },
  { opacity: 0.35, scale: 0.3, x: 150 },
] as const;

/** The frame that marks the middle as the chosen one. */
const FRAME = 128;

export function SetupCarousel<Item extends string>({
  disabled,
  framed = true,
  items,
  label,
  onChange,
  render,
  value,
  valueText,
}: {
  disabled?: boolean;
  /** The card behind the middle item; off when the item is a card itself. */
  framed?: boolean;
  items: readonly Item[];
  label: string;
  onChange: (item: Item) => void;
  /** Draws an item at full size (about 104px); `chosen` is the middle one. */
  render: (item: Item, chosen: boolean) => ReactNode;
  value: Item;
  /** What a screen reader says for the chosen item. */
  valueText?: (item: Item) => string;
}) {
  const count = items.length;
  const index = Math.max(0, items.indexOf(value));
  const step = (by: number) => {
    const next = items[(index + by + count) % count];
    if (next !== undefined) {
      onChange(next);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    }
  };

  const arrow =
    "z-10 flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-ink-2 ring-1 ring-ink/10 transition-colors hover:text-ink hover:ring-ink/25 disabled:opacity-50";

  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="←"
        className={arrow}
        disabled={disabled}
        onClick={() => step(-1)}
        type="button"
      >
        <ChevronLeft className="size-4" />
      </button>
      <div
        aria-label={label}
        aria-valuemax={count}
        aria-valuemin={1}
        aria-valuenow={index + 1}
        aria-valuetext={valueText ? valueText(value) : value}
        className={cn(
          "group relative h-[148px] flex-1 overflow-hidden rounded-[14px] outline-none",
          !framed && "focus-visible:ring-2 focus-visible:ring-primary"
        )}
        onKeyDown={onKeyDown}
        role="slider"
        tabIndex={0}
      >
        {framed ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[28px] bg-card shadow-[0_10px_30px_-12px_oklch(0%_0_0/0.25)] ring-2 ring-primary transition-shadow group-focus-visible:ring-4"
            style={{ height: FRAME, width: FRAME }}
          />
        ) : null}
        {items.map((item, i) => {
          // Signed distance from the middle on the shortest way round.
          let offset = (i - index + count) % count;
          if (offset > count / 2) {
            offset -= count;
          }
          const slot = SLOTS[Math.abs(offset)];
          const shown = slot !== undefined;
          const x = shown
            ? Math.sign(offset) * slot.x
            : Math.sign(offset) * 220;
          return (
            <button
              aria-hidden={!shown}
              className={cn(
                "absolute top-1/2 left-1/2 transition-[transform,opacity] duration-300 ease-out",
                offset === 0 ? "cursor-default" : "cursor-pointer"
              )}
              disabled={disabled || !shown}
              key={item}
              onClick={() => offset !== 0 && step(offset)}
              style={{
                opacity: shown ? slot.opacity : 0,
                transform: `translate(calc(-50% + ${x}px), -50%) scale(${shown ? slot.scale : 0.3})`,
                zIndex: 10 - Math.abs(offset),
              }}
              tabIndex={-1}
              type="button"
            >
              {render(item, offset === 0)}
            </button>
          );
        })}
      </div>
      <button
        aria-label="→"
        className={arrow}
        disabled={disabled}
        onClick={() => step(1)}
        type="button"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
