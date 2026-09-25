"use client";

// A transcript page loads in the slim view: a large tool result the collapsed
// transcript never reads arrives as a placeholder naming its row. The step
// that shows the result mounts only once someone opens it, so that is where
// the full row is fetched — once, then cached. Only a placeholder mounts the
// query; every other result renders straight through.
import { isSlimToolResult } from "@engenty/ai-core/browser";
import { type ReactNode, useContext } from "react";
import { useAppsAiThreadMessageQuery } from "../../../ag-ui/apps-ai/apps-ai-thread-api.js";
import { EngentyAIContext } from "../../../agent-provider/engenty-ai-provider.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** The result of `toolCallId` in a persisted row's parts, any stored shape. */
export function readToolResultFromParts(
  parts: unknown,
  toolCallId: string
): unknown {
  if (!Array.isArray(parts)) {
    return;
  }
  for (const part of parts) {
    if (!isRecord(part)) {
      continue;
    }
    const invocation = isRecord(part.toolInvocation)
      ? part.toolInvocation
      : null;
    const id = part.toolCallId ?? invocation?.toolCallId;
    if (id !== toolCallId) {
      continue;
    }
    return invocation ? (invocation.result ?? invocation.output) : part.output;
  }
}

interface FullToolOutputProps {
  /** Rendered with the stored output, then the full one once it loads. */
  children: (output: unknown) => ReactNode;
  output: unknown;
  toolCallId: string | undefined;
}

function SlimToolOutputLoader({
  children,
  output,
  toolCallId,
}: FullToolOutputProps) {
  const ai = useContext(EngentyAIContext);
  const slim = isSlimToolResult(output) ? output : null;
  const query = useAppsAiThreadMessageQuery({
    enabled: Boolean(slim && toolCallId && ai?.serviceBaseUrl),
    messageId: slim?.message_id ?? null,
    serviceBaseUrl: ai?.serviceBaseUrl ?? "",
    threadId: slim?.thread_id ?? null,
  });
  const full =
    toolCallId && query.data
      ? readToolResultFromParts(query.data.parts, toolCallId)
      : undefined;
  return <>{children(full ?? output)}</>;
}

/** `children(output)`, with a slim placeholder swapped for the full result. */
export function FullToolOutput(props: FullToolOutputProps) {
  if (!isSlimToolResult(props.output)) {
    return <>{props.children(props.output)}</>;
  }
  return <SlimToolOutputLoader {...props} />;
}
