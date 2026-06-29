import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface ShellSecondaryNavContextValue {
  /** Current route exposes a module secondary column (role links + page slots). */
  hasSecondaryNav: boolean;
  /** User toggled the secondary column open (topbar control). */
  secondaryNavOpen: boolean;
  /**
   * Hold hover preview open while a portaled menu in the secondary nav header is open.
   * No-op when the column is pinned open.
   */
  setSecondaryNavHoverMenuOpen: (open: boolean) => void;
}

const ShellSecondaryNavContext =
  createContext<ShellSecondaryNavContextValue | null>(null);

const DEFAULT_SECONDARY_NAV: ShellSecondaryNavContextValue = {
  hasSecondaryNav: false,
  secondaryNavOpen: false,
  setSecondaryNavHoverMenuOpen: () => {},
};

export function ShellSecondaryNavProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ShellSecondaryNavContextValue;
}) {
  const memo = useMemo(
    () => value,
    [
      value.hasSecondaryNav,
      value.secondaryNavOpen,
      value.setSecondaryNavHoverMenuOpen,
    ]
  );
  return (
    <ShellSecondaryNavContext.Provider value={memo}>
      {children}
    </ShellSecondaryNavContext.Provider>
  );
}

/**
 * Shell secondary column state (module submenu + before/after slots). Safe outside provider: assumes no secondary column.
 */
export function useShellSecondaryNav(): ShellSecondaryNavContextValue {
  return useContext(ShellSecondaryNavContext) ?? DEFAULT_SECONDARY_NAV;
}
