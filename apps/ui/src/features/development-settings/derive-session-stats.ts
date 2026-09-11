import type { AiAdminThreadStats, AiThreadRecord } from "@engenty/ai-ui";

export type AiSessionStatus = AiThreadRecord["status"];

export interface SessionStatsSummary {
  activeSessions: number;
  byStatus: Record<AiSessionStatus, number>;
  completedSessions: number;
  failedSessions: number;
  lastMessageAt: string | null;
  totalRuns: number;
  totalSessions: number;
}

const ZERO_BY_STATUS: Record<AiSessionStatus, number> = {
  idle: 0,
  running: 0,
  waiting: 0,
  failed: 0,
  completed: 0,
};

/**
 * Normalizes the API stats payload into a UI-friendly summary so the page
 * stays declarative and the math is unit-tested in isolation.
 *
 * `activeSessions` rolls up `running` + `waiting`; "idle" sessions are surfaced
 * separately because they typically dominate counts and are not actionable.
 */
export function deriveSessionStatsSummary(
  stats: AiAdminThreadStats | null | undefined
): SessionStatsSummary {
  if (!stats) {
    return {
      totalSessions: 0,
      totalRuns: 0,
      activeSessions: 0,
      failedSessions: 0,
      completedSessions: 0,
      lastMessageAt: null,
      byStatus: { ...ZERO_BY_STATUS },
    };
  }
  const byStatus: Record<AiSessionStatus, number> = {
    ...ZERO_BY_STATUS,
    ...stats.threads_by_status,
  };
  return {
    totalSessions: stats.threads_total,
    totalRuns: stats.runs_total,
    activeSessions: byStatus.running + byStatus.waiting,
    failedSessions: byStatus.failed,
    completedSessions: byStatus.completed,
    lastMessageAt: stats.last_message_at,
    byStatus,
  };
}

/**
 * Friendly relative timestamp ("2m ago", "3h ago", "Just now") suitable for
 * stat rows. Falls back to `—` when the value is missing.
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  if (!iso) {
    return "—";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  const deltaMs = now.getTime() - parsed.getTime();
  if (deltaMs < 30_000) {
    return "Just now";
  }
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return parsed.toLocaleDateString();
}

export function formatRelativeTimeWithAbsolute(
  iso: string | null | undefined,
  now: Date = new Date()
): string {
  if (!iso) {
    return "—";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  return `${formatRelativeTime(iso, now)} (${parsed.toLocaleString()})`;
}
