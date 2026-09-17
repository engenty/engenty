import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

/**
 * Shell topbar presentation. The default is transparent on the page; `band` opts into a card strip
 * so the bar visually merges with the main canvas `background` (reader-style).
 */
/**
 * How the topbar sits on the page. `"default"` is transparent on the main
 * area's own surface — the topbar is part of the page, not a bar over it.
 * `"band"` is the opt-in for a page that needs a distinct sticky strip (a
 * dense list with controls in the topbar); it paints `bg-card` and wider
 * density, still without a border.
 */
export type PageTopbarChrome = "default" | "band";

/** Paints the shell column + main for Ember paper stacks (`--paper` / `--paper-2`). */
export type PageContentStackBackground = "default" | "paper" | "card";

function isPrimitiveBreadcrumbLabel(
  label: PageBreadcrumb["label"]
): label is string | number {
  return typeof label === "string" || typeof label === "number";
}

function arePageBreadcrumbLabelsEqual(
  a: PageBreadcrumb,
  b: PageBreadcrumb
): boolean {
  if (a.label === b.label) {
    return true;
  }
  // ReactNode pickers get a new element when their props change — never collapse
  // those updates via menuLabel alone (e.g. async team catalog loading).
  if (
    !(
      isPrimitiveBreadcrumbLabel(a.label) && isPrimitiveBreadcrumbLabel(b.label)
    )
  ) {
    return false;
  }
  if (
    a.menuLabel != null &&
    b.menuLabel != null &&
    a.menuLabel === b.menuLabel
  ) {
    return true;
  }
  return false;
}

