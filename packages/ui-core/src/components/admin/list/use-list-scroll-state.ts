"use client";

import { type RefObject, useCallback, useLayoutEffect, useState } from "react";

export interface ListScrollState {
  /** Content overflows below the fold and the user is not at the bottom. */
  hasMoreBelow: boolean;
  /** The user has scrolled away from the top (sticky header is "stuck"). */
  scrolled: boolean;
}

/**
 * Tracks vertical scroll edges of a list scroll container — used to drive the
 * bottom fade (`hasMoreBelow`) and the sticky-header drop shadow (`scrolled`).
 * Re-measures on scroll, resize, and child mutations.
 */
export function useListScrollState(
  ref: RefObject<HTMLElement | null>
): ListScrollState {
  const [state, setState] = useState<ListScrollState>({
    hasMoreBelow: false,
    scrolled: false,
  });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const epsilon = 2;
    setState({
      hasMoreBelow: maxScroll > epsilon && scrollTop < maxScroll - epsilon,
      scrolled: scrollTop > epsilon,
    });
  }, [ref]);

  useLayoutEffect(() => {
    update();
    const el = ref.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update, ref]);

  return state;
}
