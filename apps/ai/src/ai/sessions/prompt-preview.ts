// What the NEXT run on this thread would send the model, broken down by where
// the bytes come from: system instructions, recalled history, tool schemas.
//
// RECONSTRUCTED, never captured. Storing each run's assembled prompt would
// duplicate the entire conversation on every turn (a 30k-token prompt is ~120KB
// of the user's own content) for a read almost nobody performs, and it would put
// a second copy of that content under a different retention rule than the thread
// it came from. Reconstruction costs nothing until someone asks.
//
// The trade is that this is the NEXT prompt, not the last one — it will not
// equal the `prompt_tokens` the context meter shows for the previous run, and
// callers must label it as such. That is also what makes it useful: it answers
// "why is my prompt this big" against the CURRENT thread, and it moves as you
// prune. Everything it cannot see is listed in `caveats` rather than silently
// omitted, because a size breakdown that quietly under-reports is worse than
// none.
import type { Agent } from "@mastra/core/agent";
import type { MastraMemory } from "@mastra/core/memory";
import { z } from "zod";

/**
 * Tokens per character, for the rough figures this endpoint reports. Nothing
 * here tokenizes: the real count is provider- and model-specific and arrives on
 * the run row afterwards. Four is the usual English/German prose ratio and it is
 * only ever used for RELATIVE weight — which section dominates — so labelling it
 * an estimate everywhere it surfaces matters more than its accuracy.
 */
const CHARS_PER_TOKEN = 4;

/** Per-message cap. A single pasted document should not dwarf the response. */
const MAX_MESSAGE_TEXT_CHARS = 40_000;

export interface PromptPreviewMessage {
  /** Serialized size of the whole message, parts included — not just its text. */
  chars: number;
  estimated_tokens: number;
  id: string | null;
  role: string;
  /** Human-readable rendering; tool parts collapse to a one-line marker. */
  text: string;
  text_truncated: boolean;
}

export interface PromptPreviewTool {
  chars: number;
  description: string | null;
  estimated_tokens: number;
  name: string;
  schema_chars: number;
  /** `none` = the schema could not be read, so this tool's weight is understated. */
  schema_source: PromptToolSchemaSource;
}

export interface ThreadPromptPreview {
  agent_id: string;
  /** What this reconstruction cannot see. Rendered verbatim in the UI. */
  caveats: string[];
  messages: PromptPreviewMessage[];
  model_id: string | null;
  /** Memory's own token count for the recalled window, when it reports one. */
  recalled_tokens: number | null;
  system: { chars: number; estimated_tokens: number; text: string };
  tools: PromptPreviewTool[];
  totals: {
    chars: number;
    estimated_tokens: number;
    message_chars: number;
    system_chars: number;
    tool_chars: number;
  };
}

export function estimateTokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN);
}

/**
 * `getInstructions` may hand back a string or the structured system-message form
 * depending on the agent. Both end up as one system block on the wire, so both
 * flatten to one string here.
 */
export function flattenInstructions(instructions: unknown): string {
  if (typeof instructions === "string") {
    return instructions;
  }
  if (Array.isArray(instructions)) {
    return instructions.map((entry) => flattenInstructions(entry)).join("\n\n");
  }
  if (instructions && typeof instructions === "object") {
    const content = (instructions as { content?: unknown }).content;
    if (content !== undefined) {
      return flattenInstructions(content);
    }
    const text = (instructions as { text?: unknown }).text;
    if (typeof text === "string") {
      return text;
    }
  }
  return "";
}

/**
 * Resolve the agent's assembled system instructions to a string.
 *
 * Call the method on the agent (keeps Mastra's `this`) with an empty
 * request-context bag. Extracting `getInstructions` and invoking it unbound
 * returns empty; calling with no argument can return the raw instructions
 * callback, which `flattenInstructions` also treats as empty. Prompt-preview
 * and the trajectory header share this helper so they cannot drift.
 */
