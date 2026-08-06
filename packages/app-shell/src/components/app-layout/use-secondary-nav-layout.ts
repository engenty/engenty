import { usePageHeader } from "@engenty/ui-plugin-sdk";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useMediaQuery } from "../../hooks/use-media-query";
import { getSecondaryNavItems } from "../../lib/navigation";
import { createSecondaryNavHoverCloseController } from "../../lib/secondary-nav-hover-close";
import {
  isForeignDockSecondaryNavPreview,
  isSecondaryNavHoverOverlayOpen,
  shouldMountSecondaryNavHoverOverlay,
  shouldSkipSecondaryNavPinOpenTransition,
} from "../../lib/secondary-nav-hover-overlay";
import { SHELL_SECONDARY_NAV_PINNED_MIN_WIDTH_QUERY } from "../../lib/shell-secondary-nav-breakpoint";
import type { NavigationSection } from "../../types/shell";
import {
  SHELL_SECONDARY_NAV_PINNED_NOOP,
  type ShellSecondaryNavPinnedPersistence,
} from "../../types/shell-secondary-nav-pinned";
import { findNavIconForPath } from "../enrich-breadcrumb-nav-icon";
import { SECONDARY_NAV_HOVER_PREVIEW_SUPPRESS_MS } from "./constants";
import type { ModuleNavHeaderIcon, SecondaryNavLinkItem } from "./types";

type NavItemHover = NonNullable<NavigationSection["items"][number]>;

export interface UseSecondaryNavLayoutOptions {
  secondaryNavPersistence?: ShellSecondaryNavPinnedPersistence;
}

