/**
 * Where closing the Data pane should put you back.
 *
 * The pane's X used to navigate to the Data root unconditionally. That is
 * right when you opened the pane FROM the tree — the pane closes and the tree
 * you were reading stays. It is wrong when you arrived from anywhere else: a
 * card on the home, the Work tab's Artifacts list. Closing then dropped you
 * into a file list you had never opened, with no way back to what you were
 * doing except the browser's own Back.
 *
 * So the link carries where it came from, and the pane honours it. Router
 * state rather than a query parameter: it is navigation history, not part of
 * the address, and it must not travel when someone copies the link.
 *
 * Not `navigate(-1)`: inside the tree, "back" is the previously selected node,
 * so X would open something instead of closing.
 */
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

const RETURN_KEY = "spaceDataReturn";

/** Spread into a `<Link state>` to make the pane come back here. */
export function useSpaceDataReturnState(): Record<string, string> {
  const location = useLocation();
  return useMemo(
    () => ({ [RETURN_KEY]: `${location.pathname}${location.search}` }),
    [location.pathname, location.search]
  );
}

export function readSpaceDataReturn(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }
  const value = (state as Record<string, unknown>)[RETURN_KEY];
  // Same-origin paths only — router state is not attacker-controlled here, but
  // a value that is not a rooted path is a bug, not a destination.
  return typeof value === "string" && value.startsWith("/") ? value : null;
}
