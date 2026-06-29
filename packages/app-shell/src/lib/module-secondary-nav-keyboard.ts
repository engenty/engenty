/** Mark focusable rows inside `ModuleSecondaryNavPanel` for arrow-key navigation. */
export const SHELL_SECONDARY_NAV_ITEM_ATTR = "data-shell-secondary-nav-item";

/** Spread onto `Input` / `Link` / anchors in the module secondary column. */
export const shellSecondaryNavItemProps = {
  [SHELL_SECONDARY_NAV_ITEM_ATTR]: "",
} as const;

export function collectShellSecondaryNavFocusables(
  root: HTMLElement
): HTMLElement[] {
  const nodeList = root.querySelectorAll<HTMLElement>(
    `[${SHELL_SECONDARY_NAV_ITEM_ATTR}]`
  );
  const out: HTMLElement[] = [];
  for (const el of nodeList) {
    if (el.hasAttribute("disabled")) {
      continue;
    }
    if (el.closest("[hidden]")) {
      continue;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      continue;
    }
    out.push(el);
  }
  return out;
}

export function focusShellSecondaryNavNeighbor(
  root: HTMLElement,
  direction: "down" | "up"
): boolean {
  const items = collectShellSecondaryNavFocusables(root);
  const active = document.activeElement;
  const idx = active instanceof HTMLElement ? items.indexOf(active) : -1;
  if (idx === -1) {
    return false;
  }
  const nextIdx = direction === "down" ? idx + 1 : idx - 1;
  if (nextIdx < 0 || nextIdx >= items.length) {
    return false;
  }
  const el = items[nextIdx];
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}
