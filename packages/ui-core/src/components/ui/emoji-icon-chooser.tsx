"use client";

import { Smile } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  EMOJI_ICON_PRESETS,
  isSingleEmoji,
  normalizeEmojiInput,
} from "../../lib/emoji-icon.js";
import { focusVisibleRingSubtle } from "../../lib/focus-visible.js";
import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "./emoji-picker.js";
import { Input } from "./input.js";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.js";

const GRID_COLUMNS = 5;

export type EmojiIconChooserLabels = {
  addIcon?: string;
  apply?: string;
  browseAll?: string;
  gridAriaLabel?: string;
  inputPlaceholder?: string;
  noEmojiFound?: string;
  quickPicks?: string;
  remove?: string;
  selectEmoji?: string;
};

const DEFAULT_LABELS: Required<EmojiIconChooserLabels> = {
  addIcon: "Add icon",
  apply: "Apply",
  browseAll: "Browse all",
  gridAriaLabel: "Choose an emoji",
  inputPlaceholder: "Paste or type an emoji",
  noEmojiFound: "No emoji found.",
  quickPicks: "Quick picks",
  remove: "Remove icon",
  selectEmoji: "Select an emoji…",
};

function resolveLabels(labels?: EmojiIconChooserLabels) {
  return { ...DEFAULT_LABELS, ...labels };
}

export interface EmojiIconChooserContentProps {
  className?: string;
  labels?: EmojiIconChooserLabels;
  locale?: "de" | "en" | "en-gb";
  onApply: (emoji: string) => void;
  onClose?: () => void;
  onRemove?: () => void;
  presets?: readonly string[];
  showRemove?: boolean;
  value?: string | null;
}

export function EmojiIconChooserContent({
  value = null,
  onApply,
  onRemove,
  onClose,
  labels,
  locale = "en",
  presets = EMOJI_ICON_PRESETS,
  showRemove = true,
  className,
}: EmojiIconChooserContentProps) {
  const resolvedLabels = resolveLabels(labels);
  const inputId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(value ?? "");
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const applyDraft = useCallback(() => {
    const normalized = normalizeEmojiInput(draft);
    if (!normalized) {
      return;
    }
    onApply(normalized);
    onClose?.();
  }, [draft, onApply, onClose]);

  const selectPreset = useCallback(
    (emoji: string) => {
      onApply(emoji);
      onClose?.();
    },
    [onApply, onClose]
  );

  const focusGridButton = useCallback((index: number) => {
    const buttons = gridRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-emoji-grid-item]"
    );
    buttons?.[index]?.focus();
    setFocusedIndex(index);
  }, []);

  const handleGridKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const count = presets.length;
      if (count === 0) {
        return;
      }

      const current =
        focusedIndex ??
        [...(gridRef.current?.querySelectorAll("[data-emoji-grid-item]") ?? [])].findIndex(
          (node) => node === document.activeElement
        );

      const safeCurrent = current >= 0 ? current : 0;

      const moveFocus = (nextIndex: number) => {
        event.preventDefault();
        focusGridButton(nextIndex);
      };

      switch (event.key) {
        case "ArrowRight":
          moveFocus(Math.min(safeCurrent + 1, count - 1));
          break;
        case "ArrowLeft":
          moveFocus(Math.max(safeCurrent - 1, 0));
          break;
        case "ArrowDown":
          moveFocus(Math.min(safeCurrent + GRID_COLUMNS, count - 1));
          break;
        case "ArrowUp":
          moveFocus(Math.max(safeCurrent - GRID_COLUMNS, 0));
          break;
        case "Home":
          moveFocus(0);
          break;
        case "End":
          moveFocus(count - 1);
          break;
        default:
          break;
      }
    },
    [focusGridButton, focusedIndex, presets.length]
  );

  const draftIsValid = isSingleEmoji(draft);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Tabs defaultValue="quick">
        <TabsList className="grid w-full grid-cols-2" variant="segmented">
          <TabsTrigger value="quick">{resolvedLabels.quickPicks}</TabsTrigger>
          <TabsTrigger value="browse">{resolvedLabels.browseAll}</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-3 space-y-3" value="quick">
          <div
            aria-label={resolvedLabels.gridAriaLabel}
            className="grid grid-cols-5 gap-1"
            onKeyDown={handleGridKeyDown}
            ref={gridRef}
            role="listbox"
          >
            {presets.map((emoji, index) => {
              const selected = value === emoji;
              return (
                <button
                  aria-label={emoji}
                  aria-selected={selected}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md text-xl outline-none",
                    focusVisibleRingSubtle,
                    selected ? "bg-muted" : "hover:bg-muted"
                  )}
                  data-emoji-grid-item
                  key={emoji}
                  onClick={() => selectPreset(emoji)}
                  onFocus={() => setFocusedIndex(index)}
                  role="option"
                  type="button"
                >
                  {emoji}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <Input
              aria-label={resolvedLabels.inputPlaceholder}
              className="h-8 flex-1 text-base"
              id={inputId}
              maxLength={32}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyDraft();
                }
              }}
              placeholder={resolvedLabels.inputPlaceholder}
              value={draft}
            />
            <Button
              className="shrink-0"
              disabled={!draftIsValid}
              onClick={applyDraft}
              size="sm"
              type="button"
              variant="default"
            >
              {resolvedLabels.apply}
            </Button>
          </div>
        </TabsContent>

        <TabsContent className="mt-3" value="browse">
          <EmojiPicker
            className="h-[280px] w-full rounded-md border border-border"
            columns={8}
            locale={locale}
            onEmojiSelect={({ emoji }) => {
              onApply(emoji);
              onClose?.();
            }}
          >
            <EmojiPickerSearch
              aria-label={resolvedLabels.inputPlaceholder}
              placeholder={resolvedLabels.inputPlaceholder}
            />
            <EmojiPickerContent
              className="h-[200px]"
              labels={{ empty: resolvedLabels.noEmojiFound }}
            />
            <EmojiPickerFooter
              labels={{ selectEmoji: resolvedLabels.selectEmoji }}
            />
          </EmojiPicker>
        </TabsContent>
      </Tabs>

      {showRemove && value && onRemove ? (
        <Button
          className="w-full text-muted-foreground"
          onClick={() => {
            onRemove();
            onClose?.();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {resolvedLabels.remove}
        </Button>
      ) : null}
    </div>
  );
}