export async function resolveAgentInstructions(agent: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getInstructions?: (...args: any[]) => unknown;
}): Promise<string> {
  if (typeof agent.getInstructions !== "function") {
    return "";
  }
  let raw: unknown = await Promise.resolve(agent.getInstructions({}));
  if (typeof raw === "function") {
    raw = await Promise.resolve((raw as (args?: unknown) => unknown)({}));
  }
  return flattenInstructions(raw).trim();
}

function renderMessagePart(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }
  if (!part || typeof part !== "object") {
    return "";
  }
  const record = part as {
    text?: unknown;
    toolName?: unknown;
    toolInvocation?: { toolName?: unknown };
    type?: unknown;
  };
  if (typeof record.text === "string") {
    return record.text;
  }
  // Tool parts are where the bytes hide, and dumping their arguments inline
  // would bury the conversation. The size is already counted in `chars`; the
  // reader only needs to know a call sits here.
  const toolName =
    (typeof record.toolName === "string" ? record.toolName : null) ??
    (typeof record.toolInvocation?.toolName === "string"
      ? record.toolInvocation.toolName
      : null);
  if (toolName) {
    return `[${String(record.type ?? "tool")}: ${toolName}]`;
  }
  return record.type ? `[${String(record.type)}]` : "";
}

export function renderMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content;
  }
  const parts =
    (Array.isArray(content) ? content : null) ??
    (content && typeof content === "object"
      ? ((content as { parts?: unknown }).parts as unknown[] | undefined)
      : undefined) ??
    ((message as { parts?: unknown }).parts as unknown[] | undefined);
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => renderMessagePart(part))
    .filter(Boolean)
    .join("\n");
}

/** Where a tool's measurable schema came from — `none` means it was not counted. */
export type PromptToolSchemaSource = "ai-sdk" | "json-schema" | "none" | "zod";

/**
 * A tool's input schema, in whichever of the three shapes it arrives in.
 *
 * By the time tools reach `getToolsForExecution` they are AI SDK `CoreTool`s,
 * whose `parameters` is usually the SDK's `Schema` wrapper — an object holding
 * an already-converted `jsonSchema`, not a Zod type. Handling only Zod silently
 * measured every tool at zero and put the entire tool section, normally the
 * heaviest one, at nothing. Hence the reported `source`: a section that cannot
 * be measured has to say so, not read as empty.
 */
function toJsonSchema(schema: unknown): {
  json: Record<string, unknown> | null;
  source: PromptToolSchemaSource;
} {
  if (schema == null || typeof schema !== "object") {
    return { json: null, source: "none" };
  }
  const record = schema as Record<string, unknown>;
  const wrapped = record.jsonSchema;
  if (wrapped && typeof wrapped === "object") {
    return { json: wrapped as Record<string, unknown>, source: "ai-sdk" };
  }
  try {
    return {
      json: z.toJSONSchema(schema as z.ZodType) as Record<string, unknown>,
      source: "zod",
    };
  } catch {
    // Not Zod. A bare JSON Schema is the remaining legal shape.
  }
  if (record.properties || typeof record.type === "string") {
    return { json: record, source: "json-schema" };
  }
  return { json: null, source: "none" };
}

/**
 * A tool's weight in the prompt: its name, description and the JSON Schema of
 * its input, which is what the provider actually receives. Descriptions read
 * small and schemas do not — an agent carrying dozens of tools routinely spends
 * more of its window on this section than on the conversation, which is the
 * single most common answer to "why is my prompt this big".
 */
export function describePromptTool(
  name: string,
  tool: unknown
): PromptPreviewTool {
  const record = (tool ?? {}) as {
    description?: unknown;
    inputSchema?: unknown;
    parameters?: unknown;
  };
  const description =
    typeof record.description === "string" ? record.description : null;
  // `parameters` is the AI SDK CoreTool field; `inputSchema` is the Mastra tool
  // field. Which one is populated depends on how far through conversion the tool
  // is, so try both rather than assuming the call site.
  const fromInput = toJsonSchema(record.inputSchema);
  const schema = fromInput.json ? fromInput : toJsonSchema(record.parameters);
  const schemaChars = schema.json ? JSON.stringify(schema.json).length : 0;
  const chars = name.length + (description?.length ?? 0) + schemaChars;
  return {
    chars,
    description,
    estimated_tokens: estimateTokens(chars),
    name,
    schema_chars: schemaChars,
    schema_source: schema.source,
  };
}

