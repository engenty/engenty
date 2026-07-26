import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { type ReactNode, useMemo } from "react";

export interface Breadcrumb {
  label: ReactNode;
  menuLabel?: string;
  to?: string;
}

/**
 * Standard page frame: drives the topbar breadcrumbs + actions via
 * `usePageConfig`. Pass `title` only when an in-page heading is still needed;
 * prefer topbar chrome so list bodies can sit higher.
 */
export function PageShell({
  breadcrumbs,
  title,
  actions,
  children,
  secondaryNavHeaderSlot,
  topbarChrome,
}: {
  actions?: ReactNode;
  breadcrumbs: Breadcrumb[];
  children: ReactNode;
  secondaryNavHeaderSlot?: ReactNode;
  title?: ReactNode;
  topbarChrome?: "default" | "contentBlend";
}) {
  const memoCrumbs = useMemo(
    () =>
      breadcrumbs.map((c) => ({
        label: c.label,
        ...(c.menuLabel ? { menuLabel: c.menuLabel } : {}),
        ...(c.to ? { to: c.to } : {}),
      })),
    [breadcrumbs]
  );

  usePageConfig({
    breadcrumbs: memoCrumbs,
    ...(actions === undefined ? {} : { actions }),
    ...(secondaryNavHeaderSlot === undefined ? {} : { secondaryNavHeaderSlot }),
    ...(topbarChrome === undefined ? {} : { topbarChrome }),
  });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      {title ? (
        <div className="flex items-center justify-between gap-4 p-page">
          <h1 className="font-semibold text-xl tracking-tight">{title}</h1>
        </div>
      ) : null}
      {children}
    </div>
  );
}