export interface EmojiIconChooserProps
  extends Omit<EmojiIconChooserContentProps, "onApply" | "onClose"> {
  align?: "center" | "end" | "start";
  disabled?: boolean;
  onChange: (emoji: string | null) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  popoverContentClassName?: string;
  side?: "bottom" | "left" | "right" | "top";
  trigger?: ReactNode;
  triggerClassName?: string;
}

/** Popover emoji icon picker — quick presets, full browse, custom input, and optional remove. */
export function EmojiIconChooser({
  value,
  onChange,
  open: openProp,
  onOpenChange,
  disabled = false,
  trigger,
  triggerClassName,
  popoverContentClassName,
  align = "start",
  side = "bottom",
  labels,
  locale,
  presets,
  showRemove,
  className,
}: EmojiIconChooserProps) {
  const resolvedLabels = resolveLabels(labels);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const defaultTrigger = value ? (
    <Button
      aria-label={resolvedLabels.addIcon}
      className={cn(
        "size-auto min-h-0 border-0 bg-transparent p-0 text-5xl leading-none shadow-none hover:bg-transparent",
        triggerClassName
      )}
      disabled={disabled}
      type="button"
      variant="ghost"
    >
      {value}
    </Button>
  ) : (
    <Button
      className={cn(
        "h-7 gap-1.5 px-2.5 text-xs text-muted-foreground/60 hover:text-muted-foreground",
        triggerClassName
      )}
      disabled={disabled}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Smile aria-hidden className="size-3.5" />
      {resolvedLabels.addIcon}
    </Button>
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>{trigger ?? defaultTrigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn("w-80 p-3", popoverContentClassName)}
        collisionPadding={12}
        side={side}
        sideOffset={4}
      >
        <EmojiIconChooserContent
          className={className}
          labels={labels}
          locale={locale}
          onApply={(emoji) => onChange(emoji)}
          onClose={() => setOpen(false)}
          onRemove={showRemove === false ? undefined : () => onChange(null)}
          presets={presets}
          showRemove={showRemove}
          value={value}
        />
      </PopoverContent>
    </Popover>
  );
}
