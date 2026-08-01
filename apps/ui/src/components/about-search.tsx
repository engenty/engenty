import { cn } from "@engenty/ui-core";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countTextMatches(text: string, query: string): number {
  const trimmed = query.trim();
  if (!(trimmed && text)) {
    return 0;
  }
  const matches = text.match(new RegExp(escapeRegExp(trimmed), "gi"));
  return matches?.length ?? 0;
}

/** Mutable counter so multiple HighlightSearchText nodes share one match index space. */
export interface SearchMatchCounter {
  current: number;
}

interface HighlightSearchTextProps {
  activeMatchIndex: number;
  matchCounter: SearchMatchCounter;
  query: string;
  text: string;
}

export function HighlightSearchText({
  text,
  query,
  matchCounter,
  activeMatchIndex,
}: HighlightSearchTextProps) {
  const trimmed = query.trim();
  if (!trimmed) {
    return text;
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, "gi"));
  return (
    <>
      {parts.map((part, index) => {
        if (part.toLowerCase() !== trimmed.toLowerCase()) {
          return <span key={`t-${index}`}>{part}</span>;
        }
        const matchIndex = matchCounter.current;
        matchCounter.current += 1;
        const active = matchIndex === activeMatchIndex;
        return (
          <mark
            className={cn(
              "rounded-sm px-0.5 text-foreground",
              active
                ? "bg-primary/35 ring-1 ring-primary/50"
                : "bg-amber-200/90 dark:bg-amber-500/35"
            )}
            data-search-hit={matchIndex}
            key={`m-${matchIndex}`}
          >
            {part}
          </mark>
        );
      })}
    </>
  );
}

interface AboutDialogSearchProps {
  activeMatchIndex: number;
  inputRef?: RefObject<HTMLInputElement | null>;
  matchCount: number;
  onNext: () => void;
  onPrev: () => void;
  onQueryChange: (query: string) => void;
  placeholder: string;
  query: string;
}

export function AboutDialogSearch({
  query,
  onQueryChange,
  matchCount,
  activeMatchIndex,
  onPrev,
  onNext,
  placeholder,
  inputRef: inputRefProp,
}: AboutDialogSearchProps) {
  const localInputRef = useRef<HTMLInputElement>(null);
  const inputRef = inputRefProp ?? localInputRef;
  const [focused, setFocused] = useState(false);
  const hasQuery = query.trim().length > 0;
  const expanded = focused || hasQuery;
  const positionLabel =
    matchCount > 0 ? `${activeMatchIndex + 1}/${matchCount}` : "0/0";

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      onQueryChange("");
      inputRef.current?.blur();
    }
  };

  return (
    <div
      className={cn(
        "flex h-7 items-center gap-0.5 rounded-full bg-muted/70 px-2 shadow-none ring-1 ring-border/50 transition-[width,background-color] duration-150 dark:bg-muted/40",
        hasQuery ? "w-[16.5rem]" : expanded ? "w-40" : "w-[8.5rem]",
        focused && "bg-muted ring-border"
      )}
    >
      <Search aria-hidden className="size-3 shrink-0 text-muted-foreground" />
      <input
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
        onBlur={() => setFocused(false)}
        onChange={(event) => onQueryChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        type="search"
        value={query}
      />
      {hasQuery ? (
        <>
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {positionLabel}
          </span>
          <button
            aria-label="Previous match"
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:opacity-40"
            disabled={matchCount === 0}
            onClick={onPrev}
            type="button"
          >
            <ChevronUp className="size-3" />
          </button>
          <button
            aria-label="Next match"
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:opacity-40"
            disabled={matchCount === 0}
            onClick={onNext}
            type="button"
          >
            <ChevronDown className="size-3" />
          </button>
          <button
            aria-label="Clear"
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground"
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
            type="button"
          >
            <X className="size-3" />
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Scroll the active `[data-search-hit]` into the content scroller. */
export function useScrollActiveSearchHit(
  contentRef: { current: HTMLElement | null },
  activeMatchIndex: number,
  query: string,
  matchCount: number
): void {
  useLayoutEffect(() => {
    if (!query.trim() || matchCount === 0) {
      return;
    }
    const root = contentRef.current;
    if (!root) {
      return;
    }
    const hit = root.querySelector<HTMLElement>(
      `[data-search-hit="${activeMatchIndex}"]`
    );
    if (!hit) {
      return;
    }
    const top =
      root.scrollTop +
      (hit.getBoundingClientRect().top - root.getBoundingClientRect().top) -
      root.clientHeight / 3;
    root.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [activeMatchIndex, query, matchCount, contentRef]);
}

export function stepMatchIndex(
  current: number,
  matchCount: number,
  delta: 1 | -1
): number {
  if (matchCount <= 0) {
    return 0;
  }
  return (current + delta + matchCount) % matchCount;
}

export function createMatchCounter(): SearchMatchCounter {
  return { current: 0 };
}

/** Helper for typed empty fragment when search filters everything out. */
export function SearchEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="px-6 py-8 text-center text-muted-foreground text-sm">
      {children}
    </p>
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * ⌘/Ctrl+F focuses search; ↑/← and ↓/→ step through scrollspy sections
 * (ignored while typing in the search field or other inputs).
 */
export function useAboutDialogHotkeys({
  open,
  searchInputRef,
  navKeys,
  activeKey,
  onNavigate,
}: {
  activeKey: string | null;
  navKeys: string[];
  onNavigate: (key: string) => void;
  open: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
}): void {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        event.stopPropagation();
        const input = searchInputRef.current;
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const isPrev = event.key === "ArrowUp" || event.key === "ArrowLeft";
      const isNext = event.key === "ArrowDown" || event.key === "ArrowRight";
      if (!(isPrev || isNext) || navKeys.length === 0) {
        return;
      }

      event.preventDefault();
      const currentIndex = Math.max(0, navKeys.indexOf(activeKey ?? ""));
      const nextIndex = isPrev
        ? (currentIndex - 1 + navKeys.length) % navKeys.length
        : (currentIndex + 1) % navKeys.length;
      const nextKey = navKeys[nextIndex];
      if (nextKey) {
        onNavigate(nextKey);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, searchInputRef, navKeys, activeKey, onNavigate]);
}
