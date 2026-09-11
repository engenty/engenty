import { canonicalModulePathname } from "@engenty/ai-core/browser";
import { type QueryClient, useQueryClient } from "@engenty/query-client";
import type {
  UiNavigationPrefetchContribution,
  UiNavigationPrefetchQueryClient,
} from "@engenty/ui-plugin-sdk";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const PREFETCH_COOLDOWN_MS = 25_000;

function scheduleIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(() => fn(), { timeout: 1200 });
    return () => cancelIdleCallback(id);
  }
  const t = window.setTimeout(fn, 0);
  return () => clearTimeout(t);
}

function resolveInternalPathname(href: string): string | null {
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) {
      return null;
    }
    return url.pathname;
  } catch {
    return null;
  }
}

function prefetchPathname(
  queryClient: QueryClient,
  pathname: string,
  contributions: UiNavigationPrefetchContribution[]
): void {
  for (const contribution of contributions) {
    const params = contribution.match(pathname);
    if (!params) {
      continue;
    }
    void Promise.resolve()
      .then(() =>
        contribution.prefetch({
          params,
          pathname,
          queryClient: queryClient as UiNavigationPrefetchQueryClient,
        })
      )
      .catch(() => {});
    return;
  }
}

/**
 * On hover/focus of same-origin module links, prefetches detail query data via TanStack Query
 * so the next navigation often hits warm cache (BrowserRouter has no RR7 framework prefetch).
 */
export function NavigationPrefetchRoot({
  navigationPrefetch,
}: {
  navigationPrefetch: UiNavigationPrefetchContribution[];
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const lastPrefetchAt = useRef(new Map<string, number>());
  const cancelIdleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onIntent = (event: Event) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      if (anchor.dataset.noPrefetch !== undefined) {
        return;
      }
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
        return;
      }
      const href$ = resolveInternalPathname(href);
      if (!href$) {
        return;
      }
      // Canonical, not raw. Inside a space every link a module renders points at
      // `/s/<key>/<segment>/…`, while every registered prefetch matcher is
      // written against `/mdl/<module>/…` — so the raw form failed this gate and
      // took ALL prefetching with it, for every module, whenever the user was in
      // a space. One normalisation here fixes each module's matcher at once.
      const pathname = canonicalModulePathname(href$);
      if (!pathname.startsWith("/mdl/")) {
        return;
      }
      if (pathname === canonicalModulePathname(location.pathname)) {
        return;
      }
      const now = Date.now();
      const last = lastPrefetchAt.current.get(pathname) ?? 0;
      if (now - last < PREFETCH_COOLDOWN_MS) {
        return;
      }
      lastPrefetchAt.current.set(pathname, now);

      cancelIdleRef.current?.();
      cancelIdleRef.current = scheduleIdle(() => {
        prefetchPathname(queryClient, pathname, navigationPrefetch);
        cancelIdleRef.current = null;
      });
    };

    document.addEventListener("mouseover", onIntent, { capture: true });
    document.addEventListener("focusin", onIntent, { capture: true });
    return () => {
      document.removeEventListener("mouseover", onIntent, { capture: true });
      document.removeEventListener("focusin", onIntent, { capture: true });
      cancelIdleRef.current?.();
      cancelIdleRef.current = null;
    };
  }, [queryClient, location.pathname, navigationPrefetch]);

  return null;
}
