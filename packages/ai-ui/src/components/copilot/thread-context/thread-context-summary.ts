import {
  formatObjectRef,
  type ObjectRef,
  parseObjectRef,
  readObjectRenderMeta,
} from "@engenty/ai-core/browser";
import { resolveAgentDisplayName } from "../../../ag-ui/resolve-transcript-tool-display.js";
import { ACTIVE_COPILOT_AGENT_ID } from "../../../agent-provider/host-keys.js";
import {
  copilotChatSubRunPath,
  spaceCopilotChatPath,
} from "../../../copilot/copilot-chat-paths.js";
import { conversationEngagement } from "../../../features/agent-desk/agent-desk-url.js";
import { spaceAgentDeskPath } from "../../../features/agent-form/hire-spaces.js";
import { readChatAttachmentPart } from "../../../lib/chat-attachment-part.js";
import { readChatReferencePart } from "../../../lib/chat-reference-part.js";
import { collectWebSearchResults } from "../tool-call/tool-call-card-utils.js";
import {
  getToolName,
  getToolResolvedName,
  isSubAgentDelegationTool,
  isToolPart,
  type ToolPartLike,
} from "../transcript/copilot-message-parts.js";
import type {
  ThreadContextAgentItem,
  ThreadContextAttachmentItem,
  ThreadContextMessageLike,
  ThreadContextObjectItem,
  ThreadContextSourceItem,
  ThreadContextSummary,
} from "./thread-context-types.js";

const MD_INTERNAL_LINK =
  /\[([^\]]+)\]\(\s*(?:https?:\/\/[^/)\s]+)?(\/mdl\/[^)\s]+?)\s*\)/g;

