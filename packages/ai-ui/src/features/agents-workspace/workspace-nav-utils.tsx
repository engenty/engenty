import type { LucideIcon } from "lucide-react";
import { Bot, Cpu, Plus } from "lucide-react";
import type { AiAgentEntry } from "../../lib/admin/ai-runtime-api";
import {
  ACTIVITY_ROOT_PATH,
  CONNECTIONS_ROOT_PATH,
  SKILLS_CATALOG_ROOT_PATH,
  WORKFLOWS_CATALOG_ROOT_PATH,
} from "./agent-workspace-url-state";

export const TENANT_SKILLS_FOLDER_ID = "__tenant__";
export const OVERVIEW_RECENT_SESSIONS = 5;

export type WorkspaceNavPrimaryTab =
  | "agents"
  | "sessions"
  | "skills"
  | "flows"
  | "connections";

export function workspaceNavPrimaryTabFromPathname(
  pathname: string
): WorkspaceNavPrimaryTab {
  if (
    pathname === ACTIVITY_ROOT_PATH ||
    pathname.startsWith(`${ACTIVITY_ROOT_PATH}/`)
  ) {
    return "sessions";
  }
  if (
    pathname === SKILLS_CATALOG_ROOT_PATH ||
    pathname.startsWith(`${SKILLS_CATALOG_ROOT_PATH}/`)
  ) {
    return "skills";
  }
  // A module workflow's detail page belongs to the same tab: it and the graph
  // it reconciles into are two views of one runnable.
  if (
    pathname === WORKFLOWS_CATALOG_ROOT_PATH ||
    pathname.startsWith(`${WORKFLOWS_CATALOG_ROOT_PATH}/`)
  ) {
    return "flows";
  }
  if (
    pathname === CONNECTIONS_ROOT_PATH ||
    pathname.startsWith(`${CONNECTIONS_ROOT_PATH}/`)
  ) {
    return "connections";
  }
  return "agents";
}

export function catalogQueryMatches(
  haystack: string,
  queryLower: string
): boolean {
  return haystack.toLowerCase().includes(queryLower);
}

export function compactTreeRowClass(active: boolean) {
  return `flex w-full min-w-0 items-center gap-2 rounded-sm py-1 pl-1 pr-1 text-left text-sm transition ${
    active
      ? "font-medium text-foreground"
      : "font-normal text-foreground hover:bg-muted/40"
  }`;
}

/** Same as {@link compactTreeRowClass} for a row that shares a horizontal strip with a trailing control. */
export function compactTreeRowClassFlexFill(active: boolean) {
  return `flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 pl-1 pr-1 text-left text-sm transition ${
    active
      ? "font-medium text-foreground"
      : "font-normal text-foreground hover:bg-muted/40"
  }`;
}

export function navButtonClass(active: boolean) {
  return `flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
    active
      ? "bg-muted/80 font-semibold text-foreground"
      : "font-normal text-foreground hover:bg-muted/50"
  }`;
}

export function AgentTreeIcon({ kind }: { kind: AiAgentEntry["kind"] }) {
  const Icon = kind === "system" ? Cpu : Bot;
  return (
    <Icon
      aria-hidden
      className="size-4 shrink-0 text-muted-foreground opacity-80"
    />
  );
}

export function CatalogTreeIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon
      aria-hidden
      className="size-4 shrink-0 text-muted-foreground opacity-80"
    />
  );
}

export function SidebarNewLinkRow({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`${compactTreeRowClass(false)} text-muted-foreground hover:text-foreground`}
      onClick={onClick}
      type="button"
    >
      <Plus aria-hidden className="size-4 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate leading-snug">{label}</span>
    </button>
  );
}