function arePageBreadcrumbsEqual(
  a: PageBreadcrumb[],
  b: PageBreadcrumb[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((item, index) => {
    const other = b[index];
    if (!other) {
      return false;
    }
    return (
      item.to === other.to &&
      item.compactKept === other.compactKept &&
      arePageBreadcrumbLabelsEqual(item, other) &&
      item.compactLabel === other.compactLabel &&
      item.menuLabel === other.menuLabel &&
      item.tooltip === other.tooltip
    );
  });
}

export interface PageBreadcrumb {
  /** When true, this segment stays visible in compact layout (e.g. KB picker). */
  compactKept?: boolean;
  /** Shown instead of `label` for the first segment in compact (narrow) layouts. */
  compactLabel?: ReactNode;
  /** First segment: show icon instead of text (tooltip shows title). */
  icon?: ReactNode;
  label: ReactNode;
  /** Plain-text label for overflow menus when `label` is not a string. */
  menuLabel?: string;
  to?: string;
  /** Tooltip for {@link icon} (defaults from label / menuLabel). */
  tooltip?: string;
}

/** Registered by agents workspace shell so AppTopbar can toggle the tree sidebar. */
export interface AgentsWorkspaceNavRegistration {
  /** Called when the mouse enters the toggle button while the sidebar is closed. */
  onHoverEnter?: () => void;
  /** Called when the mouse leaves the toggle button while the sidebar is closed. */
  onHoverLeave?: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  /**
   * Width of the open sidebar in pixels — AppTopbar uses this to extend the
   * sidebar bg-card into the topbar area so the background is seamless.
   */
  sidebarWidthPx?: number;
  toggleAriaLabelWhenClosed: string;
  toggleAriaLabelWhenOpen: string;
}

interface PageHeaderContextValue {
  actions: ReactNode;
  agentsWorkspaceNav: AgentsWorkspaceNavRegistration | null;
  breadcrumbs: PageBreadcrumb[];
  /** Topbar column + in-page hero alignment for the blended topbar (see `paper` stack). */
  contentStackBackground: PageContentStackBackground;
  /**
   * A control the page hangs on the route (space) crumb — the desk's
   * conversation switcher. Rendered right after that crumb's label.
   */
  routeBreadcrumbAction: ReactNode;
  /** Rendered in the shell secondary nav column below module submenu links (e.g. recents). */
  secondaryNavAfterItems: ReactNode;
  /**
   * When false, the module secondary column may only open as a hover overlay — never
   * pinned inline (no layout width). Defaults to true.
   */
  secondaryNavAllowPinned: boolean;
  /** Rendered in the shell secondary nav column above module submenu links (e.g. search). */
  secondaryNavBeforeItems: ReactNode;
  /**
   * Rendered in the secondary nav column's header row (same vertical level as topbar).
   * Modules use this to place a top-level context switcher (e.g. KB picker) next to the
   * toggle button. When this slot is filled and the sidebar is open, pages should omit
   * the matching breadcrumb segment from the topbar.
   */
  secondaryNavHeaderSlot: ReactNode;
  /** When true, app shell hides secondary column role links + after slot (search-only column). */
  secondaryNavSearchResultsOnly: boolean;
  topbarChrome: PageTopbarChrome;
  /**
   * When true, the topbar is positioned absolutely over the content area instead of
   * in normal flex flow, so the transparent topbar floats over a full-bleed
   * hero/cover at the top of the scroll area.
   */
  topbarOverlap: boolean;
}

interface PageHeaderDispatchContextValue {
  setActions: (actions: ReactNode) => void;
  setAgentsWorkspaceNavRegistration: (
    registration: AgentsWorkspaceNavRegistration | null
  ) => void;
  setBreadcrumbs: (breadcrumbs: PageBreadcrumb[]) => void;
  setContentStackBackground: (value: PageContentStackBackground) => void;
  setRouteBreadcrumbAction: (node: ReactNode) => void;
  setSecondaryNavAfterItems: (node: ReactNode) => void;
  setSecondaryNavAllowPinned: (value: boolean) => void;
  setSecondaryNavBeforeItems: (node: ReactNode) => void;
  setSecondaryNavHeaderSlot: (node: ReactNode) => void;
  setSecondaryNavSearchResultsOnly: (value: boolean) => void;
  setTopbarChrome: (chrome: PageTopbarChrome) => void;
  setTopbarOverlap: (overlap: boolean) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);
const PageHeaderDispatchContext =
  createContext<PageHeaderDispatchContextValue | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [breadcrumbs, setBreadcrumbsState] = useState<PageBreadcrumb[]>([]);
  const [actions, setActionsState] = useState<ReactNode>(null);
  const [routeBreadcrumbAction, setRouteBreadcrumbActionState] =
    useState<ReactNode>(null);
  const [agentsWorkspaceNav, setAgentsWorkspaceNavState] =
    useState<AgentsWorkspaceNavRegistration | null>(null);
  const [secondaryNavBeforeItems, setSecondaryNavBeforeItemsState] =
    useState<ReactNode>(null);
  const [secondaryNavAfterItems, setSecondaryNavAfterItemsState] =
    useState<ReactNode>(null);
  const [secondaryNavAllowPinned, setSecondaryNavAllowPinnedState] =
    useState(true);
  const [secondaryNavHeaderSlot, setSecondaryNavHeaderSlotState] =
    useState<ReactNode>(null);
  const [secondaryNavSearchResultsOnly, setSecondaryNavSearchResultsOnlyState] =
    useState(false);
  const [topbarChrome, setTopbarChromeState] =
    useState<PageTopbarChrome>("default");
  const [topbarOverlap, setTopbarOverlapState] = useState(false);
  const [contentStackBackground, setContentStackBackgroundState] =
    useState<PageContentStackBackground>("default");

  const setBreadcrumbs = useCallback((nextBreadcrumbs: PageBreadcrumb[]) => {
    setBreadcrumbsState((prev) =>
      arePageBreadcrumbsEqual(prev, nextBreadcrumbs) ? prev : nextBreadcrumbs
    );
  }, []);

  const setActions = useCallback((nextActions: ReactNode) => {
    setActionsState((prev) =>
      Object.is(prev, nextActions) ? prev : nextActions
    );
  }, []);

  const setRouteBreadcrumbAction = useCallback((node: ReactNode) => {
    setRouteBreadcrumbActionState((prev) =>
      Object.is(prev, node) ? prev : node
    );
  }, []);

  const setAgentsWorkspaceNavRegistration = useCallback(
    (registration: AgentsWorkspaceNavRegistration | null) => {
      setAgentsWorkspaceNavState((prev) =>
        Object.is(prev, registration) ? prev : registration
      );
    },
    []
  );

  const setSecondaryNavBeforeItems = useCallback((node: ReactNode) => {
    setSecondaryNavBeforeItemsState((prev) =>
      Object.is(prev, node) ? prev : node
    );
  }, []);

  const setSecondaryNavAfterItems = useCallback((node: ReactNode) => {
    setSecondaryNavAfterItemsState((prev) =>
      Object.is(prev, node) ? prev : node
    );
  }, []);

  const setSecondaryNavAllowPinned = useCallback((value: boolean) => {
    setSecondaryNavAllowPinnedState((prev) => (prev === value ? prev : value));
  }, []);

  const setSecondaryNavHeaderSlot = useCallback((node: ReactNode) => {
    setSecondaryNavHeaderSlotState((prev) =>
      Object.is(prev, node) ? prev : node
    );
  }, []);

  const setSecondaryNavSearchResultsOnly = useCallback((value: boolean) => {
    setSecondaryNavSearchResultsOnlyState((prev) =>
      prev === value ? prev : value
    );
  }, []);

  const setTopbarChrome = useCallback((chrome: PageTopbarChrome) => {
    setTopbarChromeState((prev) => (prev === chrome ? prev : chrome));
  }, []);

  const setTopbarOverlap = useCallback((overlap: boolean) => {
    setTopbarOverlapState((prev) => (prev === overlap ? prev : overlap));
  }, []);

  const setContentStackBackground = useCallback(
    (value: PageContentStackBackground) => {
      setContentStackBackgroundState((prev) => (prev === value ? prev : value));
    },
    []
  );

  const stateValue = useMemo(
    () => ({
      actions,
      agentsWorkspaceNav,
      breadcrumbs,
      contentStackBackground,
      routeBreadcrumbAction,
      secondaryNavAfterItems,
      secondaryNavAllowPinned,
      secondaryNavBeforeItems,
      secondaryNavHeaderSlot,
      secondaryNavSearchResultsOnly,
      topbarChrome,
      topbarOverlap,
    }),
    [
      actions,
      agentsWorkspaceNav,
      breadcrumbs,
      contentStackBackground,
      routeBreadcrumbAction,
      secondaryNavAfterItems,
      secondaryNavAllowPinned,
      secondaryNavBeforeItems,
      secondaryNavHeaderSlot,
      secondaryNavSearchResultsOnly,
      topbarChrome,
      topbarOverlap,
    ]
  );
  const dispatchValue = useMemo(
    () => ({
      setActions,
      setAgentsWorkspaceNavRegistration,
      setBreadcrumbs,
      setContentStackBackground,
      setRouteBreadcrumbAction,
      setSecondaryNavAfterItems,
      setSecondaryNavAllowPinned,
      setSecondaryNavBeforeItems,
      setSecondaryNavHeaderSlot,
      setSecondaryNavSearchResultsOnly,
      setTopbarChrome,
      setTopbarOverlap,
    }),
    [
      setActions,
      setAgentsWorkspaceNavRegistration,
      setBreadcrumbs,
      setContentStackBackground,
      setRouteBreadcrumbAction,
      setSecondaryNavAfterItems,
      setSecondaryNavAllowPinned,
      setSecondaryNavBeforeItems,
      setSecondaryNavHeaderSlot,
      setSecondaryNavSearchResultsOnly,
      setTopbarChrome,
      setTopbarOverlap,
    ]
  );

  return (
    <PageHeaderDispatchContext.Provider value={dispatchValue}>
      <PageHeaderContext.Provider value={stateValue}>
        {children}
      </PageHeaderContext.Provider>
    </PageHeaderDispatchContext.Provider>
  );
}

