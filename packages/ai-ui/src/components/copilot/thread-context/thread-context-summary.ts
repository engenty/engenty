import {
  formatObjectRef,
  type ObjectRef,
  parseObjectRef,
  readObjectRenderMeta,
} from "@engenty/ai-core/browser";
import { collectWebSearchResults } from "../tool-call/tool-call-card-utils.js";
import {
  getToolName,
  getToolResolvedName,
  isToolPart,
} from "../transcript/copilot-message-parts.js";
import type {
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

/** KB markdown / plain links + web_search result URLs across the thread. */
export function extractThreadSources(
  messages: readonly ThreadContextMessageLike[]
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
    }

    for (const part of message.parts ?? []) {
      if (!isToolPart(part)) {
        continue;
      }
      const toolName = getToolName(part);
      const resolved = getToolResolvedName(part, toolName);
      if (!resolved.includes("web_search")) {
        continue;
      }
      for (const result of collectWebSearchResults(part.output)) {
        if (result.url) {
          pushSource(items, seen, result.title ?? result.url, result.url);
        }
      }
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

export function buildThreadContextSummary(input: {
  artefacts: ThreadContextSummary["artefacts"];
  messages: readonly ThreadContextMessageLike[];
  matchers?: readonly ThreadContextHrefMatcher[];
}): ThreadContextSummary {
  const artefacts = input.artefacts;
  const objects = extractThreadObjects(input.messages, input.matchers ?? []);
  const sources = extractThreadSources(input.messages);
  return {
    artefacts,
    objects,
    sources,
    isEmpty:
      artefacts.length === 0 && objects.length === 0 && sources.length === 0,
  };
}
