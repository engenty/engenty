import {
  ToolCallCardBase,
  type ToolCallCardProps,
  useCopilotThreadBinding,
  useCopilotToolCallActions,
  useEngentyAIContext,
} from "@engenty/ai-ui";
import {
  ActionProvider,
  Renderer,
  registry,
  StateProvider,
  VisibilityProvider,
} from "@engenty/generative-ui";
import { useQuery } from "@engenty/query-client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { listAgentSessionMessages } from "../../../src/lib/agent-session-messages-client.js";
import { agentSessionMessagesQueryKey } from "../../lib/chat/chat-model.js";

interface GenerativeUiSpec {
  elements: Record<string, unknown>;
  root: string;
}

export type GenerativeUiToolPhase = "interactive" | "submitted" | "readonly";

interface ToolCallGenerativeUiCardProps extends ToolCallCardProps {
  onSubmitMessage?: (text: string) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ToolWidgetErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // The generic tool card still shows the tool shell; keep widget failures local.
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

/** Phase from lane tool part only — no parallel React state for widget lifecycle. */
export function resolveGenerativeUiToolPhase(
  props: Pick<ToolCallCardProps, "output" | "state">
): GenerativeUiToolPhase {
  if (props.state === "running" || props.state === "pending") {
    return "interactive";
  }
  if (props.state !== "completed" || !matchesGenerativeUiOutput(props.output)) {
    return "interactive";
  }
  const output = props.output as {
    phase?: unknown;
    submitted?: unknown;
  };
  if (
    output.phase === "submitted" ||
    output.phase === "readonly" ||
    output.submitted === true
  ) {
    return output.phase === "readonly" ? "readonly" : "submitted";
  }
  return "interactive";
}

export function ToolCallGenerativeUiCard(props: ToolCallGenerativeUiCardProps) {
  const { onSubmitMessage, output, toolName, displayLabel, state, ...rest } =
    props;
  const { submitMessage: contextSubmitMessage } = useCopilotToolCallActions();
  const submitMessage = onSubmitMessage ?? contextSubmitMessage;
  const spec =
    typeof output === "object" && output !== null && "spec" in output
      ? (output as { spec: unknown }).spec
      : null;

  if (!isRenderableGenerativeUiSpec(spec)) {
    return null;
  }

  const phase = resolveGenerativeUiToolPhase({ output, state });
  const headline = displayLabel ?? toolName;

  if (phase === "submitted" || phase === "readonly") {
    const summary =
      typeof output === "object" && output !== null
        ? readGenerativeUiSummary(output)
        : null;
    return (
      <ToolCallCardBase
        {...rest}
        defaultOpen={false}
        details={[]}
        headline={headline}
        state="completed"
      >
        <p className="mt-1 text-muted-foreground text-sm">
          {summary ?? "Submitted"}
        </p>
      </ToolCallCardBase>
    );
  }

  return (
    <ToolCallCardBase
      {...rest}
      defaultOpen
      details={[]}
      headline={headline}
      state={state}
    >
      <div className="mt-2 border-t pt-2">
        <StateProvider initialState={{}}>
          <VisibilityProvider>
            <ActionProvider
              handlers={{
                sendMessage: (params) => {
                  const text =
                    typeof params?.text === "string" ? params.text.trim() : "";
                  if (text) {
                    submitMessage(text);
                  }
                },
              }}
            >
              <ToolWidgetErrorBoundary>
                <Renderer
                  registry={registry}
                  spec={withDefaultChatActions(spec)}
                />
              </ToolWidgetErrorBoundary>
            </ActionProvider>
          </VisibilityProvider>
        </StateProvider>
      </div>
    </ToolCallCardBase>
  );
}

function readGenerativeUiSummary(
  output: Record<string, unknown>
): string | null {
  const summary = output.summary;
  if (typeof summary === "string" && summary.trim()) {
    return summary.trim();
  }
  return null;
}

export function matchesGenerativeUiOutput(output: unknown): boolean {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { __type?: unknown }).__type === "generative-ui" &&
    isRenderableGenerativeUiSpec((output as { spec?: unknown }).spec)
  );
}

export function matchesSubAgentSessionOutput(output: unknown): boolean {
  return getSubSessionId(output) != null;
}

export function SubAgentSessionToolCallCard(props: ToolCallCardProps) {
  const { output, toolName, ...rest } = props;
  const binding = useCopilotThreadBinding();
  const ai = useEngentyAIContext();
  const subSessionId = getSubSessionId(output);
  const summary = getOptionalString(output, "summary");
  const status = getOptionalString(output, "status");
  const messagesQuery = useQuery({
    enabled: Boolean(subSessionId && ai.isTransportReady),
    queryFn: ({ signal }) =>
      listAgentSessionMessages({
        limit: 50,
        serviceBaseUrl: ai.serviceBaseUrl,
        threadId: subSessionId ?? "",
        signal,
        tenantId: binding.tenantId,
        userId: binding.userId,
      }),
    queryKey: agentSessionMessagesQueryKey({
      threadId: subSessionId ?? "",
      tenantId: binding.tenantId,
      userId: binding.userId,
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
      <details className="mt-2 rounded-md border bg-card p-2 text-sm">
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

function isRenderableGenerativeUiSpec(
  value: unknown
): value is GenerativeUiSpec {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { root?: unknown }).root === "string" &&
    !!(value as { elements?: unknown }).elements &&
    typeof (value as { elements?: unknown }).elements === "object"
  );
}

function withDefaultChatActions(spec: GenerativeUiSpec): GenerativeUiSpec {
  const elements = Object.fromEntries(
    Object.entries(spec.elements).map(([key, element]) => [
      key,
      withDefaultElementChatAction(element),
    ])
  );
  return { ...spec, elements };
}

function withDefaultElementChatAction(element: unknown) {
  if (!element || typeof element !== "object") {
    return element;
  }
  const item = element as {
    on?: unknown;
    props?: Record<string, unknown>;
    type?: unknown;
  };
  if (
    item.type !== "Button" ||
    hasPressHandler(item.on) ||
    !item.props ||
    typeof item.props.label !== "string"
  ) {
    return element;
  }
  return {
    ...item,
    on: {
      ...(typeof item.on === "object" && item.on !== null ? item.on : {}),
      press: {
        action: "sendMessage",
        params: { text: item.props.label },
      },
    },
  };
}

function hasPressHandler(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    "press" in value &&
    (value as { press?: unknown }).press !== undefined
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