const MD_KB_LINK =
  /\[([^\]]+)\]\(\s*((?:https?:\/\/[^/]+)?(\/kb\/|\/mdl\/knowledge-base\/)([a-zA-Z0-9-]{36}|[a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)(?:#L\d+(?:-L?\d+)?)?)\s*\)/gi;

const PLAIN_KB_LINK =
  /(?:Artikel\s+"([^"]+)"\s*-\s*)?((?:https?:\/\/[^/]+)?(\/kb\/|\/mdl\/knowledge-base\/)([a-zA-Z0-9-]{36}|[a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)(?:#L\d+(?:-L?\d+)?)?)/gi;

const DATA_MOUNT_PATH =
  /(?:^|[\s(`"'[=])(\/data\/[^\s)`'"\]>,]+)(?=$|[\s)`'"\]>,])/g;

export function spaceKeyFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/s\/([^/]+)/);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Compatibility-only 404 guard for stale transcript links.
 *
 * Older replies sometimes named a non-module path directly below `/data`.
 * Current model guidance forbids that shape. Keep those historical links
 * openable under the real Files module without teaching new runs to emit it.
 */
const SPACE_DATA_MODULE_ROOT = /^[A-Z][A-Za-z0-9]+$/;
const SPACE_DATA_FILES_ROOT = "Files";

export function resolveLegacySpaceData404GuardPath(dataPath: string): string {
  const treePath = dataPath.replace(/^\/data\/?/, "").replace(/^\/+/, "");
  if (!treePath) {
    return "";
  }
  const root = treePath.split("/")[0] ?? "";
  if (root && SPACE_DATA_MODULE_ROOT.test(root)) {
    return treePath;
  }
  return `${SPACE_DATA_FILES_ROOT}/${treePath}`;
}

function spaceDataHref(spaceKey: string, dataPath: string): string {
  const treePath = resolveLegacySpaceData404GuardPath(dataPath);
  return `/s/${encodeURIComponent(spaceKey)}/data?path=${encodeURIComponent(treePath)}`;
}

function spaceAgentContextHref(
  spaceKey: string,
  agentId: string,
  childThreadId?: string | null
): string {
  const thread = childThreadId?.trim() ?? "";
  if (agentId === ACTIVE_COPILOT_AGENT_ID) {
    return spaceCopilotChatPath(spaceKey, thread);
  }
  const desk = spaceAgentDeskPath(spaceKey, agentId);
  if (!thread) {
    return desk;
  }
  return `${desk}?engagement=${encodeURIComponent(conversationEngagement(thread))}`;
}

function collectDataPaths(text: string): string[] {
  const paths: string[] = [];
  DATA_MOUNT_PATH.lastIndex = 0;
  let match: RegExpExecArray | null;
  while (true) {
    match = DATA_MOUNT_PATH.exec(text);
    if (!match) {
      break;
    }
    const path = match[1]?.replace(/[.,;:]+$/, "") ?? "";
    if (path.startsWith("/data/")) {
      paths.push(path);
    }
  }
  return paths;
}

function toolPathHint(value: unknown): string[] {
  if (typeof value === "string") {
    return collectDataPaths(` ${value} `);
  }
  if (!isRecord(value)) {
    return [];
  }
  const paths: string[] = [];
  for (const key of ["path", "file", "result", "message"] as const) {
    const field = value[key];
    if (typeof field === "string") {
      paths.push(...collectDataPaths(` ${field} `));
    }
  }
  return paths;
}

export interface ThreadContextHrefMatcher {
  getHref?: (ref: ObjectRef) => string | null;
  matchHref?: (pathname: string) => ObjectRef | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function partText(part: unknown): string {
  if (!isRecord(part)) {
    return "";
  }
  if (typeof part.text === "string") {
    return part.text;
  }
  if (part.type === "text" && typeof part.text === "string") {
    return part.text;
  }
  return "";
}

function messageText(message: ThreadContextMessageLike): string {
  const parts = message.parts ?? [];
  return parts.map(partText).filter(Boolean).join("\n");
}

function pushSource(
  items: ThreadContextSourceItem[],
  seen: Set<string>,
  title: string,
  url: string
) {
  const trimmed = url.trim();
  if (!trimmed || seen.has(trimmed)) {
    return;
  }
  seen.add(trimmed);
  items.push({
    title: title.trim() || trimmed,
    url: trimmed,
  });
}

/** KB markdown / plain links, web_search URLs, and `/data` module-record paths. */
export function extractThreadSources(
  messages: readonly ThreadContextMessageLike[],
  spaceKey?: string | null
): ThreadContextSourceItem[] {
  const items: ThreadContextSourceItem[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    const text = messageText(message);
    if (text) {
      MD_KB_LINK.lastIndex = 0;
      let mdMatch: RegExpExecArray | null;
      while (true) {
        mdMatch = MD_KB_LINK.exec(text);
        if (!mdMatch) {
          break;
        }
        pushSource(
          items,
          seen,
          mdMatch[1]?.trim() || mdMatch[5]?.trim() || "Reference",
          mdMatch[2]?.trim() || ""
        );
      }

      PLAIN_KB_LINK.lastIndex = 0;
      let plainMatch: RegExpExecArray | null;
      while (true) {
        plainMatch = PLAIN_KB_LINK.exec(text);
        if (!plainMatch) {
          break;
        }
        pushSource(
          items,
          seen,
          plainMatch[1]?.trim() || plainMatch[5]?.trim() || "Reference",
          plainMatch[2]?.trim() || ""
        );
      }

      if (spaceKey) {
        for (const dataPath of collectDataPaths(` ${text} `)) {
          pushSource(
            items,
            seen,
            dataPath.slice("/data/".length) || dataPath,
            spaceDataHref(spaceKey, dataPath)
          );
        }
      }
    }

    for (const part of message.parts ?? []) {
      if (!isToolPart(part)) {
        continue;
      }
      const toolName = getToolName(part);
      const resolved = getToolResolvedName(part, toolName);
      if (resolved.includes("web_search")) {
        for (const result of collectWebSearchResults(part.output)) {
          if (result.url) {
            pushSource(items, seen, result.title ?? result.url, result.url);
          }
        }
      }
      if (spaceKey) {
        for (const dataPath of [
          ...toolPathHint(part.input),
          ...toolPathHint(part.output),
        ]) {
          pushSource(
            items,
            seen,
            dataPath.slice("/data/".length) || dataPath,
            spaceDataHref(spaceKey, dataPath)
          );
        }
      }
    }
  }

  return items;
}

/** User-message image/document attachments, deduped by storage key or URL. */
export function extractThreadAttachments(
  messages: readonly ThreadContextMessageLike[]
): ThreadContextAttachmentItem[] {
  const items: ThreadContextAttachmentItem[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (readChatReferencePart(part)) {
        continue;
      }
      const meta = readChatAttachmentPart(part);
      if (!meta) {
        continue;
      }
      const key = meta.storageKey.trim() || meta.url?.trim() || "";
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push({
        filename: meta.filename,
        mimeType: meta.mimeType,
        storageKey: meta.storageKey,
        ...(meta.url ? { url: meta.url } : {}),
      });
    }
  }

  return items;
}

/** `show_objects` tool output + `/mdl/…` prose mention chips, deduped by ref. */
export function extractThreadObjects(
  messages: readonly ThreadContextMessageLike[],
  matchers: readonly ThreadContextHrefMatcher[]
): ThreadContextObjectItem[] {
  const items: ThreadContextObjectItem[] = [];
  const seen = new Set<string>();

  const pushObject = (ref: ObjectRef, title: string, href?: string | null) => {
    const key = formatObjectRef(ref);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const resolvedHref =
      href ??
      matchers.map((m) => m.getHref?.(ref) ?? null).find(Boolean) ??
      null;
    items.push({ ref, title: title.trim() || key, href: resolvedHref });
  };

  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (!isRecord(part)) {
        continue;
      }
      const meta = readObjectRenderMeta(part.output);
      if (!meta) {
        continue;
      }
      const titleByRef = new Map(
        meta.items.map((item) => [item.ref, item.title] as const)
      );
      for (const raw of meta.refs) {
        const ref = parseObjectRef(raw);
        if (!ref) {
          continue;
        }
        pushObject(ref, titleByRef.get(raw) ?? raw);
      }
    }

    const text = messageText(message);
    if (!(text.includes("/mdl/") && matchers.length > 0)) {
      continue;
    }
    MD_INTERNAL_LINK.lastIndex = 0;
    let match: RegExpExecArray | null;
    while (true) {
      match = MD_INTERNAL_LINK.exec(text);
      if (!match) {
        break;
      }
      const title = match[1]?.trim();
      const pathname = match[2]?.trim();
      if (!(title && pathname)) {
        continue;
      }
      for (const matcher of matchers) {
        const ref = matcher.matchHref?.(pathname) ?? null;
        if (ref) {
          pushObject(ref, title, pathname);
          break;
        }
      }
    }
  }

  return items;
}

function readSubAgentId(part: ToolPartLike, toolName: string): string | null {
  const resolved = toolName.startsWith("agent-")
    ? toolName
    : getToolResolvedName(part, toolName);
  if (resolved.startsWith("agent-")) {
    const agentId = resolved.slice("agent-".length).trim();
    return agentId || null;
  }
  if (
    (toolName === "message_agent" || resolved === "message_agent") &&
    isRecord(part.input) &&
    typeof part.input.agent_id === "string"
  ) {
    return part.input.agent_id.trim() || null;
  }
  return null;
}

function readChildThreadId(output: unknown): string | null {
  if (!isRecord(output) || typeof output.child_thread_id !== "string") {
    return null;
  }
  const childThreadId = output.child_thread_id.trim();
  return childThreadId || null;
}

function threadAgentHref(input: {
  agentId: string;
  childThreadId: string | null;
  spaceKey?: string | null;
  threadId?: string | null;
  toolCallId: string;
}): string | undefined {
  const spaceKey = input.spaceKey?.trim() ?? "";
  if (spaceKey) {
    return spaceAgentContextHref(spaceKey, input.agentId, input.childThreadId);
  }
  const thread = input.threadId?.trim() ?? "";
  if (thread) {
    return copilotChatSubRunPath(thread, input.toolCallId);
  }
  return;
}

/**
 * Sync Mastra delegations (`agent-*`) and `message_agent` turns, unique by
 * agent id. Later runs of the same specialist replace earlier ones so the row
 * opens the latest desk / monitor.
 */
export function extractThreadAgents(
  messages: readonly ThreadContextMessageLike[],
  threadId?: string | null,
  spaceKey?: string | null
): ThreadContextAgentItem[] {
  const byAgentId = new Map<string, ThreadContextAgentItem>();

  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (!isToolPart(part)) {
        continue;
      }
      const toolName = getToolName(part);
      if (!isSubAgentDelegationTool(part, toolName)) {
        continue;
      }
      const toolCallId = part.toolCallId?.trim() ?? "";
      const agentId = readSubAgentId(part, toolName);
      if (!(toolCallId && agentId)) {
        continue;
      }
      const href = threadAgentHref({
        agentId,
        childThreadId: readChildThreadId(part.output),
        spaceKey,
        threadId,
        toolCallId,
      });
      byAgentId.set(agentId, {
        agentId,
        agentName: resolveAgentDisplayName(agentId),
        toolCallId,
        ...(href ? { href } : {}),
      });
    }
  }

  return [...byAgentId.values()];
}

export function buildThreadContextSummary(input: {
  artefacts: ThreadContextSummary["artefacts"];
  messages: readonly ThreadContextMessageLike[];
  matchers?: readonly ThreadContextHrefMatcher[];
  spaceKey?: string | null;
  threadId?: string | null;
}): ThreadContextSummary {
  const artefacts = input.artefacts;
  const agents = extractThreadAgents(
    input.messages,
    input.threadId,
    input.spaceKey
  );
  const attachments = extractThreadAttachments(input.messages);
  const objects = extractThreadObjects(input.messages, input.matchers ?? []);
  const sources = extractThreadSources(input.messages, input.spaceKey);
  return {
    agents,
    artefacts,
    attachments,
    objects,
    sources,
    isEmpty:
      agents.length === 0 &&
      artefacts.length === 0 &&
      attachments.length === 0 &&
      objects.length === 0 &&
      sources.length === 0,
  };
}
