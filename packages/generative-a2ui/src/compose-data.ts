import type { ChartPoint } from "./catalog/chart-data.js";

export type DashboardBlockId =
  | "metrics"
  | "categories"
  | "volume"
  | "senders"
  | "mail";

export const DASHBOARD_BLOCKS: readonly DashboardBlockId[] = [
  "metrics",
  "categories",
  "volume",
  "senders",
  "mail",
];

export const DASHBOARD_THREAD_LIMIT = 50;
const THREAD_BATCH = 20;

export interface DashboardMailItem {
  category: string;
  from: string;
  subject: string;
  when: string;
}

export interface DashboardMetric {
  caption: string;
  sparkline: ChartPoint[];
  value: string;
}

export interface InboxDashboardData {
  attention: DashboardMetric;
  categories: ChartPoint[];
  items: DashboardMailItem[];
  newsletters: DashboardMetric;
  senders: ChartPoint[];
  unread: DashboardMetric;
  volume: ChartPoint[];
}

/** The thread fields the dashboard reads — a subset of inbox list items. */
export interface InboxDashboardThread {
  last_message_at: string | null;
  latest_category: string | null;
  latest_from_email: string | null;
  latest_from_name: string | null;
  latest_snippet?: string | null;
  latest_status: string | null;
  subject: string | null;
  unhandled_count: number;
}

function dayOf(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function sparklineFrom(
  threads: readonly InboxDashboardThread[],
  match: (thread: InboxDashboardThread) => boolean
): ChartPoint[] {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    const day = dayOf(thread.last_message_at);
    if (!(day && match(thread))) {
      continue;
    }
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([label, value]) => ({ label, value }));
}

function metric(
  threads: readonly InboxDashboardThread[],
  match: (thread: InboxDashboardThread) => boolean,
  caption: string
): DashboardMetric {
  const value = threads.filter(match).length;
  return {
    caption,
    sparkline: sparklineFrom(threads, match),
    value: String(value),
  };
}

/**
 * Count tiles and series from inbox threads. Jev never sees these numbers —
 * it only chooses which prepared blocks to keep.
 */
export function aggregateInboxDashboard(
  threads: readonly InboxDashboardThread[]
): InboxDashboardData {
  const categories = new Map<string, number>();
  const senders = new Map<string, number>();
  for (const thread of threads) {
    const category = thread.latest_category ?? "conversation";
    categories.set(category, (categories.get(category) ?? 0) + 1);
    const from =
      thread.latest_from_name?.trim() ||
      thread.latest_from_email?.trim() ||
      "unknown";
    senders.set(from, (senders.get(from) ?? 0) + 1);
  }
  const items = threads.slice(0, THREAD_BATCH).map((thread) => ({
    category: thread.latest_category ?? "conversation",
    from:
      thread.latest_from_name?.trim() || thread.latest_from_email?.trim() || "",
    subject: thread.subject?.trim() || "(no subject)",
    when: dayOf(thread.last_message_at),
  }));
  return {
    attention: metric(
      threads,
      (t) => (t.unhandled_count ?? 0) > 0,
      "unhandled threads"
    ),
    categories: [...categories.entries()].map(([label, value]) => ({
      label,
      value,
    })),
    items,
    newsletters: metric(
      threads,
      (t) => t.latest_category === "newsletter",
      "newsletters"
    ),
    senders: [...senders.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value })),
    unread: metric(
      threads,
      (t) => t.latest_status === "new" || (t.unhandled_count ?? 0) > 0,
      "new or unhandled"
    ),
    volume: sparklineFrom(threads, () => true),
  };
}