function readPromptMessageId(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const record = message as Record<string, unknown>;
  for (const key of ["id", "messageId"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  const content = record.content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const nestedId = (content as Record<string, unknown>).id;
    if (typeof nestedId === "string" && nestedId.trim()) {
      return nestedId.trim();
    }
  }
  return null;
}

export function describePromptMessage(message: unknown): PromptPreviewMessage {
  const record = (message ?? {}) as { role?: unknown };
  const rendered = renderMessageText(message);
  const truncated = rendered.length > MAX_MESSAGE_TEXT_CHARS;
  let serialized = 0;
  try {
    serialized = JSON.stringify(message)?.length ?? 0;
  } catch {
    serialized = rendered.length;
  }
  return {
    chars: serialized,
    estimated_tokens: estimateTokens(serialized),
    id: readPromptMessageId(message),
    role: typeof record.role === "string" ? record.role : "unknown",
    text: truncated ? rendered.slice(0, MAX_MESSAGE_TEXT_CHARS) : rendered,
    text_truncated: truncated,
  };
}

export interface BuildThreadPromptPreviewInput {
  agent: Pick<Agent, "getInstructions" | "getToolsForExecution">;
  agentId: string;
  /** Anything the caller knows this assembly is missing (see `caveats`). */
  caveats?: string[];
  memory: Pick<MastraMemory, "recall"> | null;
  modelId: string | null;
  resourceId: string;
  threadId: string;
}

export async function buildThreadPromptPreview(
  input: BuildThreadPromptPreviewInput
): Promise<ThreadPromptPreview> {
  const [systemText, tools, recalled] = await Promise.all([
    resolveAgentInstructions(input.agent),
    input.agent.getToolsForExecution({
      resourceId: input.resourceId,
      threadId: input.threadId,
    }),
    input.memory
      ? input.memory
          .recall({ resourceId: input.resourceId, threadId: input.threadId })
          // A thread with no memory rows yet is not an error — it is an empty
          // history, and the tool/system sections are the interesting part
          // anyway.
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const toolEntries = Object.entries(tools ?? {})
    .map(([name, tool]) => describePromptTool(name, tool))
    .sort((a, b) => b.chars - a.chars);
  const messages = ((recalled?.messages ?? []) as unknown[]).map((message) =>
    describePromptMessage(message)
  );

  const systemChars = systemText.length;
  const toolChars = toolEntries.reduce((sum, tool) => sum + tool.chars, 0);
  const messageChars = messages.reduce(
    (sum, message) => sum + message.chars,
    0
  );
  const chars = systemChars + toolChars + messageChars;

  const unreadableSchemas = toolEntries.filter(
    (tool) => tool.schema_source === "none"
  );
  const caveats = [...(input.caveats ?? [])];
  if (unreadableSchemas.length > 0) {
    // Reported rather than swallowed: an unread schema shows as a suspiciously
    // light tool, and the reader would conclude the tool section is cheap.
    caveats.push(
      `${unreadableSchemas.length} of ${toolEntries.length} tools exposed no readable input schema, so their weight is understated (${unreadableSchemas
        .slice(0, 5)
        .map((tool) => tool.name)
        .join(", ")}${unreadableSchemas.length > 5 ? ", …" : ""}).`
    );
  }

  return {
    agent_id: input.agentId,
    caveats,
    messages,
    model_id: input.modelId,
    recalled_tokens:
      typeof recalled?.usage?.tokens === "number"
        ? recalled.usage.tokens
        : null,
    system: {
      chars: systemChars,
      estimated_tokens: estimateTokens(systemChars),
      text: systemText,
    },
    tools: toolEntries,
    totals: {
      chars,
      estimated_tokens: estimateTokens(chars),
      message_chars: messageChars,
      system_chars: systemChars,
      tool_chars: toolChars,
    },
  };
}
