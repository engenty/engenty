/**
 * The cross-space work overview (`/work`) is a list of TABS, and every module
 * with work to show registers its own — the way projects registers a column
 * into the tasks list. Tasks owns the page and its first tab; the page itself
 * never names another module, so a tenant without Projects simply has one tab.
 *
 * A tab's `load` reads the module's own list route with no `space_id`: core
 * narrows that to the spaces the caller may see, so no tab decides who sees
 * which space. The page only groups and filters what it is given.
 */
import type { ReactNode } from "react";

export interface WorkTabRows<T> {
  rows: T[];
  total: number;
}

export interface WorkTabLoadParams {
  /** Only rows assigned to the viewer — tabs that opt in via `supportsMine`. */
  mine: boolean;
  /** One space, or null for every space the caller may see. */
  spaceId: string | null;
}

export interface WorkTabColumn<T> {
  className?: string;
  key: string;
  label: string;
  labelKey?: string;
  /** The cell that opens the row inside its space. One per tab. */
  link?: boolean;
  render: (row: T) => ReactNode;
}

export interface WorkTab<T = unknown> {
  columns: WorkTabColumn<T>[];
  /** Where a row opens — inside its own space. */
  href: (row: T, spaceKey: string) => string;
  id: string;
  label: string;
  labelKey?: string;
  /** Newest first, capped by the module's own page maximum. */
  load: (
    params: WorkTabLoadParams,
    signal?: AbortSignal
  ) => Promise<WorkTabRows<T>>;
  order?: number;
  rowKey: (row: T) => string;
  spaceIdOf: (row: T) => string | null;
  /** The row's status; present when the tab offers a status filter. */
  statusOf?: (row: T) => string;
  /** Whether "Assigned to me" applies to this tab. */
  supportsMine?: boolean;
}

export interface WorkTabsApi {
  registerWorkTab: <T>(tab: WorkTab<T>) => void;
}

const workTabs = new Map<string, WorkTab<unknown>>();

export function resetWorkTabs() {
  workTabs.clear();
}

export function registerWorkTab<T>(tab: WorkTab<T>) {
  workTabs.set(tab.id, tab as unknown as WorkTab<unknown>);
}

export function getWorkTabs(): WorkTab<unknown>[] {
  return Array.from(workTabs.values()).sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0)
  );
}

/** Date cell text: the viewer's locale, or the raw value when unparsable. */
export function formatWorkDate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
