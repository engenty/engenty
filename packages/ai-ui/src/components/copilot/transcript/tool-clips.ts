// Clips: the one-line, person-facing trace of what an agent DID in a turn.
//
// A clip exists only for a tool that changed something a person can see —
// opened a page, showed a guide, hired a colleague, added an app. Reading,
// searching, snapshotting and loading skills are the agent's own business
// and stay silent; developer mode keeps the full step list for those.
//
// Resolvers return an i18n key and values, not text, so the registry needs
// no translation function and a module can register clips for its own tools.
import {
  Bookmark,
  Compass,
  type LucideIcon,
  PackageMinus,
  PackagePlus,
  Signpost,
  UserPlus,
} from "lucide-react";
import {
  getToolName,
  getToolState,
  type ToolPartLike,
} from "./copilot-message-parts.js";

export interface ToolClip {
  /**
   * Consecutive clips of one group fold into one line — a five-step tour is
   * "Tour: 5 steps shown", not five lines. The key gets `{count}`.
   */
  group?: { key: string };
  /** In-app path the clip links to. */
  href?: string;
  icon: LucideIcon;
  /** `ai-ui` locale key. */
  textKey: string;
  values?: Record<string, string>;
}

export interface ToolClipInput {
  input: Record<string, unknown>;
  /** The tool's result, unwrapped from a frontend tool's `{ output }`. */
  output: Record<string, unknown>;
}

export type ToolClipResolver = (input: ToolClipInput) => ToolClip | null;

const resolvers = new Map<string, ToolClipResolver>();

/** A module registers the clip for a tool it owns; last registration wins. */
export function registerToolClip(
  toolName: string,
  resolver: ToolClipResolver
): void {
  resolvers.set(toolName, resolver);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readInput(part: ToolPartLike): Record<string, unknown> {
  if (typeof part.input === "string") {
    try {
      return asRecord(JSON.parse(part.input));
    } catch {
      return {};
    }
  }
  return asRecord(part.input);
}

function readOutput(part: ToolPartLike): Record<string, unknown> {
  const output = asRecord(part.output);
  const inner = asRecord(output.output);
  return Object.keys(inner).length > 0 ? inner : output;
}

/**
 * The clip for a finished tool call, or null: no clip registered, still
 * running, or failed. A failure is the developer view's business — the
 * agent says in words what it could not do.
 */
export function resolveToolClip(part: ToolPartLike): ToolClip | null {
  const toolName = getToolName(part);
  const resolver = toolName ? resolvers.get(toolName) : undefined;
  if (!resolver || getToolState(part) !== "completed") {
    return null;
  }
  const output = readOutput(part);
  if (output.ok === false) {
    return null;
  }
  return resolver({ input: readInput(part), output });
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** `/s/<key>/<section>/…` → the section's clip key; unknown pages stay generic. */
const PAGE_KEYS: Record<string, string> = {
  agents: "toolClip.page.agents",
  copilot: "toolClip.page.copilot",
  data: "toolClip.page.data",
  rooms: "toolClip.page.rooms",
  settings: "toolClip.page.settings",
};

export function navigatePageKey(path: string): string {
  const segments = path.split(/[?#]/)[0]?.split("/").filter(Boolean) ?? [];
  const section = segments[0] === "s" ? segments[2] : segments[0];
  if (!section) {
    return "toolClip.page.home";
  }
  if (section === "agents" && segments.length > (segments[0] === "s" ? 3 : 1)) {
    return "toolClip.page.agent";
  }
  return PAGE_KEYS[section] ?? "toolClip.page.other";
}

registerToolClip("navigate", ({ input, output }) => {
  const to = text(output.to) || text(input.to);
  if (!to) {
    return null;
  }
  return {
    href: to,
    icon: Compass,
    textKey: "toolClip.navigate",
    values: { page: navigatePageKey(to) },
  };
});

registerToolClip("show_ui_guide", ({ input }) => ({
  group: { key: "toolClip.guideGroup" },
  icon: Signpost,
  textKey: "toolClip.guide",
  values: { title: text(input.title) },
}));

registerToolClip("agent_propose", ({ input, output }) => {
  const name = text(input.name) || text(output.agent_id);
  return name && output.status === "active"
    ? { icon: UserPlus, textKey: "toolClip.agentHired", values: { name } }
    : null;
});

function moduleNames(input: Record<string, unknown>): string {
  const modules = Array.isArray(input.modules) ? input.modules : [];
  return modules
    .map((entry) => text(asRecord(entry).id) || text(entry))
    .filter(Boolean)
    .join(", ");
}

registerToolClip("space_setup", ({ input }) => {
  const names = moduleNames(input);
  if (!names) {
    return null;
  }
  if (input.action === "add") {
    return {
      icon: PackagePlus,
      textKey: "toolClip.appsAdded",
      values: { names },
    };
  }
  if (input.action === "remove") {
    return {
      icon: PackageMinus,
      textKey: "toolClip.appsRemoved",
      values: { names },
    };
  }
  return null;
});

registerToolClip("memory_note", ({ output }) =>
  output.kept === true
    ? { icon: Bookmark, textKey: "toolClip.remembered" }
    : null
);
