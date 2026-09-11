import { useEffect, useMemo, useRef, useState } from "react";
import { rankSpaceCatalogRemote } from "./space-catalog-rank-api";
import {
  mergeSpaceCatalogSearch,
  rankSpaceCatalogLexically,
  type SpaceCatalogSearchEntry,
} from "./space-catalog-search";
import type { SpaceCatalogItem } from "./space-mount-catalog";

const SEARCH_DEBOUNCE_MS = 220;

export function useSpaceCatalogSearch<T extends SpaceCatalogSearchEntry>(
  items: readonly T[],
  query: string
): { items: T[]; pending: boolean } {
  const trimmed = query.trim();
  const lexical = useMemo(
    () => rankSpaceCatalogLexically(items, trimmed),
    [items, trimmed]
  );
  const catalogKey = useMemo(
    () => items.map((item) => item.id).join("\0"),
    [items]
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [semanticIds, setSemanticIds] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!trimmed) {
      setSemanticIds(null);
      setPending(false);
      return;
    }
    const controller = new AbortController();
    setSemanticIds(null);
    setPending(true);
    const timer = window.setTimeout(() => {
      void rankSpaceCatalogRemote(
        itemsRef.current as readonly SpaceCatalogItem[],
        trimmed,
        controller.signal
      )
        .then((ids) => {
          if (!controller.signal.aborted) {
            setSemanticIds(ids);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSemanticIds(null);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setPending(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [catalogKey, trimmed]);

  const ranked = useMemo(() => {
    if (!trimmed) {
      return [...items];
    }
    if (semanticIds == null) {
      return lexical;
    }
    return mergeSpaceCatalogSearch(items, lexical, semanticIds);
  }, [items, lexical, semanticIds, trimmed]);

  return {
    items: ranked,
    pending: Boolean(trimmed) && pending,
  };
}