export function usePageHeader() {
  const context = useContext(PageHeaderContext);
  if (!context) {
    throw new Error("usePageHeader must be used within a PageHeaderProvider.");
  }
  return context;
}

function usePageHeaderDispatch() {
  const context = useContext(PageHeaderDispatchContext);
  if (!context) {
    throw new Error(
      "usePageHeaderDispatch must be used within a PageHeaderProvider."
    );
  }
  return context;
}

/**
 * Registers agents workspace sidebar open state with the shell topbar (toggle before breadcrumbs).
 * Clear on unmount via the effect cleanup.
 */
export function useAgentsWorkspaceNavRegistration(
  registration: AgentsWorkspaceNavRegistration
) {
  const { setAgentsWorkspaceNavRegistration } = usePageHeaderDispatch();

  useLayoutEffect(() => {
    setAgentsWorkspaceNavRegistration(registration);
  }, [
    registration,
    registration.open,
    registration.setOpen,
    registration.toggleAriaLabelWhenClosed,
    registration.toggleAriaLabelWhenOpen,
    setAgentsWorkspaceNavRegistration,
  ]);

  useEffect(
    () => () => setAgentsWorkspaceNavRegistration(null),
    [setAgentsWorkspaceNavRegistration]
  );
}

/**
 * When `active`, app shell hides secondary column role links + after slot (search-only column).
 * Clears on unmount or when `active` becomes false.
 */
export function useSecondaryNavSearchResultsOnly(active: boolean) {
  const { setSecondaryNavSearchResultsOnly } = usePageHeaderDispatch();

  useLayoutEffect(() => {
    setSecondaryNavSearchResultsOnly(active);
    return () => setSecondaryNavSearchResultsOnly(false);
  }, [active, setSecondaryNavSearchResultsOnly]);
}