export function useSecondaryNavLayout(
  sections: NavigationSection[],
  options: UseSecondaryNavLayoutOptions = {}
) {
  const { secondaryNavPersistence = SHELL_SECONDARY_NAV_PINNED_NOOP } = options;
  const { pathname, search } = useLocation();
  const {
    secondaryNavAfterItems,
    secondaryNavAllowPinned,
    secondaryNavHeaderSlot,
    secondaryNavSearchResultsOnly,
    breadcrumbs,
  } = usePageHeader();

  const isWideScreen = useMediaQuery(
    SHELL_SECONDARY_NAV_PINNED_MIN_WIDTH_QUERY
  );
  const preferredPinnedOpen =
    secondaryNavPersistence.snapshot?.pinnedOpen ?? true;

  const [mobileOpen, setMobileOpen] = useState(false);
  const [secondaryNavOpen, setSecondaryNavOpenState] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.matchMedia(SHELL_SECONDARY_NAV_PINNED_MIN_WIDTH_QUERY)
      .matches;
  });
  const [secondaryNavHoverOpen, setSecondaryNavHoverOpen] = useState(false);
  const [suppressHoverViaClick, setSuppressHoverViaClick] = useState(false);
  const hoverCloseControllerRef = useRef(
    createSecondaryNavHoverCloseController()
  );
  const suppressSecondaryNavHoverPreviewUntilRef = useRef(0);
  const skipNextSecondaryNavOpenTransitionRef = useRef(false);

  const [hoveredNavItem, setHoveredNavItem] = useState<NavItemHover | null>(
    null
  );
  const navItemOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const navItemCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const setSecondaryNavOpen = useCallback(
    (open: boolean) => {
      // Overlay-only pages (e.g. full-page chat): never pin / reserve width.
      if (open && !secondaryNavAllowPinned) {
        return;
      }
      setSecondaryNavOpenState(open);
      if (isWideScreen && secondaryNavAllowPinned) {
        secondaryNavPersistence.mergePinned({ pinnedOpen: open });
      }
    },
    [isWideScreen, secondaryNavAllowPinned, secondaryNavPersistence]
  );

  // Narrow / overlay-only: always collapsed. Wide + pin allowed: apply user pref after hydrate.
  useEffect(() => {
    if (!(isWideScreen && secondaryNavAllowPinned)) {
      setSecondaryNavOpenState(false);
      return;
    }
    if (!secondaryNavPersistence.pinnedHydrated) {
      return;
    }
    setSecondaryNavOpenState(preferredPinnedOpen);
  }, [
    isWideScreen,
    preferredPinnedOpen,
    secondaryNavAllowPinned,
    secondaryNavPersistence.pinnedHydrated,
  ]);

  const shellSecondaryLinks: SecondaryNavLinkItem[] =
    getSecondaryNavItems(pathname, search, sections) ?? [];
  // `searchResultsOnly` only hides shell-registered role links from the panel;
  // it must NOT drop the custom after-items/header-slot from the column-mount
  // decision. A module that renders its own panel (and registers no shell links)
  // would otherwise oscillate: mounting the panel sets the flag → column drops →
  // panel unmounts → cleanup clears the flag → column remounts → infinite loop.
  const hasShellSecondaryLinks =
    !secondaryNavSearchResultsOnly && shellSecondaryLinks.length > 0;
  const hasSecondaryNav =
    hasShellSecondaryLinks ||
    secondaryNavAfterItems != null ||
    secondaryNavHeaderSlot != null;

  const moduleIcon = useMemo(
    () => findNavIconForPath(breadcrumbs, pathname, sections),
    [breadcrumbs, pathname, sections]
  );

  const overlayLinkList = hoveredNavItem?.children ?? shellSecondaryLinks;
  const foreignDockPreview = isForeignDockSecondaryNavPreview(hoveredNavItem);
  const overlayIncludePageSlots = !foreignDockPreview;
  const overlayOpen = isSecondaryNavHoverOverlayOpen({
    hoveredNavItem,
    secondaryNavHoverOpen,
    secondaryNavOpen,
  });
  const showHoverSecondaryColumn = shouldMountSecondaryNavHoverOverlay({
    hasSecondaryNav,
    hasSecondaryNavAfterItems: secondaryNavAfterItems != null,
    hasSecondaryNavHeaderSlot: secondaryNavHeaderSlot != null,
    hoveredNavItem,
    overlayLinkListLength: overlayLinkList.length,
    secondaryNavHoverOpen,
    secondaryNavOpen,
  });

  const moduleRootNavItem = useMemo((): ModuleNavHeaderIcon | null => {
    if (!(hasSecondaryNav && secondaryNavOpen)) {
      return null;
    }
    // When the sidebar header slot already shows the module label, suppress
    // the icon from the topbar to avoid doubling.
    if (secondaryNavHeaderSlot != null) {
      return null;
    }
    return moduleIcon;
  }, [hasSecondaryNav, secondaryNavOpen, moduleIcon, secondaryNavHeaderSlot]);

  const openHoverPanel = useCallback(() => {
    if (suppressHoverViaClick) {
      return;
    }
    if (Date.now() < suppressSecondaryNavHoverPreviewUntilRef.current) {
      return;
    }
    hoverCloseControllerRef.current.cancelScheduledClose();
    setSecondaryNavHoverOpen(true);
  }, [suppressHoverViaClick]);

  const closeSecondaryNavPinned = useCallback(() => {
    suppressSecondaryNavHoverPreviewUntilRef.current =
      Date.now() + SECONDARY_NAV_HOVER_PREVIEW_SUPPRESS_MS;
    setSuppressHoverViaClick(true);
    setSecondaryNavOpen(false);
  }, [setSecondaryNavOpen]);

  const closeHoverPanel = useCallback(() => {
    setSuppressHoverViaClick(false);
    hoverCloseControllerRef.current.scheduleClose(() =>
      setSecondaryNavHoverOpen(false)
    );
  }, []);

  const setSecondaryNavHoverMenuOpen = useCallback(
    (open: boolean) => {
      if (secondaryNavOpen) {
        return;
      }
      const controller = hoverCloseControllerRef.current;
      controller.setHoverMenuOpen(open);
      if (open) {
        openHoverPanel();
        return;
      }
      closeHoverPanel();
    },
    [closeHoverPanel, openHoverPanel, secondaryNavOpen]
  );

  const openNavItemHover = useCallback((item: NavItemHover) => {
    if (navItemCloseTimeoutRef.current) {
      clearTimeout(navItemCloseTimeoutRef.current);
      navItemCloseTimeoutRef.current = null;
    }
    if (navItemOpenTimeoutRef.current) {
      clearTimeout(navItemOpenTimeoutRef.current);
    }
    navItemOpenTimeoutRef.current = setTimeout(
      () => setHoveredNavItem(item),
      300
    );
  }, []);

  const closeNavItemHover = useCallback(() => {
    if (navItemOpenTimeoutRef.current) {
      clearTimeout(navItemOpenTimeoutRef.current);
      navItemOpenTimeoutRef.current = null;
    }
    navItemCloseTimeoutRef.current = setTimeout(
      () => setHoveredNavItem(null),
      150
    );
  }, []);

  const pinSecondaryNavFromHover = useCallback(() => {
    if (!secondaryNavAllowPinned) {
      return;
    }
    hoverCloseControllerRef.current.cancelScheduledClose();
    hoverCloseControllerRef.current.setHoverMenuOpen(false);
    if (navItemCloseTimeoutRef.current) {
      clearTimeout(navItemCloseTimeoutRef.current);
      navItemCloseTimeoutRef.current = null;
    }
    if (navItemOpenTimeoutRef.current) {
      clearTimeout(navItemOpenTimeoutRef.current);
      navItemOpenTimeoutRef.current = null;
    }
    setHoveredNavItem(null);
    if (
      shouldSkipSecondaryNavPinOpenTransition({
        secondaryNavOpen,
        trigger: "hover-pin",
      })
    ) {
      skipNextSecondaryNavOpenTransitionRef.current = true;
    }
    setSecondaryNavOpen(true);
  }, [secondaryNavAllowPinned, secondaryNavOpen, setSecondaryNavOpen]);

  useEffect(() => {
    if (secondaryNavOpen || !hasSecondaryNav) {
      hoverCloseControllerRef.current.cancelScheduledClose();
      hoverCloseControllerRef.current.setHoverMenuOpen(false);
      setSecondaryNavHoverOpen(false);
    }
  }, [secondaryNavOpen, hasSecondaryNav]);

  useLayoutEffect(() => {
    if (skipNextSecondaryNavOpenTransitionRef.current) {
      skipNextSecondaryNavOpenTransitionRef.current = false;
    }
  }, [secondaryNavOpen]);

  useEffect(
    () => () => {
      hoverCloseControllerRef.current.cancelScheduledClose();
      if (navItemOpenTimeoutRef.current) {
        clearTimeout(navItemOpenTimeoutRef.current);
      }
      if (navItemCloseTimeoutRef.current) {
        clearTimeout(navItemCloseTimeoutRef.current);
      }
    },
    []
  );

  const shellSecondaryNavValue = useMemo(
    () => ({
      hasSecondaryNav,
      secondaryNavOpen,
      setSecondaryNavHoverMenuOpen,
    }),
    [hasSecondaryNav, secondaryNavOpen, setSecondaryNavHoverMenuOpen]
  );

  return {
    closeHoverPanel,
    closeNavItemHover,
    closeSecondaryNavPinned,
    hasSecondaryNav,
    hoveredNavItem: foreignDockPreview ? hoveredNavItem : null,
    mobileOpen,
    moduleRootNavItem,
    openHoverPanel,
    openNavItemHover,
    overlayIncludePageSlots,
    overlayLinkList,
    overlayOpen,
    pathname,
    pinSecondaryNavFromHover,
    search,
    secondaryNavAllowPinned,
    secondaryNavOpen,
    setMobileOpen,
    setSecondaryNavOpen,
    shellSecondaryLinks,
    shellSecondaryNavValue,
    showHoverSecondaryColumn,
    navItemCloseTimeoutRef,
    skipNextSecondaryNavOpenTransitionRef,
  };
}
