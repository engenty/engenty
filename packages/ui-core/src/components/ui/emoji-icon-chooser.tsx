"use client";

import { Smile } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { EMOJI_ICON_PRESETS } from "../../lib/emoji-icon.js";
import { focusVisibleRingSubtle } from "../../lib/focus-visible.js";
import { cn } from "../../lib/utils.js";
import { Button } from "./button.js";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "./emoji-picker.js";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";

const PICKER_COLUMNS = 8;

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
  quickPicks: "Recommended",
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
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  const selectEmoji = useCallback(
    (emoji: string) => {
      onApply(emoji);
      onClose?.();
    },
    [onApply, onClose]
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <EmojiPicker
        className="h-90 w-full rounded-md border border-border"
        columns={PICKER_COLUMNS}
        locale={locale}
        onEmojiSelect={({ emoji }) => selectEmoji(emoji)}
      >
        <EmojiPickerSearch
          aria-label={resolvedLabels.inputPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={resolvedLabels.inputPlaceholder}
        />
        {searching || presets.length === 0 ? null : (
          <div className="shrink-0 border-border border-b">
            <div className="bg-popover px-3 pt-3.5 pb-2 text-muted-foreground text-xs leading-none">
              {resolvedLabels.quickPicks}
            </div>
            <div
              aria-label={resolvedLabels.gridAriaLabel}
              className="grid grid-cols-8 px-1 pb-1"
              role="listbox"
            >
              {presets.map((emoji) => {
                const selected = value === emoji;
                return (
                  <button
                    aria-label={emoji}
                    aria-selected={selected}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-sm text-base outline-none",
                      focusVisibleRingSubtle,
                      selected ? "bg-accent" : "hover:bg-accent"
                    )}
                    key={emoji}
                    onClick={() => selectEmoji(emoji)}
                    role="option"
                    type="button"
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <EmojiPickerContent
          className="min-h-0"
          labels={{ empty: resolvedLabels.noEmojiFound }}
        />
        <EmojiPickerFooter
          labels={{ selectEmoji: resolvedLabels.selectEmoji }}
        />
      </EmojiPicker>

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

/** Popover emoji icon picker — recommended section, then the full list. */
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
          key={open ? "open" : "closed"}
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
