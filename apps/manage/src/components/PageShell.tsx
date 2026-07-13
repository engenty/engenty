import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { type ReactNode, useMemo } from "react";

export interface Breadcrumb {
  label: string;
  to?: string;
}

/**
 * Standard page frame: drives the topbar breadcrumbs via `usePageConfig` and
 * renders an optional title row with right-aligned actions above the body.
 */
export function PageShell({
  breadcrumbs,
  title,
  actions,
  children,
}: {
  actions?: ReactNode;
  breadcrumbs: Breadcrumb[];
  children: ReactNode;
  title?: ReactNode;
}) {
  const memoCrumbs = useMemo(
    () =>
      breadcrumbs.map((c) => ({
        label: c.label,
        ...(c.to ? { to: c.to } : {}),
      })),
    [breadcrumbs]
  );

  usePageConfig({ breadcrumbs: memoCrumbs });

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4 p-page">
          {title ? (
            <h1 className="font-semibold text-xl tracking-tight">{title}</h1>
          ) : (
            <span />
          )}
          {actions ? (
            <div className="flex items-center gap-2">{actions}</div>
          ) : null}
        </div>
      )}
      {children}
    </div>
  );
}