export function usePageConfig(config: {
  actions?: ReactNode;
  breadcrumbs?: PageBreadcrumb[];
  /**
   * `paper`: shell column uses `--paper` behind the transparent topbar.
   * `card`: the same, with `--card` (white) so a document fills the pane
   * without wrapping a nested sheet.
   */
  contentStackBackground?: PageContentStackBackground;
  /** A control hung on the route (space) crumb, after its label. Resets on unmount. */
  routeBreadcrumbAction?: ReactNode;
  secondaryNavAfterItems?: ReactNode;
  /**
   * When false, secondary nav is overlay-only (never pinned open / no layout width).
   * Defaults to true. Resets on unmount.
   */
  secondaryNavAllowPinned?: boolean;
  secondaryNavBeforeItems?: ReactNode;
  /**
   * Content placed in the secondary nav column's header row (same vertical level as the
   * topbar). Typically a KB/module context switcher. When this is set and the sidebar is
   * open, the matching top-level breadcrumb segment should be suppressed in the topbar.
   */
  secondaryNavHeaderSlot?: ReactNode;
  /** When set, adjusts shell topbar chrome for reader-style pages. Resets on unmount. */
  topbarChrome?: PageTopbarChrome;
  /**
   * When true, the topbar is positioned absolutely over the content area so content
   * can start from the very top of the main column
   * for a full-bleed hero/cover that flows under the transparent topbar. Resets on unmount.
   */
  topbarOverlap?: boolean;
}) {
  const {
    actions,
    breadcrumbs,
    contentStackBackground,
    routeBreadcrumbAction,
    secondaryNavAfterItems,
    secondaryNavAllowPinned,
    secondaryNavBeforeItems,
    secondaryNavHeaderSlot,
    topbarChrome,
    topbarOverlap,
  } = config;
  const registersActions = Object.hasOwn(config, "actions");
  const {
    setActions,
    setBreadcrumbs,
    setContentStackBackground,
    setRouteBreadcrumbAction,
    setSecondaryNavAfterItems,
    setSecondaryNavAllowPinned,
    setSecondaryNavBeforeItems,
    setSecondaryNavHeaderSlot,
    setTopbarChrome,
    setTopbarOverlap,
  } = usePageHeaderDispatch();

  // Update slots when inputs change. Do not clear in this effect's cleanup:
  // cleanup runs before the next effect when deps change, which would reset to
  // empty/null and defeat equality guards — causing setState every render when
  // parents pass new array/ReactNode references with the same content.
  useLayoutEffect(() => {
    setBreadcrumbs(breadcrumbs ?? []);
  }, [breadcrumbs, setBreadcrumbs]);

  useLayoutEffect(() => () => setBreadcrumbs([]), [setBreadcrumbs]);

  useLayoutEffect(() => {
    if (registersActions) {
      setActions(actions ?? null);
    }
  }, [actions, registersActions, setActions]);

  useLayoutEffect(() => {
    if (!registersActions) {
      return;
    }
    return () => setActions(null);
  }, [registersActions, setActions]);

  useLayoutEffect(() => {
    setSecondaryNavBeforeItems(secondaryNavBeforeItems ?? null);
  }, [secondaryNavBeforeItems, setSecondaryNavBeforeItems]);

  useLayoutEffect(
    () => () => setSecondaryNavBeforeItems(null),
    [setSecondaryNavBeforeItems]
  );

  useLayoutEffect(() => {
    setSecondaryNavAfterItems(secondaryNavAfterItems ?? null);
  }, [secondaryNavAfterItems, setSecondaryNavAfterItems]);

  useLayoutEffect(
    () => () => setSecondaryNavAfterItems(null),
    [setSecondaryNavAfterItems]
  );

  useLayoutEffect(() => {
    setSecondaryNavAllowPinned(secondaryNavAllowPinned ?? true);
  }, [secondaryNavAllowPinned, setSecondaryNavAllowPinned]);

  useLayoutEffect(
    () => () => setSecondaryNavAllowPinned(true),
    [setSecondaryNavAllowPinned]
  );

  useLayoutEffect(() => {
    setSecondaryNavHeaderSlot(secondaryNavHeaderSlot ?? null);
  }, [secondaryNavHeaderSlot, setSecondaryNavHeaderSlot]);

  useLayoutEffect(
    () => () => setSecondaryNavHeaderSlot(null),
    [setSecondaryNavHeaderSlot]
  );

  useLayoutEffect(() => {
    setTopbarChrome(topbarChrome ?? "default");
  }, [setTopbarChrome, topbarChrome]);

  useLayoutEffect(() => () => setTopbarChrome("default"), [setTopbarChrome]);

  useLayoutEffect(() => {
    setContentStackBackground(contentStackBackground ?? "default");
  }, [contentStackBackground, setContentStackBackground]);

  useLayoutEffect(
    () => () => setContentStackBackground("default"),
    [setContentStackBackground]
  );

  useLayoutEffect(() => {
    setTopbarOverlap(topbarOverlap ?? false);
  }, [topbarOverlap, setTopbarOverlap]);

  useLayoutEffect(() => () => setTopbarOverlap(false), [setTopbarOverlap]);

  useLayoutEffect(() => {
    setRouteBreadcrumbAction(routeBreadcrumbAction ?? null);
  }, [routeBreadcrumbAction, setRouteBreadcrumbAction]);

  useLayoutEffect(
    () => () => setRouteBreadcrumbAction(null),
    [setRouteBreadcrumbAction]
  );
}
