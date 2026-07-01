/**
 * Hub search field with FTS-first autocomplete (vector only when suggest is sparse),
 * keyboard navigation, and click-outside close.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, focusVisibleRingSubtle } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { ChevronRight, Search } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { KbArticleSuggestHit } from "../api.js";
import {
  suggestKbArticlesHybrid,
  suggestKbArticlesHybridMany,
} from "../kb-suggest-hybrid.js";
import {
  kbHubHeroSearchInputClassName,
  kbHubHeroSearchSuggestPanelClassName,
} from "../lib/kb-page-shell.js";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 220;
const SUGGEST_LIMIT = 8;

export interface KbHubSearchComboboxProps {
  disabled?: boolean;
  /** Pass a single KB id, or kbIds for multi-KB search. */
  kbId?: string;
  kbIds?: string[];
  onOpenArticle: (articleId: string, kbId?: string) => void;
  onSeeAll: (query: string) => void;
  onValueChange: (value: string) => void;
  value: string;
}

export function KbHubSearchCombobox({
  kbId,
  kbIds,
  value,
  onValueChange,
  onOpenArticle,
  onSeeAll,
  disabled = false,
}: KbHubSearchComboboxProps) {
  const { t } = useTranslation("kb");
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [suggestions, setSuggestions] = useState<KbArticleSuggestHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmed = value.trim();
  const effectiveKbIds = kbIds ?? (kbId ? [kbId] : []);
  const canQuery =
    trimmed.length >= MIN_CHARS && !disabled && effectiveKbIds.length > 0;
  const optionCount = suggestions.length + 1;

  useEffect(() => {
    if (!canQuery) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    const tmr = window.setTimeout(() => {
      setSuggestions([]);
      void (async () => {
        try {
          const hits =
            effectiveKbIds.length === 1
              ? await suggestKbArticlesHybrid(effectiveKbIds[0], trimmed, {
                  limit: SUGGEST_LIMIT,
                  signal: ac.signal,
                })
              : await suggestKbArticlesHybridMany(effectiveKbIds, trimmed, {
                  limit: SUGGEST_LIMIT,
                  signal: ac.signal,
                });
          if (!ac.signal.aborted) {
            setSuggestions(hits);
          }
        } catch {
          if (!ac.signal.aborted) {
            setSuggestions([]);
          }
        } finally {
          if (!ac.signal.aborted) {
            setLoading(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(tmr);
      ac.abort();
    };
  }, [canQuery, kbId, trimmed]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const showPanel =
    open &&
    !disabled &&
    effectiveKbIds.length > 0 &&
    trimmed.length >= MIN_CHARS;

  const moveActive = useCallback(
    (delta: number) => {
      if (!showPanel || optionCount === 0) {
        return;
      }
      setActiveIndex((i) => {
        if (i < 0) {
          return delta > 0 ? 0 : optionCount - 1;
        }
        const next = (i + delta + optionCount) % optionCount;
        return next;
      });
    },
    [optionCount, showPanel]
  );

  const activateCurrent = useCallback(() => {
    if (activeIndex >= 0 && activeIndex < suggestions.length) {
      onOpenArticle(
        suggestions[activeIndex].id,
        suggestions[activeIndex].kb_id
      );
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (activeIndex === suggestions.length) {
      onSeeAll(trimmed);
      setOpen(false);
      setActiveIndex(-1);
    }
  }, [activeIndex, onOpenArticle, onSeeAll, suggestions, trimmed]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!showPanel && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      if (trimmed.length >= MIN_CHARS) {
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
      return;
    }
    if (e.key === "Enter") {
      if (showPanel && activeIndex >= 0) {
        e.preventDefault();
        activateCurrent();
        return;
      }
      if (showPanel && !loading && suggestions.length > 0 && activeIndex < 0) {
        e.preventDefault();
        onOpenArticle(suggestions[0].id, suggestions[0].kb_id);
        setOpen(false);
      }
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        aria-activedescendant={
          showPanel && activeIndex >= 0
            ? `${baseId}-opt-${activeIndex}`
            : undefined
        }
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={showPanel}
        autoComplete="off"
        className={cn(kbHubHeroSearchInputClassName, focusVisibleRingSubtle)}
        disabled={disabled}
        id={`${baseId}-input`}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          if (!disabled && trimmed.length >= MIN_CHARS) {
            setOpen(true);
          }
        }}
        onKeyDown={onKeyDown}
        placeholder={t("hub.search_placeholder")}
        ref={inputRef}
        role="combobox"
        type="search"
        value={value}
      />

      {showPanel ? (
        <div
          className={kbHubHeroSearchSuggestPanelClassName}
          id={listboxId}
          role="listbox"
        >
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-muted-foreground text-sm">
              <AnimatedLoaderIcon
                className="shrink-0"
                play="always"
                size="sm"
              />
              {t("hub.searching")}
            </div>
          ) : null}

          {!loading && suggestions.length > 0 ? (
            <>
              <div className="px-2 py-1.5 text-muted-foreground text-xxs uppercase">
                {t("hub.suggested")}
              </div>
              <ul className="max-h-64 overflow-auto py-1">
                {suggestions.map((s, idx) => {
                  const active = idx === activeIndex;
                  return (
                    <li key={s.id} role="presentation">
                      <button
                        className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm ${
                          active ? "bg-accent" : "hover:bg-accent/80"
                        }`}
                        id={`${baseId}-opt-${idx}`}
                        onClick={() => {
                          onOpenArticle(s.id, s.kb_id);
                          setOpen(false);
                          setActiveIndex(-1);
                        }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        role="option"
                        type="button"
                      >
                        <span className="font-medium">{s.title}</span>
                        {s.headline ? (
                          <span className="line-clamp-2 text-muted-foreground text-xs">
                            {s.headline
                              .replace(/<[^>]*>/g, "")
                              .replace(/&lt;/g, "<")
                              .replace(/&gt;/g, ">")
                              .replace(/&amp;/g, "&")}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {!loading && canQuery && suggestions.length === 0 ? (
            <div className="px-3 py-3 text-muted-foreground text-sm">
              {t("hub.no_results")}
            </div>
          ) : null}

          {!loading && canQuery ? (
            <div className="border-t p-2">
              <Button
                className={`w-full ${
                  activeIndex === suggestions.length ? "ring-2 ring-ring" : ""
                }`}
                id={`${baseId}-opt-${suggestions.length}`}
                onClick={() => {
                  onSeeAll(trimmed);
                  setOpen(false);
                  setActiveIndex(-1);
                }}
                onMouseEnter={() => setActiveIndex(suggestions.length)}
                role="option"
                size="sm"
                type="button"
                variant="secondary"
              >
                {t("hub.see_all")}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {open && !disabled && trimmed.length > 0 && trimmed.length < MIN_CHARS ? (
        <div
          className={cn(
            kbHubHeroSearchSuggestPanelClassName,
            "px-3 py-2 text-muted-foreground text-sm"
          )}
        >
          {t("hub.search_min_chars")}
        </div>
      ) : null}
    </div>
  );
}
