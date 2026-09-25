import {
  ToolCallCardBase,
  type ToolCallCardProps,
  useCopilotRiver,
  useEngentyAIContext,
} from "@engenty/ai-ui";
import { useQuery } from "@engenty/query-client";
import { listAgentThreadMessages } from "../../../src/lib/agent-thread-messages-client.js";
import { agentSessionMessagesQueryKey } from "../../lib/chat/chat-model.js";

export function matchesSubAgentSessionOutput(output: unknown): boolean {
  return getSubSessionId(output) != null;
}

export function SubAgentSessionToolCallCard(props: ToolCallCardProps) {
  const { output, toolName, ...rest } = props;
  const river = useCopilotRiver();
  const ai = useEngentyAIContext();
  const subSessionId = getSubSessionId(output);
  const summary = getOptionalString(output, "summary");
  const status = getOptionalString(output, "status");
  const messagesQuery = useQuery({
    enabled: Boolean(subSessionId && ai.isTransportReady),
    queryFn: ({ signal }) =>
      listAgentThreadMessages({
        limit: 50,
        serviceBaseUrl: ai.serviceBaseUrl,
        threadId: subSessionId ?? "",
        signal,
        tenantId: river.tenantId,
        userId: river.userId,
      }),
    queryKey: agentSessionMessagesQueryKey({
      threadId: subSessionId ?? "",
      tenantId: river.tenantId,
      userId: river.userId,
    }),
  });
  if (!subSessionId) {
    return null;
  }
  const messageCount = messagesQuery.data?.length ?? 0;
  const latestAssistantText = latestAssistantMessageText(messagesQuery.data);

  return (
    <ToolCallCardBase
      {...rest}
      defaultOpen={false}
      details={[
        `Session: ${subSessionId}`,
        ...(status ? [`Status: ${status}`] : []),
      ]}
      headline={props.displayLabel ?? toolName}
    >
      <details className="ui-card-panel mt-2 p-2 text-sm">
        <summary className="cursor-pointer font-medium">
          Sub-agent thread
          {messageCount > 0 ? ` (${messageCount} messages)` : ""}
        </summary>
        <div className="mt-2 space-y-2 text-muted-foreground">
          {summary ? <p>{summary}</p> : null}
          {messagesQuery.isLoading ? <p>Loading sub-agent thread...</p> : null}
          {messagesQuery.isError ? (
            <p>Failed to load sub-agent thread.</p>
          ) : null}
          {latestAssistantText ? (
            <p className="whitespace-pre-wrap text-foreground">
              {latestAssistantText}
            </p>
          ) : null}
        </div>
      </details>
    </ToolCallCardBase>
  );
}

function getSubSessionId(output: unknown) {
  return getOptionalString(output, "sub_thread_id");
}

function getOptionalString(output: unknown, key: string) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const value = (output as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function latestAssistantMessageText(
  messages:
    | Array<{
        parts: unknown;
        role: string;
      }>
    | undefined
) {
  for (const message of [...(messages ?? [])].reverse()) {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) {
      continue;
    }
    const text = message.parts
      .map((part) =>
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : ""
      )
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }
  return null;
}
